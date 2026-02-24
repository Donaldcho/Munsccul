import sys
import os

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal, init_db
from app import models
from app.security.jwt_auth import PasswordManager
from app.schemas import UserRole

def seed_data():
    db = SessionLocal()
    try:
        # Initialize DB
        # print("Initializing database...")
        # init_db()
        
        # Check if Head Office branch exists
        print("Checking for Head Office branch...")
        ho_branch = db.query(models.Branch).filter(models.Branch.code == "HO").first()
        if not ho_branch:
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
        else:
            print("Head Office branch already exists.")
            
        # Create users
        users = [
            {
                "username": "admin",
                "full_name": "System Administrator",
                "password": "digital2026",
                "role": UserRole.SYSTEM_ADMIN
            },
            {
                "username": "manager",
                "full_name": "Branch Manager",
                "password": "digital2026",
                "role": UserRole.BRANCH_MANAGER
            },
            {
                "username": "teller",
                "full_name": "Teller 1",
                "password": "digital2026",
                "role": UserRole.TELLER
            },
            {
                "username": "credit",
                "full_name": "Credit Officer",
                "password": "digital2026",
                "role": UserRole.CREDIT_OFFICER
            },
            {
                "username": "ops",
                "full_name": "Operations Manager",
                "password": "digital2026",
                "role": UserRole.OPS_MANAGER
            },
            {
                "username": "board1",
                "full_name": "Board Director 1",
                "password": "digital2026",
                "role": UserRole.BOARD_MEMBER
            },
            {
                "username": "dir1",
                "full_name": "Operations Director",
                "password": "digital2026",
                "role": UserRole.OPS_DIRECTOR
            }
        ]
        
        for user_data in users:
            print(f"Checking user {user_data['username']}...")
            user = db.query(models.User).filter(models.User.username == user_data['username']).first()
            if not user:
                print(f"Creating user {user_data['username']}...")
                user = models.User(
                    username=user_data['username'],
                    full_name=user_data['full_name'],
                    hashed_password=PasswordManager.hash_password(user_data['password']),
                    role=user_data['role'],
                    branch_id=ho_branch.id,
                    is_active=True,
                    approval_status=models.UserApprovalStatus.APPROVED  # Auto-approve seeded users
                )
                db.add(user)
            else:
                print(f"User {user_data['username']} already exists.")
        
        db.commit()
        print("Seeding complete.")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
