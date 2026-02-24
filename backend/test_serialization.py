import sys
import os
from datetime import date
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from sqlalchemy import func
import json
from fastapi.encoders import jsonable_encoder

def test_serialization():
    db = SessionLocal()
    try:
        total_deposits = db.query(func.sum(models.Account.balance)).filter(
            models.Account.account_type.in_([models.AccountType.SAVINGS, models.AccountType.CURRENT, models.AccountType.FIXED_DEPOSIT])
        ).scalar() or 0
        
        print(f"Total deposits: {total_deposits} (Type: {type(total_deposits)})")
        
        dashboard_data = {
            "accounts": {"total": 100, "total_deposits": total_deposits}
        }
        
        print("Attempting to serialize with jsonable_encoder...")
        encoded = jsonable_encoder(dashboard_data)
        print(f"Encoded: {encoded}")
        
        print("Attempting to serialize with json.dumps(encoded)...")
        serialized = json.dumps(encoded)
        print(f"Serialized: {serialized}")
        
        print("SUCCESS: Serialization passed.")

    except Exception as e:
        print(f"FAILURE: Serialization failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    test_serialization()
