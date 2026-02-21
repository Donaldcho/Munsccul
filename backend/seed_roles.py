import sys
from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import get_password_hash

db = SessionLocal()

def create_user(username, role, full_name):
    if not db.query(User).filter_by(username=username).first():
        u = User(username=username, email=f"{username}@camccul.cm", full_name=full_name, 
                 hashed_password=get_password_hash(f"{username}123"), 
                 role=role, branch_id=1, is_active=True, approval_status="APPROVED")
        db.add(u)
        print(f"Created {username}")

create_user("director", UserRole.OPS_DIRECTOR, "Operations Director")
create_user("board", UserRole.BOARD_MEMBER, "Board Member")

db.commit()
print("Done")
