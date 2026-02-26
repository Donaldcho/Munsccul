from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User

LOCAL_DB_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
local_engine = create_engine(LOCAL_DB_URL)
LocalSession = sessionmaker(bind=local_engine)

def list_users():
    session = LocalSession()
    try:
        users = session.query(User).all()
        print("--- Users in DB ---")
        for u in users:
            print(f"Username: {u.username}, Role: {u.role}, Active: {u.is_active}, Approval: {u.approval_status}")
    finally:
        session.close()

if __name__ == "__main__":
    list_users()
