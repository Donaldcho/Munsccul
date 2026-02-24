"""
Branch Management Router
Handles branch operations and administration
"""
from typing import Optional, List
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.database import get_db
from app.auth import get_current_user, require_admin
from app.audit import AuditLogger
from app import models, schemas

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


@router.get("/{branch_id}/stats/liquidity")
async def get_liquidity_stats(
    branch_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed liquidity matrix for the branch.
    Includes Main Vault balance and each active teller's drawer balance.
    """
    try:
        branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")

        # 1. Get Vault Balance (from GL)
        vault_gl = branch.gl_vault_code or "1010"
        
        raw_vault = db.query(
            func.sum(
                case(
                    (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                    else_=-models.GLJournalEntry.amount
                )
            )
        ).select_from(models.GLJournalEntry).join(
            models.GLAccount, models.GLJournalEntry.gl_account_id == models.GLAccount.id
        ).filter(models.GLAccount.account_code == vault_gl).scalar()
        
        vault_balance = float(raw_vault) if raw_vault is not None else 0.0

        # 2. Get Teller Drawer Balances
        tellers = db.query(models.User).filter(
            models.User.branch_id == branch_id,
            models.User.role == models.UserRole.TELLER,
            models.User.is_active == True,
            models.User.teller_gl_account_id != None
        ).all()
        
        teller_drawers = []
        for teller in tellers:
            # Get GL account code for this teller
            gl_acc = db.query(models.GLAccount).filter(models.GLAccount.id == teller.teller_gl_account_id).first()
            if not gl_acc: continue
            
            raw_balance = db.query(
                func.sum(
                    case(
                        (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                        else_=-models.GLJournalEntry.amount
                    )
                )
            ).filter(
                models.GLJournalEntry.gl_account_id == gl_acc.id
            ).scalar()
            
            balance = float(raw_balance) if raw_balance is not None else 0.0
            limit = float(teller.teller_cash_limit) if teller.teller_cash_limit is not None else 0.0
            
            teller_drawers.append({
                "teller_id": teller.id,
                "teller_name": teller.full_name,
                "counter": teller.counter_number or f"Counter {teller.id}",
                "balance": balance,
                "limit": limit,
                "approaching_limit": balance > (limit * 0.8) if limit > 0 else False
            })

        return {
            "branch_id": branch_id,
            "main_vault": vault_balance,
            "teller_drawers": teller_drawers,
            "momo": {
                "MTN_MOMO": float(branch.mtn_float) if branch.mtn_float is not None else 0.0,
                "ORANGE_MONEY": float(branch.orange_float) if branch.orange_float is not None else 0.0
            },
            "updated_at": datetime.utcnow().isoformat()
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