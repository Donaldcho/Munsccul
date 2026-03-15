import sys
import os
import json
import asyncio
from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine
from app import models
from app.config import settings
from app.database import SessionLocal
engine = create_engine(settings.DATABASE_URL, echo=False)
from app.scheduler.job_scheduler import SyncOfflineQueueJob, JobType
from app.routers.transactions import create_double_entry_transaction

def test_offline_sync_workflow():
    db = SessionLocal()
    print("\n--- STARTING OFFLINE SYNC WORKFLOW TEST ---")

    try:
        # 1. Setup prerequisite data (User and Account)
        teller = db.query(models.User).filter(models.User.username == "teller").first()
        if not teller:
            print("[SKIP] Teller user not found. Please run seed_data.py first.")
            return

        account = db.query(models.Account).filter(models.Account.is_active == True).first()
        if not account:
            print("[SKIP] Active account not found. Please run seed_data.py first.")
            return

        print(f"[STEP 1] Using Teller: {teller.username}, Account: {account.account_number}")

        # 2. Simulate Atomic Outbox Transaction
        print("[STEP 2] Creating Transaction (Outbox Pattern)...")
        amount = Decimal("5000")
        description = "Test Sync Outbox Transaction"
        
        # We call the refined create_double_entry_transaction
        txn = create_double_entry_transaction(
            db=db,
            account=account,
            transaction_type=models.TransactionType.DEPOSIT,
            amount=amount,
            description=description,
            created_by=teller.id,
            debit_account_code="1010",
            credit_account_code="2010"
        )
        db.commit()

        # 3. Verify Local Integrity
        print("[STEP 3] Verifying Local DB Records...")
        if not txn.transaction_ref.startswith(settings.BRANCH_CODE):
            print(f" [FAIL] Transaction ref '{txn.transaction_ref}' lacks branch prefix '{settings.BRANCH_CODE}'")
        else:
            print(f" [OK] Branch prefix detected: {txn.transaction_ref}")

        outbox_item = db.query(models.OfflineQueue).filter(
            models.OfflineQueue.status == models.SyncStatus.PENDING,
            models.OfflineQueue.branch_id == teller.branch_id
        ).order_by(models.OfflineQueue.created_at.desc()).first()

        if not outbox_item:
            print(" [FAIL] No PENDING item found in OfflineQueue!")
        else:
            print(f" [OK] Found Outbox item for {outbox_item.transaction_type}")
            payload = json.loads(outbox_item.payload)
            if payload['transaction_ref'] == txn.transaction_ref:
                print(" [OK] Payload integrity verified.")
            else:
                print(" [FAIL] Payload mismatch!")

        # 4. Mock Network Sync Worker
        print("[STEP 4] Executing Sync Worker (Mock Success)...")
        with patch('requests.post') as mock_post:
            # Mock successful Capital API response
            mock_response = MagicMock()
            mock_response.status_code = 201
            mock_post.return_value = mock_response

            sync_job = SyncOfflineQueueJob()
            # Run the job manually (it's async)
            result = asyncio.run(sync_job.execute(params={}, db=db))
            
            print(f" [INFO] Sync Worker Result: {result.message}")

            # 5. Verify Final Status
            db.refresh(outbox_item)
            db.refresh(txn)

            if outbox_item.status == models.SyncStatus.SYNCED:
                print(" [OK] OfflineQueue marked as SYNCED.")
            else:
                print(f" [FAIL] OfflineQueue status is {outbox_item.status}")

            if txn.sync_status == models.SyncStatus.SYNCED:
                print(" [OK] Transaction record marked as SYNCED.")
            else:
                print(f" [FAIL] Transaction sync_status is {txn.sync_status}")

    except Exception as e:
        print(f"[ERROR] Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
        print("--- TEST COMPLETED ---")

if __name__ == "__main__":
    test_offline_sync_workflow()
