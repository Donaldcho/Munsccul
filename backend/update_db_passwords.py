from app.database import SessionLocal
from app.models import User
from app.security.jwt_auth import PasswordManager

def update_passwords():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        # Default password for all users is 'digital2026'
        # Let's set 'digital2026' for all users
        # Or just use the hash we know is correct.
        new_hash = PasswordManager.hash_password("digital2026")
        
        for user in users:
            user.hashed_password = new_hash
            print(f"Updated password for {user.username}")
        
        db.commit()
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_passwords()
