from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Account, Member
import os

# Override for local execution
LOCAL_DB_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
local_engine = create_engine(LOCAL_DB_URL)
LocalSession = sessionmaker(bind=local_engine)

def debug_account_member():
    session = LocalSession()
    try:
        print("--- Account -> Member Linkage Debug ---")
        accounts = session.query(Account).limit(5).all()
        for a in accounts:
            print(f"Account: {a.account_number}, PK ID: {a.id}, Member FK (member_id): {a.member_id}")
            member = session.query(Member).filter(Member.id == a.member_id).first()
            if member:
                print(f"  Linked Member: {member.first_name} {member.last_name}, String ID: {member.member_id}, PK ID: {member.id}")
                photo_path = member.passport_photo_path
                print(f"  Photo Path: {photo_path}")
                if photo_path and os.path.exists(photo_path):
                    print("    Photo file EXISTS")
                else:
                    print(f"    Photo file MISSING or PATH NULL ({photo_path})")
            else:
                print(f"  ERROR: No Member found for FK {a.member_id}!")
    finally:
        session.close()

if __name__ == "__main__":
    debug_account_member()
