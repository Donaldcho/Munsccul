from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import date
from pydantic import BaseModel
from typing import Dict, Any

from app.database import get_db
from app import models
from app.auth import get_current_user, require_manager
from app.services.eod import EODService
from app.audit import AuditLogger

router = APIRouter(prefix="/eod", tags=["End of Day Operations"])

class EODStatusResponse(BaseModel):
    date: date
    is_closed: bool
    can_close: bool
    total_debits: float
    total_credits: float
    messages: list[str]
    step_status: Dict[str, bool] # Added to track wizard steps

@router.get("/status", response_model=EODStatusResponse)
async def get_eod_status(
    target_date: date = None,
    current_user: models.User = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Check the End-of-Day status for a specific date (defaults to today).
    Returns whether the day is already closed, and if not, whether it CAN be closed (checks passed).
    """
    if not target_date:
        target_date = EODService.get_current_business_date(db)

    is_closed = EODService.is_date_closed(db, target_date)
    
    if is_closed:
        # If already closed, we just fetch the summary
        closure = EODService.get_or_create_closure_record(db, target_date)
        return {
            "date": target_date,
            "is_closed": True,
            "can_close": False,
            "total_debits": float(closure.total_debits),
            "total_credits": float(closure.total_credits),
            "messages": ["Day is already closed."],
            "step_status": {"step1": True, "step2": True, "step3": True, "step4": True}
        }
    else:
        # Run live checks to see if it can be closed
        checks = EODService.run_eod_checks(db, target_date, current_user.branch_id)
        
        # Determine internal step status (simplified)
        step_status = {
            "step1_reconciliation": not any("reconciliation" in m.lower() for m in checks["messages"]),
            "step2_overrides": not any("overrides" in m.lower() for m in checks["messages"]),
            "step3_interest": False, # Will be set by POST /accrue
            "step4_finalize": checks["can_proceed"]
        }
        
        return {
            "date": target_date,
            "is_closed": False,
            "can_close": checks["can_proceed"],
            "total_debits": checks["total_debits"],
            "total_credits": checks["total_credits"],
            "messages": checks["messages"],
            "step_status": step_status
        }

@router.post("/accrue", response_model=Dict[str, Any])
async def accrue_interest(
    request: Request,
    target_date: date = None,
    current_user: models.User = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Step 3 of EOD Wizard: Post daily interest to savings accounts.
    """
    if not target_date:
        target_date = EODService.get_current_business_date(db)
        
    result = EODService.accrue_interest_daily(db, target_date, current_user.branch_id)
    
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="EOD_INTEREST_ACCRUAL",
        entity_type="Branch",
        entity_id=str(current_user.branch_id),
        description=f"Posted daily interest for {target_date}: {result['total_interest']} XAF across {result['processed_count']} accounts."
    )
    
    return result

@router.post("/finalize")
async def finalize_eod(
    request: Request,
    target_date: date = None,
    current_user: models.User = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """
    Step 4: Final closure and locking of the branch.
    """
    if not target_date:
        target_date = EODService.get_current_business_date(db)

    try:
        closure = EODService.finalize_closure(db, current_user.id, target_date, current_user.branch_id)
        
        # Log successful closure
        audit = AuditLogger(db, current_user, request)
        audit.log(
            action="EOD_CLOSURE",
            entity_type="DailyClosure",
            entity_id=str(closure.id),
            description=f"Successfully closed business day {target_date} for branch {current_user.branch_id}"
        )
        
        return {
            "status": "success",
            "message": f"End-of-Day for {target_date} has been successfully completed and the branch is now LOCKED.",
            "total_debits": float(closure.total_debits),
            "total_credits": float(closure.total_credits)
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
