from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Account, Member

LOCAL_DB_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
local_engine = create_engine(LOCAL_DB_URL)
LocalSession = sessionmaker(bind=local_engine)

def verify_logic():
    session = LocalSession()
    try:
        # Simulate logic of the new endpoint
        account_id = 1
        account = session.query(Account).filter(Account.id == account_id).first()
        if not account:
            print(f"Account {account_id} not found")
            return
            
        print(f"Account {account_id} found: {account.account_number}")
        member = session.query(Member).filter(Member.id == account.member_id).first()
        if not member:
            print(f"Member for account {account_id} not found")
            return
            
        print(f"Member found: {member.first_name} {member.last_name}")
        print(f"Member ID String: {member.member_id}")
        
    finally:
        session.close()

if __name__ == "__main__":
    verify_logic()
