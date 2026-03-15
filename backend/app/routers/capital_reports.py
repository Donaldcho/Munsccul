from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models
from pydantic import BaseModel
from typing import List, Dict, Any

router = APIRouter(prefix="/api/v1/capital/reports", tags=["Capital Reports"])

class BranchBalance(BaseModel):
    branch_id: int
    branch_name: str
    total_debits: float
    total_credits: float
    net_balance: float

class GlobalTrialBalanceResponse(BaseModel):
    gl_account_code: str
    gl_account_name: str
    global_balance: float
    branch_breakdown: List[BranchBalance]

@router.get("/global-trial-balance", response_model=List[GlobalTrialBalanceResponse])
def get_global_trial_balance(db: Session = Depends(get_db)):
    """
    Capital HQ Endpoint: Aggregates the balances of all branches to produce 
    the COBAC-compliant Global Trial Balance for the Board of Directors.
    """
    # 1. Query the Central Ledger grouping by GL Code AND Branch ID
    # This sums the journal entries which are the source of truth for GL
    results = db.query(
        models.GLJournalEntry.account_code,
        models.Branch.id.label("branch_id"),
        models.Branch.name.label("branch_name"),
        func.sum(CASE([(models.GLJournalEntry.entry_type == "DEBIT", models.GLJournalEntry.amount)], else_=0)).label("debits"),
        func.sum(CASE([(models.GLJournalEntry.entry_type == "CREDIT", models.GLJournalEntry.amount)], else_=0)).label("credits")
    ).join(
        models.Branch, models.Branch.id == models.GLJournalEntry.branch_id
    ).group_by(
        models.GLJournalEntry.account_code,
        models.Branch.id,
        models.Branch.name
    ).all()

    # We need CASE from sqlalchemy
    from sqlalchemy import CASE

    # 2. Get GL Account names for the report
    gl_accounts = {acc.account_code: acc.account_name for acc in db.query(models.GLAccount).all()}

    # 3. Format the response
    report_map = {}
    for row in results:
        code = row.account_code
        if code not in report_map:
            report_map[code] = {
                "gl_account_code": code,
                "gl_account_name": gl_accounts.get(code, "Unknown Account"),
                "global_balance": 0.0,
                "branch_breakdown": []
            }
        
        debits = float(row.debits)
        credits = float(row.credits)
        # Simplified net balance (Debit - Credit)
        # In reality, this depends on the account type (Asset/Liability)
        net = debits - credits
        
        report_map[code]["global_balance"] += net
        report_map[code]["branch_breakdown"].append({
            "branch_id": row.branch_id,
            "branch_name": row.branch_name,
            "total_debits": debits,
            "total_credits": credits,
            "net_balance": net
        })

    return list(report_map.values())
