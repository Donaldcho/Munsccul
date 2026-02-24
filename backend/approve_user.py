import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models

def refine_approvals():
    db = SessionLocal()
    try:
        # 1. Reset all non-admin users to PENDING first (to be safe)
        db.query(models.User).filter(
            models.User.username != "admin"
        ).update({
            "approval_status": models.UserApprovalStatus.PENDING,
            "approved_by": None
        })
        
        # 2. Specifically approve and activate the 'ops' manager
        ops_user = db.query(models.User).filter(models.User.username == "ops").first()
        if ops_user:
            print(f"Approving and activating OPS manager: {ops_user.username}")
            ops_user.approval_status = models.UserApprovalStatus.APPROVED
            ops_user.is_active = True
            ops_user.approved_by = 1 # Approved by admin
        else:
            print("Warning: 'ops' user not found in database.")
            
        db.commit()
        print("Refinement complete: admin and ops are APPROVED, others are PENDING.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    refine_approvals()
