from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app import models, schemas
from app.auth import get_current_active_user, require_board_member
from datetime import datetime

router = APIRouter(prefix="/policies", tags=["Governance & Policies"])

@router.get("/active", response_model=List[schemas.PolicyResponse])
def get_active_policies(db: Session = Depends(get_db)):
    """Fetch all currently active policies"""
    return db.query(models.GlobalPolicy).filter(models.GlobalPolicy.status == models.PolicyStatus.ACTIVE).all()

@router.get("/proposals", response_model=List[schemas.PolicyResponse])
def get_proposals(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Fetch all policies awaiting seconding/approval"""
    return db.query(models.GlobalPolicy).filter(models.GlobalPolicy.status == models.PolicyStatus.PROPOSED).all()

@router.post("/propose", response_model=schemas.PolicyResponse)
def propose_policy(
    proposal: schemas.PolicyProposalCreate,
    current_user: models.User = Depends(require_board_member),
    db: Session = Depends(get_db)
):
    """Maker step: Propose a new policy or override"""
    # Get latest version for this key
    latest = db.query(models.GlobalPolicy).filter(
        models.GlobalPolicy.policy_key == proposal.policy_key
    ).order_by(models.GlobalPolicy.version.desc()).first()
    
    version = (latest.version + 1) if latest else 1
    
    # Check if a proposal already exists for this key
    existing_proposal = db.query(models.GlobalPolicy).filter(
        models.GlobalPolicy.policy_key == proposal.policy_key,
        models.GlobalPolicy.status == models.PolicyStatus.PROPOSED
    ).first()
    
    if existing_proposal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A proposal for {proposal.policy_key} is already pending approval."
        )
    
    new_policy = models.GlobalPolicy(
        policy_key=proposal.policy_key,
        policy_value=proposal.policy_value,
        status=models.PolicyStatus.PROPOSED,
        version=version,
        proposed_by_id=current_user.id,
        change_reason=proposal.change_reason,
        effective_date=proposal.effective_date or datetime.utcnow()
    )
    
    db.add(new_policy)
    db.commit()
    db.refresh(new_policy)
    return new_policy

@router.post("/approve/{policy_id}", response_model=schemas.PolicyResponse)
def approve_policy(
    policy_id: int,
    approval: schemas.PolicyApprovalRequest,
    current_user: models.User = Depends(require_board_member),
    db: Session = Depends(get_db)
):
    """Checker step: Second/Approve a proposed policy"""
    policy = db.query(models.GlobalPolicy).filter(models.GlobalPolicy.id == policy_id).first()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Policy proposal not found")
    
    if policy.status != models.PolicyStatus.PROPOSED:
        raise HTTPException(status_code=400, detail="Only proposed policies can be approved")
    
    if policy.proposed_by_id == current_user.id:
        raise HTTPException(
            status_code=400, 
            detail="Maker-Checker violation: You cannot approve your own proposal."
        )
    
    # 1. Archive current active policy for this key
    db.query(models.GlobalPolicy).filter(
        models.GlobalPolicy.policy_key == policy.policy_key,
        models.GlobalPolicy.status == models.PolicyStatus.ACTIVE
    ).update({"status": models.PolicyStatus.ARCHIVED})
    
    # 2. Activate this policy
    policy.status = models.PolicyStatus.ACTIVE
    policy.approved_by_id = current_user.id
    if approval.reason:
        policy.change_reason = (policy.change_reason or "") + f" | Approval: {approval.reason}"
    
    db.commit()
    db.refresh(policy)
    return policy

@router.get("/history/{key}", response_model=List[schemas.PolicyResponse])
def get_policy_history(key: str, db: Session = Depends(get_db)):
    """Fetch audit trail for a specific policy key"""
    return db.query(models.GlobalPolicy).filter(
        models.GlobalPolicy.policy_key == key
    ).order_by(models.GlobalPolicy.version.desc()).all()
