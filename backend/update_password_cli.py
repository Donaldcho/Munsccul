import sys
import os
import argparse

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.security.jwt_auth import PasswordManager

def update_password(username, new_password):
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            print(f"Error: User '{username}' not found.")
            return

        user.hashed_password = PasswordManager.hash_password(new_password)
        db.commit()
        print(f"Successfully updated password for user '{username}'.")

    except Exception as e:
        print(f"Error updating password: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update user password")
    parser.add_argument("username", help="Username")
    parser.add_argument("password", help="New Password")

    args = parser.parse_args()
    update_password(args.username, args.password)
