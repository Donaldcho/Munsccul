import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app import models
from app.security.jwt_auth import PasswordManager
from app.schemas import UserRole

from sqlalchemy import text

def clear_and_seed_admin():
    db = SessionLocal()
    try:
        print("Clearing all data using TRUNCATE CASCADE...")
        # Get all table names
        table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
        # Add any tables that might be missed/circular
        all_tables = ",".join([f'"{name}"' for name in table_names])
        if all_tables:
            db.execute(text(f"TRUNCATE TABLE {all_tables} RESTART IDENTITY CASCADE"))
            db.commit()
        
        print("Creating any missing tables...")
        Base.metadata.create_all(bind=engine)
        print("Creating Head Office branch...")
        ho_branch = models.Branch(
            code="HO",
            name="Head Office",
            city="Bamenda",
            region="North West",
            address="Commercial Avenue",
            is_active=True
        )
        db.add(ho_branch)
        db.commit()
        db.refresh(ho_branch)
        
        print("Creating admin user...")
        admin_user = models.User(
            username="admin",
            full_name="System Administrator",
            hashed_password=PasswordManager.hash_password("digital2026"),
            role=UserRole.SYSTEM_ADMIN,
            branch_id=ho_branch.id,
            is_active=True,
            approval_status=models.UserApprovalStatus.APPROVED
        )
        db.add(admin_user)
        db.commit()
        print("Successfully cleared database and seeded only admin user.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_and_seed_admin()
