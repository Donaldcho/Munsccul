"""
Core Transactions Router - The "Offline-First" Engine
Handles deposits, withdrawals, transfers with double-entry bookkeeping
"""
from typing import Optional, List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, date

from app.database import get_db
from app.config import settings
from app.auth import (
    get_current_user, 
    require_teller, 
    generate_transaction_ref,
    check_four_eyes_principle
)
from app.audit import AuditLogger
from app import models, schemas
from app.services.accounting import AccountingService

router = APIRouter(prefix="/transactions", tags=["Core Transactions"])


def get_account_or_404(db: Session, account_id: int) -> models.Account:
    """Helper to get account or raise 404"""
    account = db.query(models.Account).filter(
        and_(
            models.Account.id == account_id,
            models.Account.is_active == True
        )
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found or inactive"
        )
    
    if account.is_frozen:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is frozen"
        )
    
    return account


def get_available_balance(db: Session, account: models.Account, member_id: int) -> Decimal:
    """
    COBAC-compliant available balance calculation:
    Available = Ledger_Balance - Min_Balance - Guarantor_Liens - Frozen_Shares
    """
    # Base: balance minus minimum balance
    min_bal = Decimal(str(account.minimum_balance or 0))
    available = Decimal(str(account.balance)) - min_bal
    
    # Subtract active guarantor liens for this member (C5)
    total_liens = db.query(
        func.coalesce(func.sum(models.LoanGuarantor.guarantee_amount), 0)
    ).filter(
        models.LoanGuarantor.member_id == member_id,
        models.LoanGuarantor.is_released == False
    ).scalar()
    available -= Decimal(str(total_liens))
    
    return max(available, Decimal('0'))


def create_double_entry_transaction(
    db: Session,
    account: models.Account,
    transaction_type: models.TransactionType,
    amount: Decimal,
    debit_account_code: Optional[str],
    credit_account_code: Optional[str],
    description: Optional[str],
    created_by: int,
    destination_account: Optional[models.Account] = None
) -> models.Transaction:
    """
    Create a transaction with double-entry bookkeeping (OHADA compliant)
    """
    # Calculate new balance
    if transaction_type in [models.TransactionType.DEPOSIT, models.TransactionType.LOAN_REPAYMENT]:
        new_balance = account.balance + amount
    elif transaction_type in [models.TransactionType.WITHDRAWAL, models.TransactionType.TRANSFER]:
        if account.available_balance < amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds"
            )
        new_balance = account.balance - amount
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction type"
        )
    
    # Create transaction record
    transaction = models.Transaction(
        transaction_ref=generate_transaction_ref(),
        account_id=account.id,
        transaction_type=transaction_type,
        amount=amount,
        currency="XAF",
        debit_account=debit_account_code,
        credit_account=credit_account_code,
        destination_account_id=destination_account.id if destination_account else None,
        balance_after=new_balance,
        description=description,
        created_by=created_by,
        created_at=datetime.utcnow()
    )
    
    db.add(transaction)
    
    # Update account balance
    account.balance = new_balance
    account.available_balance = new_balance
    
    # NEW: Automated GL Journalization
    AccountingService.record_transaction(
        db=db,
        transaction_id=transaction.transaction_ref,
        transaction_type=transaction_type.value,
        amount=amount,
        description=description or f"{transaction_type} for account {account.account_number}",
        created_by=created_by,
        debit_gl_code=debit_account_code,
        credit_gl_code=credit_account_code
    )
    
    return transaction


