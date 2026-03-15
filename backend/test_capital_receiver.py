import sys
import os
import asyncio
from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app import models
from app.database import SessionLocal
from app.schemas import BulkSyncRequest, SyncTransactionItem
from app.services.sync_service import process_bulk_sync
from app.config import settings

def test_capital_idempotency():
    db = SessionLocal()
    print("\n--- STARTING CAPITAL HQ IDEMPOTENCY TEST ---")

    try:
        # 1. Create a dummy transaction payload
        txn_ref = f"BUEA-TXN-{datetime.utcnow().strftime('%Y%m%d')}-TESTIDEMP"
        
        payload = BulkSyncRequest(
            branch_code="BUEA",
            transactions=[
                SyncTransactionItem(
                    transaction_ref=txn_ref,
                    account_id="SAV-1-001", # Existing account from seed data
                    amount=15000.0,
                    transaction_type="DEPOSIT",
                    debit_account="1010",
                    credit_account="2010",
                    branch_id=1,
                    created_by=1,
                    description="Idempotency Test Transaction",
                    timestamp=datetime.utcnow()
                )
            ]
        )

        # 2. First Push (Should Process)
        print(f"[STEP 1] First Push for {txn_ref}...")
        result1 = process_bulk_sync(db, payload)
        print(f" [RESULT] Processed: {result1['processed']}, Skipped: {result1['skipped']}")
        
        if result1['processed'] != 1:
            print(" [FAIL] Should have processed 1 transaction.")

        # 3. Second Push (Should SKIP - Idempotency hit)
        print(f"[STEP 2] Second Push (Duplicate) for {txn_ref}...")
        result2 = process_bulk_sync(db, payload)
        print(f" [RESULT] Processed: {result2['processed']}, Skipped: {result2['skipped']}")
        
        if result2['processed'] == 0 and result2['skipped'] == 1:
            print(" [OK] Idempotency guard successfully skipped duplicate.")
        else:
            print(" [FAIL] Idempotency guard failed to skip duplicate!")

        # 4. Verify DB entry
        txn = db.query(models.Transaction).filter(models.Transaction.transaction_ref == txn_ref).all()
        if len(txn) == 1:
            print(f" [OK] Exactly one record found in DB for {txn_ref}.")
        else:
            print(f" [FAIL] Found {len(txn)} records in DB (Expected 1).")

    except Exception as e:
        print(f"[ERROR] Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
        print("--- TEST COMPLETED ---")

if __name__ == "__main__":
    test_capital_idempotency()
