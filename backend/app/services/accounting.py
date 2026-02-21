from decimal import Decimal
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app import models

class AccountingService:
    """
    Core engine for double-entry bookkeeping (OHADA/COBAC compliant).
    Handles automated journalization of financial transactions.
    """
    
    @staticmethod
    def get_gl_account_by_code(db: Session, code: str) -> Optional[models.GLAccount]:
        return db.query(models.GLAccount).filter(models.GLAccount.account_code == code).first()

    @staticmethod
    def record_transaction(
        db: Session,
        transaction_id: str,
        transaction_type: str,
        amount: Decimal,
        description: str,
        created_by: int,
        debit_gl_code: Optional[str] = None,
        credit_gl_code: Optional[str] = None,
        transaction_date: Optional[datetime] = None
    ) -> List[models.GLJournalEntry]:
        """
        Record a double-entry journal movement for a financial transaction.
        Enforces EOD Immutability.
        """
        from app.services.eod import EODService
        
        now = transaction_date or datetime.utcnow()
        
        # 0. EOD Immutability Check
        if EODService.is_date_closed(db, now.date()):
            raise ValueError(f"Cannot post transactions: The date {now.date()} has been closed.")

        # 1. Determine GL Accounts if not provided directly
        if not debit_gl_code or not credit_gl_code:
            rule = db.query(models.AccountingRule).filter(
                models.AccountingRule.transaction_type == transaction_type,
                models.AccountingRule.is_active == True
            ).first()
            
            if not rule:
                # Fallback or Log: If no rule, we might need manual mapping or fail
                return []
            
            debit_gl = rule.debit_account
            credit_gl = rule.credit_account
        else:
            debit_gl = AccountingService.get_gl_account_by_code(db, debit_gl_code)
            credit_gl = AccountingService.get_gl_account_by_code(db, credit_gl_code)

        if not debit_gl or not credit_gl:
            # Cannot proceed without both GL accounts
            return []

        entries = []
        now = datetime.utcnow()

        # 2. Create Debit Entry
        debit_entry = models.GLJournalEntry(
            entry_date=now,
            transaction_id=transaction_id,
            transaction_type=transaction_type,
            gl_account_id=debit_gl.id,
            amount=amount,
            entry_type="DEBIT",
            description=description,
            created_by=created_by
        )
        db.add(debit_entry)
        entries.append(debit_entry)

        # 3. Create Credit Entry
        credit_entry = models.GLJournalEntry(
            entry_date=now,
            transaction_id=transaction_id,
            transaction_type=transaction_type,
            gl_account_id=credit_gl.id,
            amount=amount,
            entry_type="CREDIT",
            description=description,
            created_by=created_by
        )
        db.add(credit_entry)
        entries.append(credit_entry)

        return entries

    @staticmethod
    def get_trial_balance(db: Session) -> dict:
        """
        Perform a system-wide Trial Balance check.
        Sum(Debits) should equal Sum(Credits).
        """
        debits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            models.GLJournalEntry.entry_type == "DEBIT"
        ).scalar() or Decimal("0")
        
        credits = db.query(func.sum(models.GLJournalEntry.amount)).filter(
            models.GLJournalEntry.entry_type == "CREDIT"
        ).scalar() or Decimal("0")
        
        return {
            "total_debits": debits,
            "total_credits": credits,
            "is_balanced": debits == credits,
            "variance": debits - credits
        }
