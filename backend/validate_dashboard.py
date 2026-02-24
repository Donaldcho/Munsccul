import sys
import os
from datetime import date
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models, schemas
from sqlalchemy import func

def validate_dashboard():
    db = SessionLocal()
    print("Validating Dashboard endpoint logic...")
    try:
        # Mock a user
        user = db.query(models.User).first()
        if not user:
            print("No users found in DB to mock current_user.")
            return

        print(f"Mocking user: {user.username} (Role: {user.role})")

        # 1. Members count
        members_total = db.query(models.Member).count()
        print(f"Members total: {members_total}")
        
        # 2. Accounts total
        accounts_total = db.query(models.Account).count()
        print(f"Accounts total: {accounts_total}")
        
        # 3. Total deposits
        total_deposits = db.query(func.sum(models.Account.balance)).filter(
            models.Account.account_type.in_([models.AccountType.SAVINGS, models.AccountType.CURRENT, models.AccountType.FIXED_DEPOSIT])
        ).scalar() or 0
        print(f"Total deposits: {total_deposits}")
        
        # 4. Loans outstanding
        loans_outstanding = db.query(func.sum(models.Loan.amount_outstanding)).filter(
            models.Loan.status.in_([models.LoanStatus.ACTIVE, models.LoanStatus.DELINQUENT])
        ).scalar() or 0
        print(f"Loans outstanding: {loans_outstanding}")
        
        # 5. Disbursed today
        today = date.today()
        disbursed_today = db.query(func.sum(models.Loan.principal_amount)).filter(
            func.date(models.Loan.disbursement_date) == today
        ).scalar() or 0
        print(f"Disbursed today: {disbursed_today}")
        
        # 6. Collections today
        collections_today = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.transaction_type == models.TransactionType.LOAN_REPAYMENT,
            func.date(models.Transaction.created_at) == today
        ).scalar() or 0
        print(f"Collections today: {collections_today}")
        
        # 7. Pending approvals
        pending_approvals = (
            db.query(models.Transaction).filter(models.Transaction.sync_status == models.SyncStatus.PENDING).count() +
            db.query(models.Loan).filter(models.Loan.status == models.LoanStatus.PENDING_REVIEW).count() +
            db.query(models.User).filter(models.User.approval_status == models.UserApprovalStatus.PENDING).count()
        )
        print(f"Pending approvals: {pending_approvals}")

        print("SUCCESS: Dashboard logic executed without errors.")

    except Exception as e:
        print(f"FAILURE: Dashboard logic failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    validate_dashboard()
