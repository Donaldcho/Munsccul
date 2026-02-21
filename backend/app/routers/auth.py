"""
Authentication Router
Handles user login, logout, and token management
"""
from typing import Optional
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.auth import (
    authenticate_user, 
    create_access_token, 
    get_password_hash,
    get_current_user,
    require_admin,
    require_ops_manager,
    require_role
)
from app.audit import AuditLogger
from app import models, schemas

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


# Removed basic login in favor of auth_enhanced for SOP compliance (is_active check)


@router.post("/logout")
async def logout(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout user (client should discard token)
    """
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="LOGOUT",
        entity_type="User",
        entity_id=str(current_user.id),
        description=f"User {current_user.username} logged out"
    )
    
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=schemas.UserResponse)
async def get_current_user_info(
    current_user: models.User = Depends(get_current_user)
):
    """
    Get current authenticated user's information
    """
    return schemas.UserResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    request: Request,
    old_password: str,
    new_password: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change user password
    
    - **old_password**: Current password
    - **new_password**: New password (min 8 characters)
    """
    from app.auth import verify_password
    
    # Verify old password
    if not verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    # Log password change
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="PASSWORD_CHANGE",
        entity_type="User",
        entity_id=str(current_user.id),
        description=f"User {current_user.username} changed password"
    )
    
    return {"message": "Password changed successfully"}


# Admin-only endpoints for user management
@router.post("/users", response_model=schemas.UserResponse)
async def create_user(
    request: Request,
    user_data: schemas.UserCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user (Admin only)
    """
    # Check if username exists
    existing = db.query(models.User).filter(
        models.User.username == user_data.username
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check if email exists
    if user_data.email:
        existing_email = db.query(models.User).filter(
            models.User.email == user_data.email
        ).first()
        
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )
    
    # Create user with Pending status (Maker-Checker)
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role,
        branch_id=user_data.branch_id,
        is_active=False,  # Level 3 Handover activation
        approval_status=models.UserApprovalStatus.PENDING,
        created_by=current_user.id
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Log user creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="User",
        entity_id=str(new_user.id),
        new_values={
            "username": new_user.username,
            "role": new_user.role.value,
            "branch_id": new_user.branch_id,
            "approval_status": "PENDING",
            "created_by": current_user.username
        }
    )
    
    return schemas.UserResponse.model_validate(new_user)


@router.put("/users/{user_id}/approve")
async def approve_user(
    request: Request,
    user_id: int,
    approval: schemas.UserApprovalRequest,
    current_user: models.User = Depends(require_ops_manager),
    db: Session = Depends(get_db)
):
    """
    Approve or Reject a user (Ops Manager - Level 2)
    """

    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.approval_status != models.UserApprovalStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is already {user.approval_status.value}"
        )
        
    # Update status
    if approval.approve:
        user.approval_status = models.UserApprovalStatus.APPROVED
        user.approved_by = current_user.id
        user.transaction_limit = approval.transaction_limit
        user.is_active = True # Activating the account (Level 2)
        action = "USER_APPROVED"
        desc = f"User {user.username} approved with limit {approval.transaction_limit} by {current_user.username}"
    else:
        user.approval_status = models.UserApprovalStatus.REJECTED
        user.is_active = False
        action = "USER_REJECTED"
        desc = f"User {user.username} rejected by {current_user.username}"
        
    db.commit()
    
    # Log approval
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action=action,
        entity_type="User",
        entity_id=str(user.id),
        description=desc
    )
    
    return {"message": "User approval status updated", "status": user.approval_status}


@router.get("/users", response_model=list[schemas.UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    branch_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all users with optional filters
    """
    query = db.query(models.User)
    
    if role:
        role = role.upper()
        query = query.filter(models.User.role == role)
    
    if branch_id:
        query = query.filter(models.User.branch_id == branch_id)
    
    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)
    
    users = query.offset(skip).limit(limit).all()
    
    return [schemas.UserResponse.model_validate(u) for u in users]


@router.get("/users/{user_id}", response_model=schemas.UserResponse)
async def get_user(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user by ID
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return schemas.UserResponse.model_validate(user)


@router.put("/users/{user_id}", response_model=schemas.UserResponse)
async def update_user(
    request: Request,
    user_id: int,
    user_data: schemas.UserUpdate,
    current_user: models.User = Depends(require_role(["SYSTEM_ADMIN", "OPS_MANAGER"])),
    db: Session = Depends(get_db)
):
    """
    Update user (Admin or Ops Manager)
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Store old values for audit
    old_values = {
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "branch_id": user.branch_id,
        "is_active": user.is_active
    }
    
    # Update fields
    if user_data.email is not None:
        user.email = user_data.email
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.branch_id is not None:
        user.branch_id = user_data.branch_id
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    
    # Log update
    audit = AuditLogger(db, current_user, request)
    audit.log_update(
        entity_type="User",
        entity_id=str(user.id),
        old_values=old_values,
        new_values={
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "branch_id": user.branch_id,
            "is_active": user.is_active
        }
    )
    
    return schemas.UserResponse.model_validate(user)