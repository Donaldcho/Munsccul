import asyncio
from datetime import datetime, date
import sys
import os
from decimal import Decimal

# Add the project root to the python path so we can import 'app'
# This assumes the script is run from inside the 'backend' folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.services.eod import EODService
from app.services.reporting import ReportingService
from app.services.accounting import AccountingService

def verify_eod_and_reporting():
    db = SessionLocal()
    try:
        current_date = datetime.utcnow().date()
        print(f"--- Starting EOD & Reporting Verification for {current_date} ---")
        
        # 1. Generate Trial Balance
        print("\n1. Generating Trial Balance (JSON)...")
        tb = ReportingService.generate_trial_balance(db, current_date)
        print(f"Generated Trial Balance with {len(tb)} accounts.")
        
        # 2. Generate Balance Sheet
        print("2. Generating Balance Sheet...")
        bs = ReportingService.generate_balance_sheet(db, current_date)
        print(f"Balance Sheet balanced state: {bs['is_balanced']}")
        
        # 3. Simulate EOD Check
        print("\n3. Running EOD pre-checks...")
        checks = EODService.run_eod_checks(db, current_date)
        print(f"Can close day?: {checks['can_close']}")
        print(f"Messages: {checks['messages']}")
        
        # 4. If we can't close because of pending txns, we'll force a test date just to show immutability
        test_closed_date = date(2023, 12, 31)
        print(f"\n4. Forcing closure of a historical test date: {test_closed_date} to test Immutability")
        
        # Override the check just for tests, close it.
        closure = EODService.get_or_create_closure_record(db, test_closed_date)
        closure.is_closed = True
        closure.closed_by = 1 # Admin User
        db.commit()
        print(f"Date {test_closed_date} status manually set to: Closed={closure.is_closed}")
        
        # 5. Attempt to post a transaction into the closed date
        print("\n5. Attempting to post a transaction retroactive to the closed date (Immutability check)...")
        try:
            AccountingService.record_transaction(
                db=db,
                transaction_id="TEST-IMUT-001",
                transaction_type="DEPOSIT",
                amount=Decimal("15000"),
                description="Test retroactive posting",
                created_by=1,
                debit_gl_code="1010",
                credit_gl_code="2010",
                transaction_date=datetime(2023, 12, 31, 12, 0)
            )
            print("❌ FAIL: Backend allowed posting into a closed period!")
        except Exception as e:
            print(f"✅ PASS: Immutability enforced. Error caught: {e}")
            
    finally:
        db.close()

if __name__ == "__main__":
    verify_eod_and_reporting()
