from datetime import datetime, date
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.services.accounting import AccountingService

class EODService:
    """
    End-of-Day (EOD) Processing Service
    Handles systemic daily closure, teller reconciliation checks, and GL immutability enforcement.
    """

    @staticmethod
    def get_current_business_date(db: Session) -> date:
        """
        Gets the current logical business date. 
        In a standard setup, this is today's date, or the first open day if prior days are closed.
        """
        return datetime.utcnow().date()

    @staticmethod
    def is_date_closed(db: Session, target_date: date) -> bool:
        """
        Check if a specific date has been successfully closed.
        Once closed, no transactions can be posted with this Date.
        """
        closure = db.query(models.DailyClosure).filter(
            func.date(models.DailyClosure.closure_date) == target_date
        ).first()
        
        return closure is not None and closure.is_closed

    @staticmethod
    def get_or_create_closure_record(db: Session, target_date: date) -> models.DailyClosure:
        """
        Retrieves the closure record for a specific date, creating it if it doesn't exist.
        """
        closure = db.query(models.DailyClosure).filter(
            func.date(models.DailyClosure.closure_date) == target_date
        ).first()

        if not closure:
            # Create a pending closure record
            closure = models.DailyClosure(
                closure_date=datetime.combine(target_date, datetime.min.time()),
                is_closed=False
            )
            db.add(closure)
            db.commit()
            db.refresh(closure)
            
        return closure

    @staticmethod
    def run_eod_checks(db: Session, target_date: date, branch_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Runs pre-closure checks (Step 1 & 2 of Wizard).
        - Check 1: Any pending teller reconciliations?
        - Check 2: Any pending transaction overrides?
        - Check 3: Is GL balanced?
        """
        checks_passed = True
        messages = []
        
        # 1. Check for Pending Overrides
        # We now have TransactionOverride model
        pending_overrides = db.query(models.TransactionOverride).filter(
            models.TransactionOverride.status == models.OverrideStatus.PENDING
        )
        if branch_id:
            pending_overrides = pending_overrides.filter(models.TransactionOverride.branch_id == branch_id)
        
        pending_count = pending_overrides.count()
        if pending_count > 0:
            checks_passed = False
            messages.append(f"Blocker: {pending_count} pending transaction overrides require manager attention.")

        # 2. Check for Pending Teller Reconciliations (Blind EOD)
        # Tellers must submit blind reconciliation before manager can close the day
        # We look for any active teller in this branch who has not submitted a reconciliation today
        tellers = db.query(models.User).filter(
            models.User.role == models.UserRole.TELLER,
            models.User.is_active == True
        )
        if branch_id:
            tellers = tellers.filter(models.User.branch_id == branch_id)
        
        for teller in tellers.all():
            reconciled = db.query(models.TellerReconciliation).filter(
                models.TellerReconciliation.teller_id == teller.id,
                func.date(models.TellerReconciliation.created_at) == target_date
            ).first()
            if not reconciled:
                checks_passed = False
                messages.append(f"Blocker: Teller {teller.full_name} has not submitted EOD reconciliation.")

        # 3. Trial Balance check
        debits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            func.date(models.GLJournalEntry.entry_date) == target_date,
            models.GLJournalEntry.entry_type == "DEBIT"
        ).scalar() or 0.00
        
        credits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            func.date(models.GLJournalEntry.entry_date) == target_date,
            models.GLJournalEntry.entry_type == "CREDIT"
        ).scalar() or 0.00
        
        if abs(debits - credits) > 0.01:
            checks_passed = False
            messages.append(f"CRITICAL: Branch is out of balance. Δ: {abs(debits - credits)}")

        return {
            "can_proceed": checks_passed,
            "total_debits": float(debits),
            "total_credits": float(credits),
            "messages": messages
        }

    @staticmethod
    def accrue_interest_daily(db: Session, target_date: date, branch_id: int) -> Dict[str, Any]:
        """
        Step 3: Accrue/Post daily interest for savings accounts.
        Typically happens just before closure.
        """
        from decimal import Decimal
        from app.auth import generate_transaction_ref
        
        accounts = db.query(models.Account).join(models.Member).filter(
            models.Member.branch_id == branch_id,
            models.Account.is_active == True,
            models.Account.interest_rate > 0
        ).all()
        
        processed_count = 0
        total_interest = Decimal("0")
        
        for account in accounts:
            # Daily interest = (Balance * Rate) / 365 / 100
            daily_rate = account.interest_rate / Decimal("365") / Decimal("100")
            interest = (account.balance * daily_rate).quantize(Decimal("0.01"))
            
            if interest > 0:
                # In a real system, we'd accrue to a separate GL and post monthly.
                # For this MVP, we post daily for demonstration.
                txn = models.Transaction(
                    transaction_ref=generate_transaction_ref(),
                    account_id=account.id,
                    transaction_type=models.TransactionType.INTEREST,
                    amount=interest,
                    balance_after=account.balance + interest,
                    status="COMPLETED",
                    description=f"Daily interest accrual for {target_date}",
                    created_by=1, # System user
                    approved_by=1
                )
                account.balance += interest
                account.available_balance += interest
                db.add(txn)
                total_interest += interest
                processed_count += 1
        
        db.commit()
        return {
            "status": "success",
            "processed_count": processed_count,
            "total_interest": float(total_interest)
        }

    @staticmethod
    def finalize_closure(db: Session, manager_id: int, target_date: date, branch_id: int) -> models.DailyClosure:
        """
        Step 4: Final signature and lock.
        Also toggles branch status to CLOSED.
        """
        branch = db.query(models.Branch).filter(models.Branch.id == branch_id).first()
        if not branch:
            raise ValueError("Branch not found")
            
        # Run final checks
        checks = EODService.run_eod_checks(db, target_date, branch_id)
        if not checks["can_proceed"]:
            raise ValueError(f"Final checks failed: {'; '.join(checks['messages'])}")

        closure = EODService.get_or_create_closure_record(db, target_date)
        
        # Mark as closed
        closure.is_closed = True
        closure.closed_by = manager_id
        closure.completed_at = datetime.utcnow()
        closure.total_debits = checks["total_debits"]
        closure.total_credits = checks["total_credits"]
        
        # Lock the branch
        branch.status = models.BranchStatus.CLOSED
        
        db.commit()
        db.refresh(closure)
        
        return closure
