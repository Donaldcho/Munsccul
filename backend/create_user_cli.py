import sys
import os
import argparse
from getpass import getpass

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.security.jwt_auth import PasswordManager
from app.schemas import UserRole

def create_user(username, full_name, password, role, branch_code="HO", email=None):
    db = SessionLocal()
    try:
        # Check if user exists
        existing = db.query(models.User).filter(models.User.username == username).first()
        if existing:
            print(f"Error: User '{username}' already exists.")
            return

        # Get branch
        branch = db.query(models.Branch).filter(models.Branch.code == branch_code).first()
        if not branch:
            print(f"Error: Branch with code '{branch_code}' not found.")
            return

        # Validate role
        try:
            user_role = UserRole(role)
        except ValueError:
            print(f"Error: Invalid role '{role}'. Valid roles: {[r.value for r in UserRole]}")
            return

        # Create user
        new_user = models.User(
            username=username,
            full_name=full_name,
            email=email,
            hashed_password=PasswordManager.hash_password(password),
            role=user_role,
            branch_id=branch.id,
            is_active=True
        )

        db.add(new_user)
        db.commit()
        print(f"Successfully created user '{username}' with role '{role}' assigned to branch '{branch.name}'.")

    except Exception as e:
        print(f"Error creating user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a new user in the CamCCUL Banking System")
    parser.add_argument("username", help="Username for login")
    parser.add_argument("role", help=f"User role {[r.value for r in UserRole]}")
    parser.add_argument("--full-name", "-n", required=True, help="Full Name of the user")
    parser.add_argument("--password", "-p", help="Password (will prompt if not provided)")
    parser.add_argument("--email", "-e", help="Email address")
    parser.add_argument("--branch", "-b", default="HO", help="Branch Code (default: HO)")

    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass("Enter password: ")
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("Error: Passwords do not match.")
            sys.exit(1)

    create_user(
        username=args.username,
        full_name=args.full_name,
        password=password,
        role=args.role,
        branch_code=args.branch,
        email=args.email
    )
