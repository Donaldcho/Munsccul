import sys
import os
import asyncio
from datetime import datetime, date
from decimal import Decimal

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app import models
from app.database import SessionLocal
from app.services.eod import EODService

def test_distributed_eod_guard():
    db = SessionLocal()
    print("\n--- STARTING DISTRIBUTED EOD GUARD TEST ---")

    try:
        branch_id = 1
        target_date = date.today()

        # 1. Simulate PENDING sync items
        print("[STEP 1] Simulating pending offline transactions...")
        dummy_sync = models.OfflineQueue(
            transaction_type="DEPOSIT",
            payload='{"test": "data"}',
            branch_id=branch_id,
            created_by=1,
            status=models.SyncStatus.PENDING
        )
        db.add(dummy_sync)
        db.commit()

        # 2. Try to run EOD checks
        print("[STEP 2] Running EOD checks while sync is pending...")
        checks = EODService.run_eod_checks(db, target_date, branch_id)
        
        has_guard_message = any("DISTRIBUTED GUARD" in m for m in checks["messages"])
        if not checks["can_proceed"] and has_guard_message:
            print(" [OK] EOD successfully blocked by Distributed Guard.")
        else:
            print(f" [FAIL] EOD should have been blocked. Proceed: {checks['can_proceed']}, Messages: {checks['messages']}")

        # 3. Resolve sync items and try again
        print("[STEP 3] Marking transactions as SYNCED...")
        dummy_sync.status = models.SyncStatus.SYNCED
        db.commit()

        print("[STEP 4] Rerunning EOD checks...")
        checks_after = EODService.run_eod_checks(db, target_date, branch_id)
        
        has_guard_msg_after = any("DISTRIBUTED GUARD" in m for m in checks_after["messages"])
        if not has_guard_msg_after:
            print(" [OK] Distributed Guard cleared after sync.")
        else:
            print(f" [FAIL] Distributed Guard still present: {checks_after['messages']}")

    except Exception as e:
        print(f"[ERROR] Test failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        # Cleanup
        db.query(models.OfflineQueue).filter(models.OfflineQueue.payload == '{"test": "data"}').delete()
        db.commit()
        db.close()
        print("--- TEST COMPLETED ---")

if __name__ == "__main__":
    test_distributed_eod_guard()
