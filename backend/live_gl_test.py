import sys
import os
from decimal import Decimal
from datetime import datetime

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models
from app.services.accounting import AccountingService

def run_live_test():
    db = SessionLocal()
    try:
        print("Starting Live GL Posting Test...")
        
        # 1. Setup Data (Member, Account, User)
        teller = db.query(models.User).filter(models.User.username == "teller").first()
        if not teller:
            print("Error: Teller user not found. Run seed_data.py first.")
            return

        # Ensure teller has a GL account
        if not teller.teller_gl_account_id:
            teller_gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == "1020").first()
            if teller_gl:
                teller.teller_gl_account_id = teller_gl.id
                db.commit()

        branch = db.query(models.Branch).filter(models.Branch.id == teller.branch_id).first()
        
        # Create a test member/account if missing
        member = db.query(models.Member).first()
        if not member:
            print("Creating test member...")
            member = models.Member(
                member_id="TEST001",
                first_name="Test",
                last_name="Member",
                phone_primary="123456789",
                branch_id=branch.id,
                next_of_kin_name="NOK",
                next_of_kin_phone="987",
                next_of_kin_relationship="Brother"
            )
            db.add(member)
            db.flush()
        
        account = db.query(models.Account).filter(models.Account.member_id == member.id).first()
        if not account:
            print("Creating test account...")
            account = models.Account(
                account_number="ACC-TEST-001",
                member_id=member.id,
                account_type=models.AccountType.SAVINGS,
                balance=Decimal("0.00"),
                available_balance=Decimal("0.00"),
                minimum_balance=Decimal("500.00")
            )
            db.add(account)
            db.flush()
        
        db.commit()

        # 2. Perform Transactions
        
        # A. Deposit 50,000
        print("\nStep A: Depositing 50,000 XAF...")
        amount_a = Decimal("50000.00")
        account.balance += amount_a
        account.available_balance += amount_a
        
        AccountingService.record_transaction(
            db=db,
            transaction_id="TXN-TEST-DEPOSIT",
            transaction_type=models.TransactionType.DEPOSIT.value,
            amount=amount_a,
            description="Test Deposit",
            created_by=teller.id,
            debit_gl_code="1020", # Teller Cash
            credit_gl_code="2010" # Savings
        )
        
        # B. Withdrawal 10,000
        print("Step B: Withdrawing 10,000 XAF...")
        amount_b = Decimal("10000.00")
        account.balance -= amount_b
        account.available_balance -= amount_b
        
        AccountingService.record_transaction(
            db=db,
            transaction_id="TXN-TEST-WITHDRAWAL",
            transaction_type=models.TransactionType.WITHDRAWAL.value,
            amount=amount_b,
            description="Test Withdrawal",
            created_by=teller.id,
            debit_gl_code="2010", # Savings
            credit_gl_code="1020" # Teller Cash
        )
        
        # C. Vault Drop 20,000
        print("Step C: Vault Drop 20,000 XAF...")
        amount_c = Decimal("20000.00")
        
        AccountingService.record_transaction(
            db=db,
            transaction_id="TXN-TEST-VAULTDROP",
            transaction_type=models.TransactionType.TRANSFER.value,
            amount=amount_c,
            description="Test Vault Drop",
            created_by=teller.id,
            debit_gl_code="1010", # Main Vault
            credit_gl_code="1020" # Teller Cash
        )
        
        db.commit()
        print("\nTransactions Committed.")
        
        # 3. Verify Balance
        summary = AccountingService.get_trial_balance(db)
        print("\n" + "="*40)
        print(f"Total Debits:  {summary['total_debits']:,.2f} XAF")
        print(f"Total Credits: {summary['total_credits']:,.2f} XAF")
        print(f"Variance:      {summary['variance']:,.2f} XAF")
        print("="*40)
        
        if summary['is_balanced'] and summary['total_debits'] > 0:
            print("STATUS: TEST PASSED - GL IS BALANCED AND POPULATED")
        elif summary['total_debits'] == 0:
             print("STATUS: !!! ERROR - NO ENTRIES RECORDED !!!")
        else:
            print("STATUS: !!! ERROR - SYSTEM OUT OF BALANCE !!!")

    except Exception as e:
        print(f"Error during live test: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_live_test()
