import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models

def check_ops_user():
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == "ops").first()
        if user:
            print(f"User found: {user.username}")
            print(f"  ID: {user.id}")
            print(f"  Role: {user.role}")
            print(f"  Is Active: {user.is_active}")
            print(f"  Approval Status: {user.approval_status}")
            print(f"  Branch ID: {user.branch_id}")
            print(f"  Created At: {user.created_at}")
        else:
            print("User 'ops' not found.")
            
        print("\nAll Users:")
        users = db.query(models.User).all()
        for u in users:
            print(f"  - {u.username}: {u.approval_status} (Active: {u.is_active})")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_ops_user()
