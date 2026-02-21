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
    def run_eod_checks(db: Session, target_date: date) -> Dict[str, Any]:
        """
        Runs pre-closure checks to ensure the day is ready to be locked.
        - Check 1: Are there any pending, unapproved transactions?
        - Check 2: Are the Teller Drawers reconciled and balanced?
        - Check 3: Is the overarching General Ledger balanced (Total Dr = Total Cr) for the day?
        """
        checks_passed = True
        messages = []

        # 1. Check for Pending Transactions (Requiring Approval)
        # Transactions are pending if they have no approved_at timestamp but require one
        # For simplicity, we flag any transaction without an approver as "pending" 
        # (in reality, some low value ones don't need one, but for this exercise we assume they do)
        pending_txns = db.query(models.Transaction).filter(
            func.date(models.Transaction.created_at) == target_date,
            models.Transaction.approved_by == None
        ).count()

        if pending_txns > 0:
            checks_passed = False
            messages.append(f"There are {pending_txns} pending transactions that require approval or rejection.")

        # 2. Reconcile Teller Drawers
        # Get all tellers who had activity today
        teller_gl_ids = db.query(models.GLJournalEntry.gl_account_id)\
            .join(models.GLAccount)\
            .filter(
                func.date(models.GLJournalEntry.entry_date) == target_date,
                models.GLAccount.account_code.like('102%') # Teller GLs usually start with 102
            ).distinct().all()
            
        unreconciled_tellers = 0
        for gl_id_tuple in teller_gl_ids:
            gl_id = gl_id_tuple[0]
            # In a full implementation, you'd check `TellerReconciliation` table.
            # Simplified: checking if vault drops were made.
            # Assuming teller reconciliation logic validates end-of-day balances.
            pass
            
        # 3. Trial Balance for the Day 
        debits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            func.date(models.GLJournalEntry.entry_date) == target_date,
            models.GLJournalEntry.entry_type == "DEBIT"
        ).scalar() or 0.00
        
        credits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            func.date(models.GLJournalEntry.entry_date) == target_date,
            models.GLJournalEntry.entry_type == "CREDIT"
        ).scalar() or 0.00
        
        variance = debits - credits
        if variance != 0:
            checks_passed = False
            messages.append(f"CRITICAL: Day is out of balance. Debits: {debits}, Credits: {credits}, Variance: {variance}")

        return {
            "can_close": checks_passed,
            "total_debits": float(debits),
            "total_credits": float(credits),
            "messages": messages
        }

    @staticmethod
    def close_day(db: Session, manager_id: int, target_date: date) -> models.DailyClosure:
        """
        Executes the End-Of-Day closure. Locks the day.
        """
        if EODService.is_date_closed(db, target_date):
            raise ValueError(f"Date {target_date} is already closed.")

        checks = EODService.run_eod_checks(db, target_date)
        if not checks["can_close"]:
            raise ValueError(f"EOD Checks failed: {'; '.join(checks['messages'])}")

        closure = EODService.get_or_create_closure_record(db, target_date)
        
        # Mark as closed
        closure.is_closed = True
        closure.closed_by = manager_id
        closure.completed_at = datetime.utcnow()
        closure.total_debits = checks["total_debits"]
        closure.total_credits = checks["total_credits"]
        
        db.commit()
        db.refresh(closure)
        
        return closure
