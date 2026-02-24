"""
Smart Njangi Router - Digitized Tontine Management
Handles group savings, rotating cycles, and automated payouts with Credit Union escrow integration.
"""
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timedelta

from app.database import get_db
from app.auth import get_current_user, generate_transaction_ref
from app import models, schemas
from app.services.accounting import AccountingService
from app.services.njangi_ai import NjangiAIService

router = APIRouter(prefix="/njangi", tags=["Smart Njangi"])

# --- Helper Functions ---

def get_group_or_404(db: Session, group_id: int) -> models.NjangiGroup:
    group = db.query(models.NjangiGroup).filter(models.NjangiGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Njangi Group not found")
    return group

def update_trust_score(membership: models.NjangiMembership, on_time: bool):
    """
    Update trust score and streaks based on payment behavior.
    """
    if on_time:
        membership.on_time_streak += 1
        # Increase trust score by 2 points for every on-time payment, cap at 100
        membership.trust_score = min(Decimal("100.00"), membership.trust_score + Decimal("2.00"))
    else:
        membership.on_time_streak = 0
        # Decrease trust score by 5 points for late/missed payments, floor at 0
        membership.trust_score = max(Decimal("0.00"), membership.trust_score - Decimal("5.00"))
        if membership.trust_score < 30:
            membership.ai_default_risk_flag = True

# --- Endpoints ---

@router.post("/groups", response_model=schemas.NjangiGroupResponse)
def create_njangi_group(
    group_in: schemas.NjangiGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new Njangi group"""
    new_group = models.NjangiGroup(**group_in.dict())
    new_group.status = models.NjangiGroupStatus.DRAFT
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    
    # Automatically add president as first member
    membership = models.NjangiMembership(
        group_id=new_group.id,
        member_id=group_in.president_id,
        payout_order=1,
        trust_score=Decimal("80.00") # Start with higher trust for president
    )
    db.add(membership)
    db.commit()
    
    return new_group

@router.get("/groups", response_model=List[schemas.NjangiGroupResponse])
def list_njangi_groups(db: Session = Depends(get_db)):
    return db.query(models.NjangiGroup).all()

@router.post("/groups/{group_id}/kyc-upload", response_model=schemas.NjangiGroupResponse)
def upload_kyc_documents(
    group_id: int,
    kyc_data: schemas.NjangiGroupKYCUpload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """VERIFIER: Credit Officer uploads KYC docs for a DRAFT group"""
    group = get_group_or_404(db, group_id)
    
    if group.status != models.NjangiGroupStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Group is not in DRAFT status")
        
    group.bylaws_url = kyc_data.bylaws_url
    group.meeting_minutes_url = kyc_data.meeting_minutes_url
    group.status = models.NjangiGroupStatus.PENDING_KYC
    
    db.commit()
    db.refresh(group)
    return group

@router.post("/groups/{group_id}/kyc-approve", response_model=schemas.NjangiGroupResponse)
def approve_kyc_and_activate(
    group_id: int,
    approval_data: schemas.NjangiGroupKYCApprove,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """APPROVER: Ops Manager approves KYC and assigns Escrow GL account"""
    group = get_group_or_404(db, group_id)
    
    if group.status != models.NjangiGroupStatus.PENDING_KYC:
        raise HTTPException(status_code=400, detail="Group is not pending KYC verification")
        
    group.escrow_gl_account_id = approval_data.escrow_gl_account_id
    group.status = models.NjangiGroupStatus.ACTIVE
    
    db.commit()
    db.refresh(group)
    return group

@router.post("/memberships", response_model=schemas.NjangiMembershipResponse)
def join_njangi_group(
    membership_in: schemas.NjangiMembershipBase,
    db: Session = Depends(get_db)
):
    """Add a member to a Njangi group"""
    # Check if membership already exists
    existing = db.query(models.NjangiMembership).filter(
        models.NjangiMembership.group_id == membership_in.group_id,
        models.NjangiMembership.member_id == membership_in.member_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Member already in this group")
        
    new_membership = models.NjangiMembership(**membership_in.dict())
    db.add(new_membership)
    db.commit()
    db.refresh(new_membership)
    return new_membership

@router.get("/groups/{group_id}/members", response_model=List[schemas.NjangiMembershipResponse])
def get_group_members(
    group_id: int,
    db: Session = Depends(get_db)
):
    """Get all members of a Njangi group"""
    get_group_or_404(db, group_id)
    return db.query(models.NjangiMembership).filter(models.NjangiMembership.group_id == group_id).all()

@router.post("/contributions", response_model=schemas.NjangiContributionResponse)
def record_contribution(
    contribution_in: schemas.NjangiContributionBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Record a contribution and trigger the Escrow Bridge.
    Ideally, this handles "progressive" installments.
    """
    cycle = db.query(models.NjangiCycle).filter(models.NjangiCycle.id == contribution_in.cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
        
    membership = db.query(models.NjangiMembership).filter(
        models.NjangiMembership.group_id == cycle.group_id,
        models.NjangiMembership.member_id == contribution_in.member_id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=404, detail="Member not in this group")

    # 1. Create the NjangiContribution record
    new_contribution = models.NjangiContribution(**contribution_in.dict())
    
    # Logic for status (On Time vs Late)
    if datetime.utcnow() <= cycle.due_date:
        new_contribution.status = models.ContributionStatus.PAID_ON_TIME
        update_trust_score(membership, True)
    else:
        new_contribution.status = models.ContributionStatus.PAID_LATE
        update_trust_score(membership, False)
        
    db.add(new_contribution)
    
    # 2. Trigger the "Bridge" - Create a MUNSCCUL Transaction
    group = get_group_or_404(db, cycle.group_id)
    escrow_account = db.query(models.Account).filter(models.Account.id == group.escrow_gl_account_id).first()
    if not escrow_account:
        raise HTTPException(status_code=500, detail="Group Escrow Account is not configured.")

    escrow_account.balance += contribution_in.amount_paid

    trans_ref = generate_transaction_ref()
    transaction = models.Transaction(
        transaction_ref=trans_ref,
        account_id=escrow_account.id,
        transaction_type=models.TransactionType.NJANGI_CONTRIBUTION,
        amount=contribution_in.amount_paid,
        balance_after=escrow_account.balance,
        description=f"Njangi Contribution: Group {cycle.group_id} Cycle {cycle.cycle_number}",
        payment_channel=contribution_in.payment_channel,
        created_by=current_user.id
    )
    db.add(transaction)
    db.flush() # Get transaction ID
    
    # Double Entry Accounting
    AccountingService.record_transaction(
        db=db,
        transaction_id=str(transaction.id),
        transaction_type=transaction.transaction_type.value,
        amount=transaction.amount,
        description=transaction.description,
        created_by=current_user.id,
        debit_gl_code="1010", 
        credit_gl_code="2020" 
    )
    
    new_contribution.transaction_id = transaction.id
    
    # 3. Update Cycle stats
    cycle.current_pot_amount += contribution_in.amount_paid
    if cycle.current_pot_amount >= cycle.pot_target_amount:
        cycle.status = models.CycleStatus.READY_FOR_PAYOUT
        
    db.commit()
    db.refresh(new_contribution)
    return new_contribution

@router.get("/ledger/{group_id}")
def get_group_ledger(group_id: int, db: Session = Depends(get_db)):
    """Return a transparent view of all contributions for the current cycle"""
    group = get_group_or_404(db, group_id)
    current_cycle = db.query(models.NjangiCycle).filter(
        models.NjangiCycle.group_id == group_id,
        models.NjangiCycle.status != models.CycleStatus.COMPLETED
    ).order_by(models.NjangiCycle.cycle_number.asc()).first()
    
    if not current_cycle:
        return {"message": "No active cycle"}
        
    contributions = db.query(models.NjangiContribution).filter(
        models.NjangiContribution.cycle_id == current_cycle.id
    ).all()
    
    return {
        "cycle_number": current_cycle.cycle_number,
        "due_date": current_cycle.due_date,
        "pot_target": current_cycle.pot_target_amount,
        "current_pot": current_cycle.current_pot_amount,
        "contributions": contributions
    }

@router.post("/disburse/{cycle_id}", response_model=schemas.NjangiPayoutResponse)
def disburse_payout(
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Finalize a cycle by disbursing the "Pot" to the recipient's formal savings account.
    This is "The Bridge" from informal escrow back to personal wealth.
    """
    cycle = db.query(models.NjangiCycle).filter(models.NjangiCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
        
    if cycle.status == models.CycleStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Payout already disbursed for this cycle")
        
    group = get_group_or_404(db, cycle.group_id)
    
    # 1. Identity the recipient's destination account (usually their primary savings)
    recipient_account = db.query(models.Account).filter(
        models.Account.member_id == cycle.recipient_member_id,
        models.Account.account_type == models.AccountType.SAVINGS
    ).first()
    
    if not recipient_account:
        raise HTTPException(status_code=400, detail="Recipient has no active savings account")
        
    
    # Ensure escrow account exists
    escrow_account = db.query(models.Account).filter(models.Account.id == group.escrow_gl_account_id).first()
    if not escrow_account:
        raise HTTPException(status_code=500, detail="Group Escrow Account is not configured.")

    # Decrease Escrow logically
    escrow_account.balance -= cycle.current_pot_amount

    # Increase Member Savings
    recipient_account.balance += cycle.current_pot_amount

    # 2. Record the DISBURSEMENT transaction in MUNSCCUL
    trans_ref = generate_transaction_ref()
    transaction = models.Transaction(
        transaction_ref=trans_ref,
        account_id=recipient_account.id,
        transaction_type=models.TransactionType.NJANGI_PAYOUT,
        amount=cycle.current_pot_amount,
        balance_after=recipient_account.balance,
        description=f"Njangi Payout: Group {group.name} Cycle {cycle.cycle_number}",
        payment_channel=models.PaymentChannel.BANK_TRANSFER,
        created_by=current_user.id
    )
    db.add(transaction)
    db.flush()
    
    AccountingService.record_transaction(
        db=db,
        transaction_id=str(transaction.id),
        transaction_type=transaction.transaction_type.value,
        amount=transaction.amount,
        description=transaction.description,
        created_by=current_user.id,
        debit_gl_code="2020", # Debit Escrow (reducing liability)
        credit_gl_code="2010" # Credit Member Savings (increasing liability)
    )
    
    # 3. Create the NjangiPayout record
    payout = models.NjangiPayout(
        cycle_id=cycle.id,
        recipient_member_id=cycle.recipient_member_id,
        amount_disbursed=cycle.current_pot_amount,
        destination_account_id=recipient_account.id,
        status=models.PayoutStatus.DISBURSED,
        transaction_id=transaction.id,
        disbursed_at=datetime.utcnow()
    )
    db.add(payout)
    
    # 4. Finalize Cycle
    cycle.status = models.CycleStatus.COMPLETED
    
    # 5. Generate AI Insight for next round
    insight = models.NjangiAIInsight(
        group_id=group.id,
        insight_type=models.InsightType.STREAK_ACHIEVEMENT,
        message=f"Cycle {cycle.cycle_number} completed successfully. {cycle.current_pot_amount} XAF disbursed."
    )
    db.add(insight)
    
    db.commit()
    db.refresh(payout)
    return payout

@router.get("/status/member/{member_id}", response_model=schemas.MemberNjangiStatusResponse)
def get_member_njangi_status(member_id: int, db: Session = Depends(get_db)):
    """Fetch trust score and membership summary for a member"""
    memberships = db.query(models.NjangiMembership).options(
        joinedload(models.NjangiMembership.group)
    ).filter(
        models.NjangiMembership.member_id == member_id
    ).all()
    
    if not memberships:
        return {"memberships": [], "aggregate_trust_score": 0}
        
    avg_trust = db.query(func.avg(models.NjangiMembership.trust_score)).filter(
        models.NjangiMembership.member_id == member_id
    ).scalar()
    
    return {
        "memberships": memberships,
        "aggregate_trust_score": float(avg_trust) if avg_trust else 0
    }

@router.get("/readiness/{member_id}", response_model=schemas.NjangiReadinessResponse)
def get_loan_readiness(member_id: int, db: Session = Depends(get_db)):
    """
    Fetch loan readiness score based on Njangi history.
    """
    return NjangiAIService.calculate_loan_readiness(member_id, db)

@router.get("/insights/{group_id}", response_model=List[schemas.NjangiAIInsightResponse])
def get_group_insights(group_id: int, db: Session = Depends(get_db)):
    """
    Fetch and generate new AI insights for the group.
    """
    # Generate new insights before returning
    NjangiAIService.analyze_group_health(group_id, db)
    
    return db.query(models.NjangiAIInsight).filter(
        models.NjangiAIInsight.group_id == group_id
    ).order_by(models.NjangiAIInsight.created_at.desc()).limit(10).all()

@router.post("/groups/{group_id}/members", response_model=schemas.NjangiMembershipResponse)
def add_member_to_group(
    group_id: int,
    membership_in: schemas.NjangiMembershipBase,
    db: Session = Depends(get_db)
):
    """Add a member to a Njangi group"""
    if membership_in.group_id != group_id:
        raise HTTPException(status_code=400, detail="Group ID mismatch")
        
    # Check if membership already exists
    existing = db.query(models.NjangiMembership).filter(
        models.NjangiMembership.group_id == group_id,
        models.NjangiMembership.member_id == membership_in.member_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Member already in this group")
        
    new_membership = models.NjangiMembership(**membership_in.dict())
    db.add(new_membership)
    db.commit()
    db.refresh(new_membership)
    return new_membership

@router.post("/groups/{group_id}/cycles", response_model=schemas.NjangiCycleResponse)
def start_new_cycle(
    group_id: int,
    cycle_in: schemas.NjangiCycleBase,
    db: Session = Depends(get_db)
):
    """Start a new contribution cycle for the group"""
    group = get_group_or_404(db, group_id)
    
    # Check for active cycle
    active_cycle = db.query(models.NjangiCycle).filter(
        models.NjangiCycle.group_id == group_id,
        models.NjangiCycle.status != models.CycleStatus.COMPLETED
    ).first()
    
    if active_cycle:
        raise HTTPException(status_code=400, detail="An active cycle already exists for this group")
        
    new_cycle = models.NjangiCycle(**cycle_in.dict())
    new_cycle.current_pot_amount = Decimal("0.00")
    new_cycle.status = models.CycleStatus.COLLECTING
    
    db.add(new_cycle)
    db.commit()
    db.refresh(new_cycle)
    return new_cycle
