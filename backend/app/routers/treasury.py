from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from app import models, schemas
from app.database import get_db
from app.auth import get_current_user, require_ops_manager, verify_password, generate_transaction_ref
from app.services.accounting import AccountingService
from app.audit import AuditLogger

router = APIRouter(prefix="/treasury", tags=["Treasury Management"])

@router.get("/accounts", response_model=List[schemas.TreasuryAccountResponse])
async def get_treasury_accounts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all active treasury accounts for the current branch"""
    return db.query(models.TreasuryAccount).filter(
        models.TreasuryAccount.branch_id == current_user.branch_id,
        models.TreasuryAccount.is_active == True
    ).all()

@router.post("/vault-adjustment", response_model=schemas.VaultTransferResponse)
async def vault_adjustment(
    request: Request,
    adj: schemas.VaultAdjustmentRequest,
    current_user: models.User = Depends(require_ops_manager),
    db: Session = Depends(get_db)
):
    """
    Genesis Deposit: Debit Vault (1010), Credit Retained Earnings (3010).
    Used to set the initial physical cash balance in the system.
    """
    branch = db.query(models.Branch).filter(models.Branch.id == current_user.branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    vault_gl = branch.gl_vault_code or "1010"
    retained_gl = "3010" # Retained Earnings / Startup Capital
    
    transfer = models.VaultTransfer(
        transfer_ref=f"ADJ-{generate_transaction_ref()}",
        transfer_type=models.VaultTransferType.VAULT_ADJUSTMENT,
        branch_id=current_user.branch_id,
        amount=adj.amount,
        status=models.VaultTransferStatus.APPROVED, # Adjustments by Ops Manager are auto-approved
        description=adj.description,
        created_by=current_user.id,
        approved_by=current_user.id,
        approved_at=datetime.utcnow()
    )
    db.add(transfer)
    
    # Record GL Entry
    AccountingService.record_transaction(
        db=db,
        transaction_id=transfer.transfer_ref,
        transaction_type="VAULT_ADJUSTMENT",
        amount=adj.amount,
        description=adj.description,
        created_by=current_user.id,
        debit_gl_code=vault_gl,
        credit_gl_code=retained_gl
    )
    
    db.commit()
    db.refresh(transfer)
    
    # Log the adjustment
    audit = AuditLogger(db, current_user, request)
    audit.log("VAULT_ADJUSTMENT", "Branch", str(branch.id), description=f"Initial Injection: {adj.amount} FCFA")
    
    return transfer


@router.post("/transfer/request", response_model=schemas.VaultTransferResponse)
async def request_transfer(
    request: Request,
    data: schemas.VaultTransferRequestData,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiate a cash transfer request (Morning Float, Vault Drop, or External Treasury Sweep).
    Does not affect GL until approved by a manager (or Board if > limit).
    """
    # Role-based validation
    if data.transfer_type == models.VaultTransferType.TELLER_TO_VAULT:
        if current_user.role != models.UserRole.TELLER:
             raise HTTPException(status_code=403, detail="Only Tellers can initiate Vault Drops")
    elif data.transfer_type == models.VaultTransferType.VAULT_TO_TELLER:
        if current_user.role != models.UserRole.TELLER:
             raise HTTPException(status_code=403, detail="Only Tellers can request Morning Floats")
    elif data.transfer_type in [
        models.VaultTransferType.VAULT_TO_EXTERNAL,
        models.VaultTransferType.EXTERNAL_TO_DIGITAL,
        models.VaultTransferType.DIGITAL_TO_EXTERNAL
    ]:
         if current_user.role not in [models.UserRole.OPS_MANAGER, models.UserRole.BRANCH_MANAGER, models.UserRole.SYSTEM_ADMIN]:
              raise HTTPException(status_code=403, detail="Only Managers can initiate external treasury transfers")

    transfer = models.VaultTransfer(
        transfer_ref=generate_transaction_ref(),
        transfer_type=data.transfer_type,
        branch_id=current_user.branch_id,
        teller_id=current_user.id if current_user.role == models.UserRole.TELLER else None,
        source_treasury_id=data.source_treasury_id,
        destination_treasury_id=data.destination_treasury_id,
        amount=data.amount,
        status=models.VaultTransferStatus.PENDING,
        description=data.description or f"{data.transfer_type} Request",
        created_by=current_user.id
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    
    return transfer


@router.get("/transfers/pending", response_model=List[schemas.VaultTransferResponse])
async def get_pending_transfers(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all pending cash transfers for the manager's branch"""
    return db.query(models.VaultTransfer).filter(
        models.VaultTransfer.branch_id == current_user.branch_id,
        models.VaultTransfer.status == models.VaultTransferStatus.PENDING
    ).all()


@router.post("/transfer/{transfer_id}/approve", response_model=schemas.VaultTransferResponse)
async def approve_transfer(
    transfer_id: int,
    approval: schemas.VaultTransferApprovalReq,
    request: Request,
    current_user: models.User = Depends(require_ops_manager),
    db: Session = Depends(get_db)
):
    """
    Manager authorization for a cash transfer.
    If approved, posts the double-entry transaction to the GL.
    """
    # 1. Verify Manager PIN (Stored in hashed form)
    if not current_user.teller_pin or not verify_password(approval.manager_pin, current_user.teller_pin):
        raise HTTPException(status_code=401, detail="Invalid Manager PIN")

    transfer = db.query(models.VaultTransfer).filter(
        models.VaultTransfer.id == transfer_id,
        models.VaultTransfer.branch_id == current_user.branch_id
    ).first()
    
    if not transfer or transfer.status != models.VaultTransferStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending transfer request not found")

    if not approval.approved:
        transfer.status = models.VaultTransferStatus.REJECTED
        transfer.approved_by = current_user.id
        transfer.approved_at = datetime.utcnow()
        db.commit()
        return transfer

    # Maker-Checker Limit: Transfers > 5,000,000 FCFA need Board/Admin approval
    if transfer.amount > Decimal("5000000") and current_user.role not in [models.UserRole.BOARD_MEMBER, models.UserRole.SYSTEM_ADMIN]:
        raise HTTPException(status_code=403, detail="Transfers exceeding 5,000,000 FCFA require Board/Admin approval")

    # 2. GL Posting Logic
    branch = db.query(models.Branch).filter(models.Branch.id == transfer.branch_id).first()
    vault_gl = branch.gl_vault_code or "1010"
    
    # Resolve Teller GL
    teller_gl_code = "1020" # Standard teller cash account fallback
    if transfer.teller_id:
        teller = db.query(models.User).filter(models.User.id == transfer.teller_id).first()
        if teller and teller.teller_gl_account_id:
            gl_acc = db.query(models.GLAccount).filter(models.GLAccount.id == teller.teller_gl_account_id).first()
            if gl_acc:
                teller_gl_code = gl_acc.account_code

    # Resolve External Treasury GLs
    source_gl_code = None
    if transfer.source_treasury_id:
        src = db.query(models.TreasuryAccount).filter(models.TreasuryAccount.id == transfer.source_treasury_id).first()
        if src:
            source_gl_code = src.gl_account_code

    dest_gl_code = None
    if transfer.destination_treasury_id:
        dst = db.query(models.TreasuryAccount).filter(models.TreasuryAccount.id == transfer.destination_treasury_id).first()
        if dst:
            dest_gl_code = dst.gl_account_code

    debit_gl = None
    credit_gl = None
    
    if transfer.transfer_type == models.VaultTransferType.VAULT_TO_TELLER:
        # Morning Float: Debit Teller (Increasing Cash), Credit Vault (Decreasing Cash)
        debit_gl = teller_gl_code
        credit_gl = vault_gl
    elif transfer.transfer_type == models.VaultTransferType.TELLER_TO_VAULT:
        # Vault Drop: Debit Vault (Increasing Cash), Credit Teller (Decreasing Cash)
        debit_gl = vault_gl
        credit_gl = teller_gl_code
    elif transfer.transfer_type == models.VaultTransferType.BANK_TO_VAULT:
        # External Bank to Vault: Debit Vault, Credit Bank Ledger
        debit_gl = vault_gl
        credit_gl = source_gl_code or "1030"
    elif transfer.transfer_type in [
        models.VaultTransferType.VAULT_TO_EXTERNAL,
        models.VaultTransferType.EXTERNAL_TO_DIGITAL,
        models.VaultTransferType.DIGITAL_TO_EXTERNAL
    ]:
        # For all explicitly mapped treasury transfers: Debit Destination, Credit Source
        if not source_gl_code or not dest_gl_code:
            raise HTTPException(status_code=400, detail="Source or Destination Treasury account not found")
        debit_gl = dest_gl_code
        credit_gl = source_gl_code

    if debit_gl and credit_gl:
        AccountingService.record_transaction(
            db=db,
            transaction_id=transfer.transfer_ref,
            transaction_type=transfer.transfer_type.value,
            amount=transfer.amount,
            description=transfer.description or f"Approved {transfer.transfer_type}",
            created_by=transfer.created_by,
            debit_gl_code=debit_gl,
            credit_gl_code=credit_gl
        )

    # 3. Finalize Transfer Record
    transfer.status = models.VaultTransferStatus.APPROVED
    transfer.approved_by = current_user.id
    transfer.approved_at = datetime.utcnow()
    
    db.commit()
    db.refresh(transfer)
    
    # Log the action
    audit = AuditLogger(db, current_user, request)
    audit.log("TREASURY_TRANSFER_APPROVED", "VaultTransfer", str(transfer.id), 
              description=f"Transaction {transfer.transfer_ref} for {transfer.amount} FCFA approved.")
    
    # Broadcast update via WebSocket for real-time dashboard refresh
    from app.websocket_manager import ws_manager
    import json
    ws_manager.broadcast_to_branch(branch.id, json.dumps({
        "type": "TREASURY_UPDATE",
        "transfer_id": transfer.id,
        "status": "APPROVED",
        "message": f"Transfer of {transfer.amount} approved"
    }))
    
    return transfer


@router.post("/external-bank-deposit", response_model=schemas.VaultTransferResponse)
async def external_bank_deposit(
    request: Request,
    data: schemas.VaultTransferRequestData,
    current_user: models.User = Depends(require_ops_manager),
    db: Session = Depends(get_db)
):
    """
    Record cash brought from a commercial bank (External Flow).
    """
    if data.transfer_type != models.VaultTransferType.BANK_TO_VAULT:
        raise HTTPException(status_code=400, detail="Invalid transfer type for external deposit")

    transfer = models.VaultTransfer(
        transfer_ref=f"BANK-{generate_transaction_ref()}",
        transfer_type=models.VaultTransferType.BANK_TO_VAULT,
        branch_id=current_user.branch_id,
        amount=data.amount,
        status=models.VaultTransferStatus.PENDING,
        description=data.description or "Cash withdrawal from commercial bank",
        created_by=current_user.id
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    
    return transfer
