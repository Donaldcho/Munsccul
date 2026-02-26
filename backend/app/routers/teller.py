import json
from decimal import Decimal
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.auth import get_current_user, require_teller, verify_password
from app.audit import AuditLogger

router = APIRouter(prefix="/teller", tags=["Teller Operations"])

@router.post("/vault-drop", response_model=schemas.TransactionResponse)
async def vault_drop(
    request: Request,
    drop: schemas.VaultDropRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Transfer excess cash from teller drawer to main vault (Vault Drop).
    Reduces the teller's specific GL account and increases the main vault GL.
    """
    # 1. Verify user has a teller GL account assigned
    if not current_user.teller_gl_account_id:
        raise HTTPException(status_code=400, detail="Teller has no assigned GL account for cash.")
        
    # In a full implementation, this creates a double-entry transaction.
    from app.auth import generate_transaction_ref
    from app.services.accounting import AccountingService
    
    # 2. Get Teller GL Code
    teller_gl = db.query(models.GLAccount).filter(models.GLAccount.id == current_user.teller_gl_account_id).first()
    teller_gl_code = teller_gl.account_code if teller_gl else "1020" # Fallback

    # 3. Get Branch Vault GL Code
    branch = db.query(models.Branch).filter(models.Branch.id == current_user.branch_id).first()
    vault_gl_code = branch.gl_vault_code if branch and branch.gl_vault_code else "1010" # Fallback

    transaction = models.Transaction(
        transaction_ref=generate_transaction_ref(),
        account_id=current_user.teller_gl_account_id, # Link to GL Account record
        transaction_type=models.TransactionType.TRANSFER,
        amount=drop.amount,
        balance_after=Decimal("0.00"), # Would be dynamically calculated from GL entries
        status="COMPLETED",
        description=f"Vault Drop by {current_user.username}",
        created_by=current_user.id,
        approved_by=current_user.id, # Teller initiates and completes drop
        channel="TELLER_TERMINAL"
    )
    
    db.add(transaction)
    
    # automated GL Journalization
    # Debit: Vault GL (where money is going)
    # Credit: Teller GL (where money is coming from)
    AccountingService.record_transaction(
        db=db,
        transaction_id=transaction.transaction_ref,
        transaction_type=models.TransactionType.TRANSFER.value,
        amount=drop.amount,
        description=f"Vault Drop: {current_user.username} -> Vault",
        created_by=current_user.id,
        debit_gl_code=vault_gl_code,
        credit_gl_code=teller_gl_code
    )
    
    db.commit()
    db.refresh(transaction)
    
    # Log the drop
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_id=transaction.transaction_ref,
        action_type="VAULT_DROP",
        amount=float(drop.amount),
        status="COMPLETED"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)

@router.post("/blind-eod", response_model=schemas.TellerReconciliationResponse)
async def blind_eod(
    request: Request,
    eod: schemas.BlindEODRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Submit Blind End-of-Day reconciliation. The teller counts their physical cash and 
    submits denominations. The system compares it to their expected drawer balance.
    """
    # 1. Calculate declared total from denominations
    d = eod.denominations
    declared_total = (
        d.bill_10000 * 10000 +
        d.bill_5000 * 5000 +
        d.bill_2000 * 2000 +
        d.bill_1000 * 1000 +
        d.bill_500 * 500 +
        d.coin_500 * 500 +
        d.coin_100 * 100 +
        d.coin_50 * 50 +
        d.coin_25 * 25
    )
    
    # 2. Calculate Expected Balances (BLIND)
    from sqlalchemy import case, func
    
    # A. Expected CASH (from GL)
    system_expected_cash = Decimal("0.00")
    if current_user.teller_gl_account_id:
        raw_cash_balance = db.query(
            func.sum(
                case(
                    (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                    else_=-models.GLJournalEntry.amount
                )
            )
        ).filter(
            models.GLJournalEntry.gl_account_id == current_user.teller_gl_account_id
        ).scalar()
        system_expected_cash = Decimal(str(raw_cash_balance)) if raw_cash_balance is not None else Decimal("0.00")

    # B. Expected MTN MoMo (Net activity for today)
    momo_activity = db.query(
        func.sum(
            case(
                (models.Transaction.transaction_type == models.TransactionType.WITHDRAWAL, models.Transaction.amount),
                (models.Transaction.transaction_type == models.TransactionType.DEPOSIT, -models.Transaction.amount),
                else_=0
            )
        )
    ).filter(
        models.Transaction.created_by == current_user.id,
        models.Transaction.payment_channel == models.PaymentChannel.MTN_MOMO,
        func.date(models.Transaction.created_at) == func.current_date()
    ).scalar()
    system_expected_momo = Decimal(str(momo_activity)) if momo_activity is not None else Decimal("0.00")

    # C. Expected Orange Money (Net activity for today)
    om_activity = db.query(
        func.sum(
            case(
                (models.Transaction.transaction_type == models.TransactionType.WITHDRAWAL, models.Transaction.amount),
                (models.Transaction.transaction_type == models.TransactionType.DEPOSIT, -models.Transaction.amount),
                else_=0
            )
        )
    ).filter(
        models.Transaction.created_by == current_user.id,
        models.Transaction.payment_channel == models.PaymentChannel.ORANGE_MONEY,
        func.date(models.Transaction.created_at) == func.current_date()
    ).scalar()
    system_expected_om = Decimal(str(om_activity)) if om_activity is not None else Decimal("0.00")

    # 3. Calculate Variances
    cash_variance = Decimal(str(declared_total)) - system_expected_cash
    momo_variance = eod.momo_balance - system_expected_momo
    om_variance = eod.om_balance - system_expected_om
    
    has_variance = (cash_variance != 0) or (momo_variance != 0) or (om_variance != 0)
    
    # Save the reconciliation record
    reconciliation = models.TellerReconciliation(
        teller_id=current_user.id,
        branch_id=current_user.branch_id,
        
        # Cash
        declared_amount=Decimal(str(declared_total)),
        system_expected_amount=system_expected_cash,
        variance_amount=cash_variance,
        
        # MoMo
        declared_momo_balance=eod.momo_balance,
        system_expected_momo_balance=system_expected_momo,
        momo_variance=momo_variance,
        
        # OM
        declared_om_balance=eod.om_balance,
        system_expected_om_balance=system_expected_om,
        om_variance=om_variance,
        
        denominations=eod.denominations.model_dump_json(),
        status="PENDING_REVIEW" if has_variance else "BALANCED"
    )
    
    db.add(reconciliation)
    db.commit()
    db.refresh(reconciliation)
    
    # Log
    audit = AuditLogger(db, current_user, request)
    audit.log("BLIND_EOD_SUBMITTED", "User", str(current_user.id), 
              description=f"Cash Var: {cash_variance}, MoMo Var: {momo_variance}, OM Var: {om_variance}")
    
    return schemas.TellerReconciliationResponse.model_validate(reconciliation)

@router.post("/manager-override")
async def manager_override(
    request: Request,
    override: schemas.ManagerOverrideRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Verify a manager's PIN for in-place transaction override when a teller exceeds their drawer limit.
    """
    # 1. Find a manager with this PIN
    # Since PINs should be hashed, we iterate through active managers and verify.
    # In a real heavy DB, we might enforce unique PINs or lookup by manager username + PIN.
    # Assuming teller types manager's PIN, we need to find who it belongs to.
    
    managers = db.query(models.User).filter(
        models.User.role.in_([models.UserRole.BRANCH_MANAGER, models.UserRole.OPS_MANAGER]),
        models.User.is_active == True,
        models.User.branch_id == current_user.branch_id
    ).all()
    
    authorizing_manager = None
    for manager in managers:
        if manager.teller_pin and verify_password(override.manager_pin, manager.teller_pin):
            authorizing_manager = manager
            break
            
    if not authorizing_manager:
        raise HTTPException(status_code=401, detail="Invalid Manager PIN or Unauthorized")
        
    return {
        "status": "APPROVED",
        "authorized_by": authorizing_manager.id,
        "manager_name": authorizing_manager.full_name,
        "amount_authorized": override.amount
    }

@router.post("/verify-pin")
async def verify_teller_pin(
    request: Request,
    payload: schemas.VerifyPinRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """Verify the teller's PIN to unlock an auto-locked session."""
    if not current_user.teller_pin or not verify_password(payload.pin, current_user.teller_pin):
        # We also support using their main password as fallback if PIN isn't set
        if not verify_password(payload.pin, current_user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid PIN or Password")
            
    return {"status": "UNLOCKED"}
    

@router.get("/balance")
async def get_teller_balance(
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """Get the current physical cash balance in the teller's drawer (based on GL)."""
    if not current_user.teller_gl_account_id:
        return {"balance": 0.0, "currency": "XAF"}
        
    # Sum all entries for this teller's cash GL account
    # Debits increase cash (money coming in), Credits decrease cash (money going out)
    from sqlalchemy import case, func
    
    raw_balance = db.query(
        func.sum(
            case(
                (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                else_=-models.GLJournalEntry.amount
            )
        )
    ).filter(
        models.GLJournalEntry.gl_account_id == current_user.teller_gl_account_id
    ).scalar()
    
    balance = float(raw_balance) if raw_balance is not None else 0.0
    
    return {
        "balance": balance,
        "currency": "XAF",
        "gl_account_id": current_user.teller_gl_account_id
    }
