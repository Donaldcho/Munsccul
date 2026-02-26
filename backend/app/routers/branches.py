"""
Branch Management Router
Handles branch operations and administration
"""
from typing import Optional, List
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, WebSocket
from sqlalchemy.orm import Session
from sqlalchemy import func, case
import logging

from app.database import get_db
from app.auth import get_current_user, require_admin
from app.audit import AuditLogger
from app import models, schemas
from app.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/branches", tags=["Branch Management"])


@router.post("", response_model=schemas.BranchResponse)
async def create_branch(
    request: Request,
    branch_data: schemas.BranchCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new branch (Admin only)
    """
    # Check if code exists
    existing = db.query(models.Branch).filter(
        models.Branch.code == branch_data.code
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch code already exists"
        )
    
    # Create branch
    branch = models.Branch(
        code=branch_data.code,
        name=branch_data.name,
        address=branch_data.address,
        city=branch_data.city,
        region=branch_data.region,
        phone=branch_data.phone,
        email=branch_data.email,
        server_api_key=secrets.token_urlsafe(32)
    )
    
    db.add(branch)
    db.commit()
    db.refresh(branch)
    
    # Log creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="Branch",
        entity_id=str(branch.id),
        new_values={
            "code": branch.code,
            "name": branch.name,
            "city": branch.city
        }
    )
    
    return schemas.BranchResponse.model_validate(branch)


@router.get("", response_model=List[schemas.BranchResponse])
async def list_branches(
    is_active: Optional[bool] = True,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all branches
    """
    query = db.query(models.Branch)
    
    if is_active is not None:
        query = query.filter(models.Branch.is_active == is_active)
    
    branches = query.all()
    
    return [schemas.BranchResponse.model_validate(b) for b in branches]


@router.get("/{branch_id}", response_model=schemas.BranchResponse)
async def get_branch(
    branch_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get branch by ID
    """
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    return schemas.BranchResponse.model_validate(branch)


@router.put("/{branch_id}", response_model=schemas.BranchResponse)
async def update_branch(
    request: Request,
    branch_id: int,
    branch_data: schemas.BranchCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update branch information (Admin only)
    """
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    # Store old values
    old_values = {
        "name": branch.name,
        "address": branch.address,
        "city": branch.city,
        "region": branch.region,
        "phone": branch.phone,
        "email": branch.email
    }
    
    # Update fields
    branch.name = branch_data.name
    branch.address = branch_data.address
    branch.city = branch_data.city
    branch.region = branch_data.region
    branch.phone = branch_data.phone
    branch.email = branch_data.email
    
    db.commit()
    db.refresh(branch)
    
    # Log update
    audit = AuditLogger(db, current_user, request)
    audit.log_update(
        entity_type="Branch",
        entity_id=str(branch.id),
        old_values=old_values,
        new_values={
            "name": branch.name,
            "address": branch.address,
            "city": branch.city,
            "region": branch.region,
            "phone": branch.phone,
            "email": branch.email
        }
    )
    
    return schemas.BranchResponse.model_validate(branch)


@router.patch("/{branch_id}/status", response_model=schemas.BranchResponse)
async def update_branch_status(
    request: Request,
    branch_id: int,
    status_data: schemas.BranchStatusUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle branch status: OPEN, EOD_IN_PROGRESS, CLOSED.
    Enforces system-wide lockout/ready state.
    Only Ops Managers and above can change status.
    """
    if current_user.role not in [models.UserRole.OPS_MANAGER, models.UserRole.OPS_DIRECTOR, models.UserRole.SYSTEM_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Unauthorized: Only Ops Managers can change branch status"
        )
        
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    old_status = branch.status
    branch.status = status_data.status
    
    db.commit()
    db.refresh(branch)
    
    # Log the status change
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="BRANCH_STATUS_CHANGE",
        entity_type="Branch",
        entity_id=str(branch.id),
        description=f"Branch {branch.name} status changed from {old_status} to {branch.status}"
    )
    
    return branch


@router.get("/{branch_id}/stats/liquidity", response_model=schemas.LiquidityMatrixResponse)
async def get_liquidity_stats(
    branch_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed liquidity matrix for the branch.
    Includes Internal Cash, External Placements, and Digital Wallets.
    """
    try:
        branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")

        # Helper to get GL Balance
        def get_gl_balance(gl_code: str) -> float:
            raw = db.query(
                func.sum(
                    case(
                        (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                        else_=-models.GLJournalEntry.amount
                    )
                )
            ).select_from(models.GLJournalEntry).join(
                models.GLAccount, models.GLJournalEntry.gl_account_id == models.GLAccount.id
            ).filter(models.GLAccount.account_code == gl_code).scalar()
            return float(raw) if raw is not None else 0.0

        categories = []
        total_liquidity = 0.0

        # === 1. INTERNAL CASH ===
        internal_items = []
        internal_balance = 0.0
        
        # Vault
        vault_gl = branch.gl_vault_code or "1010"
        vault_bal = get_gl_balance(vault_gl)
        internal_items.append({
            "name": "Main Vault",
            "balance": str(vault_bal),
            "limit": str(branch.vault_cash_limit) if branch.vault_cash_limit else None,
            "account_number": None
        })
        internal_balance += vault_bal

        # Tellers
        tellers = db.query(models.User).filter(
            models.User.branch_id == branch_id,
            models.User.role == models.UserRole.TELLER,
            models.User.is_active == True,
            models.User.teller_gl_account_id != None
        ).all()
        
        for teller in tellers:
            gl_acc = db.query(models.GLAccount).filter(models.GLAccount.id == teller.teller_gl_account_id).first()
            if not gl_acc: continue
            
            t_bal = get_gl_balance(gl_acc.account_code)
            internal_items.append({
                "name": teller.full_name,
                "balance": str(t_bal),
                "limit": str(teller.teller_cash_limit) if teller.teller_cash_limit else None,
                "account_number": teller.counter_number or "Counter"
            })
            internal_balance += t_bal
            
        categories.append({
            "name": "INTERNAL CASH",
            "category_type": "INTERNAL",
            "total_balance": str(internal_balance),
            "items": internal_items
        })
        total_liquidity += internal_balance

        # === 2. EXTERNAL PLACEMENTS ===
        external_items = []
        external_balance = 0.0
        seen_external_gls = set()
        
        external_accounts = db.query(models.TreasuryAccount).filter(
            models.TreasuryAccount.branch_id == branch_id,
            models.TreasuryAccount.account_type.in_([models.TreasuryAccountType.BANK, models.TreasuryAccountType.CREDIT_UNION]),
            models.TreasuryAccount.is_active == True
        ).all()
        
        for acc in external_accounts:
            bal = get_gl_balance(acc.gl_account_code)
            external_items.append({
                "name": acc.name,
                "balance": str(bal),
                "limit": str(acc.max_limit) if acc.max_limit else None,
                "account_number": acc.account_number
            })
            # To avoid double-counting categories if they point to the same GL, 
            # we should only add to the total if we haven't seen this GL in this category.
            # However, for external accounts, usually they SHOULD be separate.
            if acc.gl_account_code not in seen_external_gls:
                external_balance += bal
                seen_external_gls.add(acc.gl_account_code)
            
        categories.append({
            "name": "EXTERNAL PLACEMENTS",
            "category_type": "EXTERNAL",
            "total_balance": str(external_balance),
            "items": external_items
        })
        total_liquidity += external_balance

        # === 3. DIGITAL WALLETS ===
        digital_items = []
        digital_balance = 0.0
        seen_digital_gls = set()
        
        digital_accounts = db.query(models.TreasuryAccount).filter(
            models.TreasuryAccount.branch_id == branch_id,
            models.TreasuryAccount.account_type == models.TreasuryAccountType.MOBILE_MONEY,
            models.TreasuryAccount.is_active == True
        ).all()
        
        for acc in digital_accounts:
            bal = get_gl_balance(acc.gl_account_code)
            digital_items.append({
                "name": acc.name,
                "balance": str(bal),
                "limit": str(acc.max_limit) if acc.max_limit else None,
                "account_number": acc.account_number
            })
            if acc.gl_account_code not in seen_digital_gls:
                digital_balance += bal
                seen_digital_gls.add(acc.gl_account_code)
            
        categories.append({
            "name": "DIGITAL WALLETS",
            "category_type": "DIGITAL",
            "total_balance": str(digital_balance),
            "items": digital_items
        })
        total_liquidity += digital_balance

        return {
            "branch_id": branch_id,
            "total_liquidity": total_liquidity,
            "categories": categories
        }
    except Exception as e:
        import traceback
        error_msg = f"Liquidity Stats Error: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@router.post("/vault-drop")
async def manager_vault_drop(
    request: Request,
    drop: schemas.VaultDropByManagerRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manager-initiated vault drop for a specific teller.
    Requires Manager PIN for authorization.
    """
    from app.auth import verify_password, generate_transaction_ref
    from app.services.accounting import AccountingService
    
    # 1. Verify Manager (PIN is tracked in teller_pin field for all users)
    if not current_user.teller_pin or not verify_password(drop.manager_pin, current_user.teller_pin):
         raise HTTPException(status_code=401, detail="Invalid Manager PIN")

    # 2. Find Teller
    teller = db.query(models.User).filter(models.User.id == drop.teller_id).first()
    if not teller or not teller.teller_gl_account_id:
        raise HTTPException(status_code=400, detail="Invalid Teller or Teller has no GL account")
    
    # 3. Get GL Codes
    branch = db.query(models.Branch).filter(models.Branch.id == teller.branch_id).first()
    vault_gl_code = branch.gl_vault_code or "1010"
    
    teller_gl = db.query(models.GLAccount).filter(models.GLAccount.id == teller.teller_gl_account_id).first()
    teller_gl_code = teller_gl.account_code if teller_gl else "1020"

    # 4. Record Transaction
    transaction = models.Transaction(
        transaction_ref=generate_transaction_ref(),
        account_id=teller.teller_gl_account_id,
        transaction_type=models.TransactionType.TRANSFER,
        amount=drop.amount,
        balance_after=0.00, # Simplified
        status="COMPLETED",
        description=f"Vault Drop (Admin override by {current_user.username})",
        created_by=teller.id,
        approved_by=current_user.id
    )
    db.add(transaction)
    
    AccountingService.record_transaction(
        db=db,
        transaction_id=transaction.transaction_ref,
        transaction_type="VAULT_DROP",
        amount=drop.amount,
        description=f"Manager Vault Drop: {teller.username} -> Vault",
        created_by=current_user.id,
        debit_gl_code=vault_gl_code,
        credit_gl_code=teller_gl_code
    )
    
    db.commit()
    
    # Log
    audit = AuditLogger(db, current_user, request)
    audit.log("MANAGER_VAULT_DROP", "User", str(teller.id), description=f"Manager {current_user.username} moved {drop.amount} to vault")
    
    return {"status": "success", "transaction_ref": transaction.transaction_ref}

@router.websocket("/ws/{branch_id}")
async def branch_websocket(websocket: WebSocket, branch_id: int):
    """
    Unified WebSocket endpoint for branch-specific alerts.
    Path: /api/v1/branches/ws/{branch_id}
    """
    logger.info(f"WebSocket handshake received for branch {branch_id}")
    await ws_manager.connect(websocket, branch_id)
    try:
        while True:
            await websocket.receive_text()
    except Exception as e:
        logger.error(f"WS Error in branch {branch_id}: {e}")
    finally:
        ws_manager.disconnect(websocket, branch_id)