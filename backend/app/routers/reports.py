from fastapi import APIRouter, Depends, Query, HTTPException, status, Response, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional, Literal, List

from app.database import get_db
from app import models, schemas
from app.auth import get_current_active_user, get_current_user, require_manager, require_global_reporting_access, require_par_reporting_access, require_audit_access
from app.services.reporting import ReportingService
from app.audit import AuditLogger

router = APIRouter(prefix="/reports", tags=["Regulatory Reports"])

@router.get("/dashboard")
async def get_dashboard(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get high-level dashboard statistics for Admin/Manager views"""
    members_total = db.query(models.Member).count()
    
    accounts_total = db.query(models.Account).count()
    total_deposits = db.query(func.sum(models.Account.balance)).filter(
        models.Account.account_type.in_([models.AccountType.SAVINGS, models.AccountType.CURRENT, models.AccountType.FIXED_DEPOSIT])
    ).scalar() or 0
    
    loans_outstanding = db.query(func.sum(models.Loan.amount_outstanding)).filter(
        models.Loan.status.in_([models.LoanStatus.ACTIVE, models.LoanStatus.DELINQUENT])
    ).scalar() or 0
    
    today = date.today()
    disbursed_today = db.query(func.sum(models.Loan.principal_amount)).filter(
        func.date(models.Loan.disbursement_date) == today
    ).scalar() or 0
    
    collections_today = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.transaction_type == models.TransactionType.LOAN_REPAYMENT,
        func.date(models.Transaction.created_at) == today
    ).scalar() or 0
    
    pending_approvals = (
        db.query(models.Transaction).filter(models.Transaction.sync_status == models.SyncStatus.PENDING).count() +
        db.query(models.Loan).filter(models.Loan.status == models.LoanStatus.PENDING_REVIEW).count() +
        db.query(models.User).filter(models.User.approval_status == models.UserApprovalStatus.PENDING).count()
    )

    dashboard_data = {
        "accounts": {"total": accounts_total, "total_deposits": total_deposits},
        "loans": {"total_outstanding": loans_outstanding, "disbursed_today": disbursed_today, "collections_today": collections_today},
        "pending_approvals": pending_approvals
    }
    
    # Only expose member counts to non-admins (KYC Officers/Managers)
    if current_user.role != models.UserRole.SYSTEM_ADMIN:
        dashboard_data["members"] = {"total": members_total}
    else:
        dashboard_data["members"] = {"total": "RESTRICTED"}

    return dashboard_data


@router.get("/audit-logs", response_model=List[schemas.AuditLogResponse])
async def get_audit_logs(
    limit: int = Query(100),
    skip: int = Query(0),
    current_user: models.User = Depends(require_audit_access),
    db: Session = Depends(get_db)
):
    """Fetch system audit logs for administrators and managers"""
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return logs


def handle_export(format_type: str, report_name: str, title: str, data: any):
    """Utility to handle JSON vs Excel vs PDF responses."""
    if format_type == "json":
        return data
    elif format_type == "excel":
        file_path = ReportingService.export_to_excel(report_name, data)
        return FileResponse(
            path=file_path, 
            filename=f"{report_name}.xlsx", 
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    elif format_type == "pdf":
         # PDF expects a list of dicts. Extract if it's a wrapped dict like Balance Sheet
        export_data = data
        if isinstance(data, dict):
            if "items" in data:
                 export_data = data["items"]
            elif "assets" in data:
                 # Flatten for balance sheet
                 export_data = data["assets"]["items"] + [{"account_code": "", "account_name": "---", "balance": ""}] + \
                               data["liabilities"]["items"] + [{"account_code": "", "account_name": "---", "balance": ""}] + \
                               data["equity"]["items"]
            elif "buckets" in data:
                 export_data = [
                      {"category": "Current", "count": data["buckets"]["current"]["count"], "amount": data["buckets"]["current"]["principal_outstanding"]},
                      {"category": "PAR 30", "count": data["buckets"]["par_30"]["count"], "amount": data["buckets"]["par_30"]["principal_outstanding"]},
                      {"category": "PAR 60", "count": data["buckets"]["par_60"]["count"], "amount": data["buckets"]["par_60"]["principal_outstanding"]},
                      {"category": "PAR 90+", "count": data["buckets"]["par_90_plus"]["count"], "amount": data["buckets"]["par_90_plus"]["principal_outstanding"]}
                 ]

        file_path = ReportingService.export_to_pdf(report_name, title, export_data)
        return FileResponse(
            path=file_path, 
            filename=f"{report_name}.pdf", 
            media_type='application/pdf'
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid format requested.")


@router.get("/trial-balance")
async def get_trial_balance(
    request: Request,
    as_of_date: date = Query(default_factory=date.today),
    format: Literal["json", "excel", "pdf"] = "json",
    current_user: models.User = Depends(require_global_reporting_access),
    db: Session = Depends(get_db)
):
    """Generate Trial Balance (Balance Générale)"""
    audit = AuditLogger(db, current_user, request)
    audit.log("GENERATED_REPORT", "Report", description=f"Downloaded Trial Balance ({format}) for period ending {as_of_date}")
    
    data = ReportingService.generate_trial_balance(db, as_of_date)
    return handle_export(format, "trial_balance", f"Trial Balance as of {as_of_date}", data)

@router.get("/balance-sheet")
async def get_balance_sheet(
    request: Request,
    as_of_date: date = Query(default_factory=date.today),
    format: Literal["json", "excel", "pdf"] = "json",
    current_user: models.User = Depends(require_global_reporting_access),
    db: Session = Depends(get_db)
):
    """Generate Balance Sheet (Bilan)"""
    audit = AuditLogger(db, current_user, request)
    audit.log("GENERATED_REPORT", "Report", description=f"Downloaded Balance Sheet ({format}) as of {as_of_date}")

    data = ReportingService.generate_balance_sheet(db, as_of_date)
    return handle_export(format, "balance_sheet", f"Balance Sheet as of {as_of_date}", data)

@router.get("/income-statement")
async def get_income_statement(
    request: Request,
    start_date: date,
    end_date: date = Query(default_factory=date.today),
    format: Literal["json", "excel", "pdf"] = "json",
    current_user: models.User = Depends(require_global_reporting_access),
    db: Session = Depends(get_db)
):
    """Generate Income Statement (Compte de Résultat)"""
    audit = AuditLogger(db, current_user, request)
    audit.log("GENERATED_REPORT", "Report", description=f"Downloaded Income Statement ({format}) for {start_date} to {end_date}")

    data = ReportingService.generate_income_statement(db, start_date, end_date)
    return handle_export(format, "income_statement", f"Income Statement ({start_date} to {end_date})", data)

@router.get("/par")
async def get_par_report(
    request: Request,
    as_of_date: date = Query(default_factory=date.today),
    format: Literal["json", "excel", "pdf"] = "json",
    current_user: models.User = Depends(require_par_reporting_access),
    db: Session = Depends(get_db)
):
    """Generate Portfolio At Risk (PAR) Report"""
    audit = AuditLogger(db, current_user, request)
    
    # If standard credit officer, filter to their loans. Others see all.
    officer_id = current_user.id if current_user.role == models.UserRole.CREDIT_OFFICER else None
    
    audit.log("GENERATED_REPORT", "Report", description=f"Downloaded PAR Report ({format}) as of {as_of_date}")

    data = ReportingService.generate_par_report(db, as_of_date, officer_id)
    return handle_export(format, "par_report", f"Portfolio At Risk as of {as_of_date}", data)

@router.get("/daily-cash-flow")
async def get_daily_cash_flow(
    request: Request,
    target_date: date = Query(default_factory=date.today),
    format: Literal["json", "excel", "pdf"] = "json",
    current_user: models.User = Depends(require_global_reporting_access),
    db: Session = Depends(get_db)
):
    """Generate Daily Cash Flow Matrix Report"""
    audit = AuditLogger(db, current_user, request)
    audit.log("GENERATED_REPORT", "Report", description=f"Downloaded Daily Cash Flow ({format}) for {target_date}")
    
    data = ReportingService.generate_daily_cash_flow(db, target_date)
    return handle_export(format, "daily_cash_flow", f"Daily Cash Flow Statement for {target_date}", data)