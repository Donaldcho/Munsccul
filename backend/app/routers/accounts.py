"""
Account Management Router
Handles account creation, management, and queries
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import get_current_user, require_teller, generate_account_number
from app.audit import AuditLogger
from app import models, schemas

router = APIRouter(prefix="/accounts", tags=["Account Management"])


@router.post("", response_model=schemas.AccountResponse)
async def create_account(
    request: Request,
    account_data: schemas.AccountCreate,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Create a new account for a member
    
    - Generates unique account number
    - Assigns OHADA-compliant account class
    """
    # Verify member exists
    member = db.query(models.Member).filter(
        models.Member.id == account_data.member_id,
        models.Member.is_active == True
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found or inactive"
        )
    
    # Generate account number
    account_number = generate_account_number()
    
    # Ensure uniqueness
    while db.query(models.Account).filter(
        models.Account.account_number == account_number
    ).first():
        account_number = generate_account_number()
    
    # Determine OHADA account class based on account type
    account_class_map = {
        models.AccountType.SAVINGS: 5,  # Financial accounts
        models.AccountType.CURRENT: 5,
        models.AccountType.FIXED_DEPOSIT: 5,
        models.AccountType.LOAN: 4  # Third-party accounts
    }
    
    account_class = account_class_map.get(account_data.account_type, 5)
    
    # Create account
    new_account = models.Account(
        account_number=account_number,
        account_class=account_class,
        account_category="52",  # Bank/Cash
        member_id=account_data.member_id,
        account_type=account_data.account_type,
        balance=0,
        available_balance=0,
        interest_rate=account_data.interest_rate or 0,
        minimum_balance=account_data.minimum_balance or 0,
        opened_by=current_user.id
    )
    
    db.add(new_account)
    db.commit()
    db.refresh(new_account)
    
    # Log account creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="Account",
        entity_id=str(new_account.id),
        new_values={
            "account_number": new_account.account_number,
            "member_id": new_account.member_id,
            "account_type": new_account.account_type.value,
            "account_class": new_account.account_class
        },
        description=f"Created {account_data.account_type.value} account {new_account.account_number} for member {member.member_id}"
    )
    
    return schemas.AccountResponse.model_validate(new_account)


@router.get("", response_model=List[schemas.AccountResponse])
async def list_accounts(
    member_id: Optional[int] = Query(None),
    account_type: Optional[str] = Query(None),
    is_active: bool = Query(True),
    skip: int = Query(0),
    limit: int = Query(100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List accounts with filters
    """
    query = db.query(models.Account)
    
    if member_id:
        query = query.filter(models.Account.member_id == member_id)
    
    if account_type:
        query = query.filter(models.Account.account_type == account_type)
    
    if is_active is not None:
        query = query.filter(models.Account.is_active == is_active)
    
    accounts = query.offset(skip).limit(limit).all()
    
    return [schemas.AccountResponse.model_validate(a) for a in accounts]


@router.get("/{account_id}", response_model=schemas.AccountResponse)
async def get_account(
    account_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get account by ID
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    return schemas.AccountResponse.model_validate(account)


@router.get("/by-number/{account_number}", response_model=schemas.AccountResponse)
async def get_account_by_number(
    account_number: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get account by account number
    """
    account = db.query(models.Account).filter(
        models.Account.account_number == account_number
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    return schemas.AccountResponse.model_validate(account)


@router.put("/{account_id}/freeze")
async def freeze_account(
    request: Request,
    account_id: int,
    reason: str,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Freeze an account (prevent transactions)
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    if account.is_frozen:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already frozen"
        )
    
    account.is_frozen = True
    account.frozen_reason = reason
    
    db.commit()
    db.refresh(account)
    
    # Log freeze
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="ACCOUNT_FREEZE",
        entity_type="Account",
        entity_id=str(account.id),
        new_values={"is_frozen": True, "frozen_reason": reason},
        description=f"Frozen account {account.account_number}: {reason}"
    )
    
    return {"message": f"Account {account.account_number} frozen successfully"}


@router.put("/{account_id}/unfreeze")
async def unfreeze_account(
    request: Request,
    account_id: int,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Unfreeze an account (allow transactions)
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    if not account.is_frozen:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is not frozen"
        )
    
    old_reason = account.frozen_reason
    account.is_frozen = False
    account.frozen_reason = None
    
    db.commit()
    db.refresh(account)
    
    # Log unfreeze
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="ACCOUNT_UNFREEZE",
        entity_type="Account",
        entity_id=str(account.id),
        old_values={"is_frozen": True, "frozen_reason": old_reason},
        new_values={"is_frozen": False, "frozen_reason": None},
        description=f"Unfrozen account {account.account_number}"
    )
    
    return {"message": f"Account {account.account_number} unfrozen successfully"}


@router.get("/{account_id}/balance")
async def get_account_balance(
    account_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current account balance
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    return {
        "account_id": account.id,
        "account_number": account.account_number,
        "balance": account.balance,
        "available_balance": account.available_balance,
        "currency": "XAF",
        "last_updated": account.opened_at  # Would need actual timestamp
    }


@router.get("/{account_id}/statement")
async def get_account_statement(
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get account statement with transactions
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    query = db.query(models.Transaction).filter(
        models.Transaction.account_id == account_id
    )
    
    if start_date:
        from datetime import datetime
        query = query.filter(models.Transaction.created_at >= datetime.fromisoformat(start_date))
    
    if end_date:
        from datetime import datetime
        query = query.filter(models.Transaction.created_at <= datetime.fromisoformat(end_date))
    
    transactions = query.order_by(models.Transaction.created_at.desc()).all()
    
    return {
        "account_number": account.account_number,
        "account_type": account.account_type.value,
        "current_balance": account.balance,
        "statement_period": {
            "from": start_date,
            "to": end_date
        },
        "transactions": [
            {
                "date": t.created_at,
                "reference": t.transaction_ref,
                "type": t.transaction_type.value,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "description": t.description
            }
            for t in transactions
        ],
        "total_transactions": len(transactions)
    }