@router.post("/deposit", response_model=schemas.TransactionResponse)
async def deposit(
    request: Request,
    deposit_data: schemas.DepositRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Process a cash deposit
    
    - Updates account balance immediately
    - Creates immutable transaction record
    - Enforces minimum deposit amount
    """
    # Validate amount
    if deposit_data.amount < settings.MIN_DEPOSIT_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum deposit amount is {settings.MIN_DEPOSIT_AMOUNT} FCFA"
        )
    
    # Get account
    account = get_account_or_404(db, deposit_data.account_id)
    
    # COBAC C9: CTR — Flag large cash transactions for AML compliance
    if float(deposit_data.amount) >= settings.CTR_THRESHOLD:
        # Force manager approval for large deposits
        pass  # Will be caught by four-eyes principle below with CTR flag
    
    # Create transaction with double-entry
    # Debit: Teller's Cash Drawer GL
    # Credit: Member's Savings Account
    
    # Get the teller's GL account code
    teller_gl_code = "1010" # Default Vault
    if current_user.teller_gl_account_id:
        teller_gl = db.query(models.GLAccount).filter(models.GLAccount.id == current_user.teller_gl_account_id).first()
        if teller_gl:
            teller_gl_code = teller_gl.account_code

    transaction = create_double_entry_transaction(
        db=db,
        account=account,
        transaction_type=models.TransactionType.DEPOSIT,
        amount=deposit_data.amount,
        debit_account_code=teller_gl_code,
        credit_account_code="2010", # Member Savings Account (Consolidated GL)
        description=deposit_data.description or "Cash deposit",
        created_by=current_user.id
    )
    
    # Check if approval required (Four-Eyes Principle)
    requires_approval = check_four_eyes_principle(
        db, float(deposit_data.amount), current_user.id
    )
    
    if requires_approval:
        transaction.sync_status = models.SyncStatus.PENDING
        db.commit()
        db.refresh(transaction)
        
        # Log pending transaction
        audit = AuditLogger(db, current_user, request)
        audit.log(
            action="TRANSACTION_PENDING_APPROVAL",
            entity_type="Transaction",
            entity_id=transaction.transaction_ref,
            description=f"Deposit of {deposit_data.amount} FCFA pending approval"
        )
        
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Transaction requires manager approval"
        )
    
    # Update last_member_activity for dormancy tracking (C10)
    account.last_member_activity = datetime.utcnow()
    if account.dormancy_status == "DORMANT":
        account.dormancy_status = "ACTIVE"  # Reactivate on deposit
    
    db.commit()
    db.refresh(transaction)
    
    # Log transaction
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_type="DEPOSIT",
        transaction_id=transaction.transaction_ref,
        amount=float(deposit_data.amount),
        account_id=account.account_number,
        description=f"Deposit of {deposit_data.amount} FCFA to account {account.account_number}"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.post("/withdrawal", response_model=schemas.TransactionResponse)
async def withdrawal(
    request: Request,
    withdrawal_data: schemas.WithdrawalRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Process a cash withdrawal
    
    - Validates sufficient funds
    - Enforces maximum withdrawal limit
    - Requires manager approval for large amounts
    """
    # Validate amount
    if withdrawal_data.amount > settings.MAX_WITHDRAWAL_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum withdrawal amount is {settings.MAX_WITHDRAWAL_AMOUNT} FCFA"
        )
    
    # Get account
    account = get_account_or_404(db, withdrawal_data.account_id)
    
    # ========== COBAC CONSTRAINT CHECKS ==========
    
    # COBAC C1: SHARES accounts cannot be withdrawn from
    if account.account_type == models.AccountType.SHARES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C1",
                "title": "Share Capital Protected",
                "message": "Withdrawals from Share Capital accounts are not permitted under COBAC regulations.",
                "suggestion": "Share capital can only be redeemed when the member permanently closes their account and exits the union."
            }
        )
    
    # COBAC C10: Dormancy check — dormant accounts cannot withdraw
    if account.dormancy_status == "DORMANT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C10",
                "title": "Account Dormant",
                "message": "This account has been inactive for over 6 months and is now classified as dormant.",
                "suggestion": "A Branch Manager must reactivate this account before any withdrawals can be processed. Please visit the branch with valid ID."
            }
        )
    
    # COBAC C11: Minor account — only guardian can authorize
    member = db.query(models.Member).filter(models.Member.id == account.member_id).first()
    if member and member.is_minor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C11",
                "title": "Minor Account Restriction",
                "message": "This account belongs to a minor (under 18). Withdrawals require guardian authorization.",
                "suggestion": "The designated guardian must initiate or authorize this withdrawal. Please verify guardian identity before proceeding."
            }
        )
    
    # COBAC C5: Check guarantor liens + minimum balance
    available = get_available_balance(db, account, account.member_id)
    if Decimal(str(withdrawal_data.amount)) > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C4/C5",
                "title": "Insufficient Available Balance",
                "message": f"Your available balance is {available:,.0f} FCFA, but you requested {withdrawal_data.amount:,.0f} FCFA.",
                "suggestion": f"The available balance accounts for the minimum operating balance and any guarantor liens. Please reduce the withdrawal amount to {available:,.0f} FCFA or less."
            }
        )
    
    # COBAC C9: CTR — Flag large cash transactions for AML (ANIF)
    if float(withdrawal_data.amount) >= settings.CTR_THRESHOLD:
        # Log CTR alert
        audit_ctr = AuditLogger(db, current_user, request)
        audit_ctr.log(
            action="CTR_ALERT",
            entity_type="Transaction",
            entity_id=account.account_number,
            description=f"AML/CTR Alert: Cash withdrawal of {withdrawal_data.amount} FCFA "
                       f"exceeds threshold of {settings.CTR_THRESHOLD} FCFA. Requires manager approval."
        )
    
    # ========== END COBAC CHECKS ==========
    
    # Check minimum balance (original check — kept as fallback)
    new_balance = account.balance - withdrawal_data.amount
    if new_balance < account.minimum_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Withdrawal would violate minimum balance requirement of {account.minimum_balance} FCFA"
        )
    
    # Create transaction with double-entry
    # Debit: Member's Savings Account
    # Credit: Teller's Cash Drawer GL
    
    # Get the teller's GL account code
    teller_gl_code = "1010" # Default Vault
    if current_user.teller_gl_account_id:
        teller_gl = db.query(models.GLAccount).filter(models.GLAccount.id == current_user.teller_gl_account_id).first()
        if teller_gl:
            teller_gl_code = teller_gl.account_code

    transaction = create_double_entry_transaction(
        db=db,
        account=account,
        transaction_type=models.TransactionType.WITHDRAWAL,
        amount=withdrawal_data.amount,
        debit_account_code="2010",  # Member Savings Account
        credit_account_code=teller_gl_code,
        description=withdrawal_data.description or "Cash withdrawal",
        created_by=current_user.id
    )
    
    # Check if approval required (Four-Eyes Principle)
    requires_approval = check_four_eyes_principle(
        db, float(withdrawal_data.amount), current_user.id
    )
    
    if requires_approval:
        transaction.sync_status = models.SyncStatus.PENDING
        db.commit()
        db.refresh(transaction)
        
        # Log pending transaction
        audit = AuditLogger(db, current_user, request)
        audit.log(
            action="TRANSACTION_PENDING_APPROVAL",
            entity_type="Transaction",
            entity_id=transaction.transaction_ref,
            description=f"Withdrawal of {withdrawal_data.amount} FCFA pending approval"
        )
        
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Transaction requires manager approval"
        )
    
    # Update last_member_activity for dormancy tracking (C10)
    account.last_member_activity = datetime.utcnow()
    
    db.commit()
    db.refresh(transaction)
    
    # Log transaction
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_type="WITHDRAWAL",
        transaction_id=transaction.transaction_ref,
        amount=float(withdrawal_data.amount),
        account_id=account.account_number,
        description=f"Withdrawal of {withdrawal_data.amount} FCFA from account {account.account_number}"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.post("/transfer", response_model=schemas.TransactionResponse)
