from app.models import User, GLAccount, GLJournalEntry
from app.database import SessionLocal, engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# Override for local execution
LOCAL_DB_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
local_engine = create_engine(LOCAL_DB_URL)
LocalSession = sessionmaker(bind=local_engine)

def debug_balance():
    session = LocalSession()
    try:
        print("--- User Debug ---")
        users = session.query(User).filter(User.role == 'TELLER').all()
        for u in users:
            print(f"User: {u.username}, Role: {u.role}, GL Account ID: {u.teller_gl_account_id}")
            if u.teller_gl_account_id:
                gl = session.query(GLAccount).filter(GLAccount.id == u.teller_gl_account_id).first()
                if gl:
                    print(f"  GL Account: {gl.account_code} - {gl.account_name}")
                else:
                    print(f"  GL Account ID {u.teller_gl_account_id} NOT FOUND in GLAccount table!")
            else:
                print("  NO GL ACCOUNT ASSIGNED!")

        print("\n--- GL Account 2010 Debug ---")
        gl_2010 = session.query(GLAccount).filter(GLAccount.account_code == '2010').first()
        if gl_2010:
            print(f"GL 2010: {gl_2010.name} (Found)")
        else:
            print("GL 2010 NOT FOUND!")

        print("\n--- Latest Journal Entries ---")
        entries = session.query(GLJournalEntry).order_by(GLJournalEntry.id.desc()).limit(10).all()
        for e in entries:
            print(f"ID: {e.id}, Date: {e.entry_date}, GL: {e.gl_account_id}, Type: {e.entry_type}, Amount: {e.amount}, Desc: {e.description}")
    finally:
        session.close()

if __name__ == "__main__":
    debug_balance()
