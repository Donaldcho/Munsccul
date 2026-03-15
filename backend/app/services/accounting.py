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
            
            debit_gl_code = rule.debit_account.account_code
            credit_gl_code = rule.credit_account.account_code
        
        # 2. Get GL accounts
        debit_gl = AccountingService.get_gl_account_by_code(db, debit_gl_code)
        credit_gl = AccountingService.get_gl_account_by_code(db, credit_gl_code)
        
        if not debit_gl:
            raise ValueError(f"CRITICAL: Debit GL Account {debit_gl_code} not found in Chart of Accounts.")
        if not credit_gl:
            raise ValueError(f"CRITICAL: Credit GL Account {credit_gl_code} not found in Chart of Accounts.")

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
    def get_policy_value(db: Session, key: str, default: str) -> str:
        """Fetch a dynamic policy value from the database."""
        policy = db.query(models.GlobalPolicy).filter(
            models.GlobalPolicy.policy_key == key,
            models.GlobalPolicy.status == models.PolicyStatus.ACTIVE
        ).first()
        return policy.policy_value if policy else default

    @staticmethod
    def record_inter_branch_withdrawal(
        db: Session,
        member_savings_gl: str,
        serving_branch_teller_gl: str,
        amount: Decimal,
        home_branch_id: int,
        serving_branch_id: int,
        reference: str,
        created_by: int
    ):
        """
        Record a cross-branch withdrawal using Class 8 Clearing accounts.
        Ensures the network balances out at HQ.
        """
        transit_gl = AccountingService.get_policy_value(db, "gl_map_inter_branch_transit", "8010")
        
        # 1. At Serving Branch (where member is standing)
        # Debit: Inter-Branch Transit (Asset - "They owe us")
        # Credit: Teller Drawer (Asset - "Cash is gone")
        AccountingService.record_transaction(
            db=db,
            transaction_id=f"SERV-{reference}",
            transaction_type="INTER_BRANCH_CLEARING",
            amount=amount,
            description=f"Inter-branch withdrawal: Serving {serving_branch_id} for Home {home_branch_id}",
            created_by=created_by,
            debit_gl_code=transit_gl,
            credit_gl_code=serving_branch_teller_gl
        )
        
        # 2. At Home Branch (where member's account belongs)
        # Debit: Member Savings (Liability - "Savings decreased")
        # Credit: Inter-Branch Transit (Liability - "We owe them")
        AccountingService.record_transaction(
            db=db,
            transaction_id=f"HOME-{reference}",
            transaction_type="INTER_BRANCH_CLEARING",
            amount=amount,
            description=f"Inter-branch withdrawal: Home {home_branch_id} payout at {serving_branch_id}",
            created_by=created_by,
            debit_gl_code=member_savings_gl,
            credit_gl_code=transit_gl
        )

    @staticmethod
    def record_eod_cash_variance(
        db: Session,
        branch_id: int,
        expected_amount: Decimal,
        actual_amount: Decimal,
        teller_gl: str,
        reference: str,
        created_by: int
    ) -> Decimal:
        """
        Auto-journal cash discrepancies discovered during EOD.
        """
        variance = Decimal(str(actual_amount)) - Decimal(str(expected_amount))
        if variance == 0:
            return variance

        if variance < 0:
            # Shortage: Teller lost money (Expense)
            # Debit: Shortage GL (5900)
            # Credit: Teller GL (1020)
            shortage_gl = AccountingService.get_policy_value(db, "gl_map_eod_shortage", "5900")
            AccountingService.record_transaction(
                db=db,
                transaction_id=reference,
                transaction_type="EOD_SHORTAGE",
                amount=abs(variance),
                description=f"EOD Cash Shortage: Ref {reference}",
                created_by=created_by,
                debit_gl_code=shortage_gl,
                credit_gl_code=teller_gl
            )
        else:
            # Overage: Teller has extra money (Income)
            # Debit: Teller GL (1020)
            # Credit: Overage GL (4900)
            overage_gl = AccountingService.get_policy_value(db, "gl_map_eod_overage", "4900")
            AccountingService.record_transaction(
                db=db,
                transaction_id=reference,
                transaction_type="EOD_OVERAGE",
                amount=variance,
                description=f"EOD Cash Overage: Ref {reference}",
                created_by=created_by,
                debit_gl_code=teller_gl,
                credit_gl_code=overage_gl
            )
            
        return variance

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
