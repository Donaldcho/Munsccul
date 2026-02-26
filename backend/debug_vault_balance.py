from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.models import Branch, GLAccount, GLJournalEntry
from decimal import Decimal

LOCAL_DB_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
local_engine = create_engine(LOCAL_DB_URL)
LocalSession = sessionmaker(bind=local_engine)

def debug_vault():
    session = LocalSession()
    try:
        print("--- Branch Configuration ---")
        branches = session.query(Branch).all()
        for b in branches:
            print(f"Branch: {b.name}, ID: {b.id}, Vault GL Code: {b.gl_vault_code}")
            
            # Check GL Account
            vault_code = b.gl_vault_code or "1010"
            gl_acc = session.query(GLAccount).filter(GLAccount.account_code == vault_code).first()
            if gl_acc:
                print(f"  Vault GL Account Found: {gl_acc.account_name} ({gl_acc.account_code}), ID: {gl_acc.id}")
                
                # Check Balance in Journal Entries
                # Simple sum: Debits (+) and Credits (-) for Assets (1xxx)
                # Note: This is a simplification, but good for debugging
                entries = session.query(GLJournalEntry).filter(GLJournalEntry.gl_account_id == gl_acc.id).all()
                total_balance = Decimal("0.00")
                for e in entries:
                    if e.entry_type == "DEBIT":
                        total_balance += e.amount
                    else:
                        total_balance -= e.amount
                print(f"  Calculated GL Balance (Debits - Credits): {total_balance} CFA")
                print(f"  Number of entries: {len(entries)}")
            else:
                print(f"  ERROR: Vault GL Account {vault_code} NOT FOUND in gl_accounts table!")

    finally:
        session.close()

if __name__ == "__main__":
    debug_vault()