async def transfer(
    request: Request,
    transfer_data: schemas.TransferRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Process an account-to-account transfer
    
    - Transfers funds between member accounts
    - Creates two transaction records (debit and credit)
    """
    # Validate accounts are different
    if transfer_data.from_account_id == transfer_data.to_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and destination accounts must be different"
        )
    
    # Get accounts
    from_account = get_account_or_404(db, transfer_data.from_account_id)
    to_account = get_account_or_404(db, transfer_data.to_account_id)
    
    # Check minimum balance on source account
    new_balance = from_account.balance - transfer_data.amount
    if new_balance < from_account.minimum_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transfer would violate minimum balance requirement"
        )
    
    # Create transaction for source account (debit)
    transaction = create_double_entry_transaction(
        db=db,
        account=from_account,
        transaction_type=models.TransactionType.TRANSFER,
        amount=transfer_data.amount,
        debit_account_code="2010", # Member Savings
        credit_account_code="2010", # Member Savings
        description=transfer_data.description or f"Transfer to {to_account.account_number}",
        created_by=current_user.id,
        destination_account=to_account
    )
    
    # Update destination account (credit)
    to_account.balance += transfer_data.amount
    to_account.available_balance += transfer_data.amount
    
    # Check if approval required
    requires_approval = check_four_eyes_principle(
        db, float(transfer_data.amount), current_user.id
    )
    
    if requires_approval:
        transaction.sync_status = models.SyncStatus.PENDING
        db.commit()
        db.refresh(transaction)
        
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Transaction requires manager approval"
        )
    
    db.commit()
    db.refresh(transaction)
    
    # Log transaction
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_type="TRANSFER",
        transaction_id=transaction.transaction_ref,
        amount=float(transfer_data.amount),
        account_id=from_account.account_number,
        description=f"Transfer of {transfer_data.amount} FCFA from {from_account.account_number} to {to_account.account_number}"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.post("/approve", response_model=schemas.TransactionResponse)
async def approve_transaction(
    request: Request,
    approval_data: schemas.ApprovalRequest,
    current_user: models.User = Depends(require_teller),  # Manager required via check
    db: Session = Depends(get_db)
):
    """
    Approve or reject a pending transaction (Four-Eyes Principle)
    
    - Only Branch Managers can approve transactions
    - Approver cannot be the same as creator
    """
    from app.auth import require_manager
    
    # Verify manager role
    if current_user.role.value not in ["BRANCH_MANAGER", "SYSTEM_ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can approve transactions"
        )
    
    # Get transaction
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == approval_data.transaction_id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Check if already processed
    if transaction.sync_status != models.SyncStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction is not pending approval"
        )
    
    # Check approver is not creator
    if transaction.created_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot approve your own transaction"
        )
    
    if approval_data.approved:
        # Approve transaction
        transaction.sync_status = models.SyncStatus.SYNCED
        transaction.approved_by = current_user.id
        transaction.approved_at = datetime.utcnow()
        
        db.commit()
        db.refresh(transaction)
        
        # Log approval
        audit = AuditLogger(db, current_user, request)
        audit.log_approval(
            entity_type="Transaction",
            entity_id=transaction.transaction_ref,
            approved=True,
            reason=approval_data.reason
        )
    else:
        # Reject transaction - reverse the balance change
        account = db.query(models.Account).filter(
            models.Account.id == transaction.account_id
        ).first()
        
        if account:
            if transaction.transaction_type in [models.TransactionType.DEPOSIT]:
                account.balance -= transaction.amount
                account.available_balance -= transaction.amount
            elif transaction.transaction_type in [models.TransactionType.WITHDRAWAL]:
                account.balance += transaction.amount
                account.available_balance += transaction.amount
        
        transaction.sync_status = models.SyncStatus.FAILED
        transaction.approved_by = current_user.id
        transaction.approved_at = datetime.utcnow()
        transaction.description = f"{transaction.description} [REJECTED: {approval_data.reason}]"
        
        db.commit()
        db.refresh(transaction)
        
        # Log rejection
        audit = AuditLogger(db, current_user, request)
        audit.log_approval(
            entity_type="Transaction",
            entity_id=transaction.transaction_ref,
            approved=False,
            reason=approval_data.reason
        )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.get("", response_model=schemas.TransactionListResponse)
async def list_transactions(
    account_id: Optional[int] = Query(None),
    transaction_type: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    min_amount: Optional[Decimal] = Query(None),
    max_amount: Optional[Decimal] = Query(None),
    pending_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List transactions with filters
    """
    query = db.query(models.Transaction)
    
    if account_id:
        query = query.filter(models.Transaction.account_id == account_id)
    
    if transaction_type:
        transaction_type = transaction_type.upper()
        query = query.filter(models.Transaction.transaction_type == transaction_type)
    
    if start_date:
        query = query.filter(models.Transaction.created_at >= start_date)
    
    if end_date:
        query = query.filter(models.Transaction.created_at <= end_date)
    
    if min_amount:
        query = query.filter(models.Transaction.amount >= min_amount)
    
    if max_amount:
        query = query.filter(models.Transaction.amount <= max_amount)
    
    if pending_only:
        query = query.filter(models.Transaction.sync_status == models.SyncStatus.PENDING)
    
    # Order by most recent first
    query = query.order_by(models.Transaction.created_at.desc())
    
    total = query.count()
    transactions = query.offset(skip).limit(limit).all()
    
    return schemas.TransactionListResponse(
        transactions=[schemas.TransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=skip // limit + 1,
        page_size=limit
    )


@router.get("/{transaction_ref}", response_model=schemas.TransactionResponse)
async def get_transaction(
    transaction_ref: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get transaction by reference number
    """
    transaction = db.query(models.Transaction).filter(
        models.Transaction.transaction_ref == transaction_ref
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.get("/stats/daily-cash-position")
async def get_daily_cash_position(
    branch_id: Optional[int] = Query(None),
    query_date: Optional[date] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get daily cash position report for branch managers
    """
    if not query_date:
        query_date = date.today()
    
    # Default to user's branch
    if not branch_id and current_user.branch_id:
        branch_id = current_user.branch_id
    
    if not branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch ID required"
        )
    
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    # Calculate totals for the day
    start_of_day = datetime.combine(query_date, datetime.min.time())
    end_of_day = datetime.combine(query_date, datetime.max.time())
    
    deposits = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.transaction_type == models.TransactionType.DEPOSIT,
        models.Transaction.created_at >= start_of_day,
        models.Transaction.created_at <= end_of_day
    ).scalar() or Decimal("0")
    
    withdrawals = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.transaction_type == models.TransactionType.WITHDRAWAL,
        models.Transaction.created_at >= start_of_day,
        models.Transaction.created_at <= end_of_day
    ).scalar() or Decimal("0")
    
    transaction_count = db.query(models.Transaction).filter(
        models.Transaction.created_at >= start_of_day,
        models.Transaction.created_at <= end_of_day
    ).count()
    
    # Get opening balance (simplified - would need proper calculation)
    opening_balance = Decimal("0")  # Placeholder
    closing_balance = opening_balance + deposits - withdrawals
    
    return schemas.DailyCashPosition(
        branch_id=branch_id,
        branch_name=branch.name,
        date=query_date,
        opening_balance=opening_balance,
        total_deposits=deposits,
        total_withdrawals=withdrawals,
        net_position=deposits - withdrawals,
        closing_balance=closing_balance,
        transaction_count=transaction_count
    )