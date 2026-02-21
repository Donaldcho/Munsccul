"""
Branch Management Router
Handles branch operations and administration
"""
from typing import Optional, List
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

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


@router.get("/{branch_id}/stats")
async def get_branch_stats(
    branch_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get statistics for a specific branch
    """
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    # Count members
    member_count = db.query(models.Member).filter(
        models.Member.branch_id == branch_id,
        models.Member.is_active == True
    ).count()
    
    # Count accounts
    account_count = db.query(models.Account).join(models.Member).filter(
        models.Member.branch_id == branch_id,
        models.Account.is_active == True
    ).count()
    
    # Total deposits
    from sqlalchemy import func
    from decimal import Decimal
    
    total_deposits = db.query(func.sum(models.Account.balance)).join(models.Member).filter(
        models.Member.branch_id == branch_id,
        models.Account.is_active == True
    ).scalar() or Decimal("0")
    
    # Count users
    user_count = db.query(models.User).filter(
        models.User.branch_id == branch_id,
        models.User.is_active == True
    ).count()
    
    return {
        "branch": {
            "id": branch_id,
            "name": branch.name,
            "code": branch.code
        },
        "stats": {
            "members": member_count,
            "accounts": account_count,
            "total_deposits": float(total_deposits),
            "users": user_count
        }
    }