import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models

def check_user():
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == "manager").first()
        if user:
            print(f"User: {user.username}")
            print(f"Role: {user.role}")
            print(f"Active: {user.is_active}")
            print(f"ID: {user.id}")
        else:
            print("User 'manager' not found.")
            
        user_ops = db.query(models.User).filter(models.User.username == "ops").first()
        if user_ops:
            print(f"User: {user_ops.username}")
            print(f"Role: {user_ops.role}")
            print(f"Active: {user_ops.is_active}")
            print(f"ID: {user_ops.id}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_user()
