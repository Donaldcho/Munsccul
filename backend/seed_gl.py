from sqlalchemy import create_engine, func, case
from sqlalchemy.orm import sessionmaker
from app.models import GLAccount, User, UserRole, Branch, GLJournalEntry
from datetime import datetime
from decimal import Decimal
import os

# Database URL for local execution
DATABASE_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def seed_gl():
    session = SessionLocal()
    try:
        print("--- Seeding GL Accounts ---")
        
        # 1. Main Vault
        vault = session.query(GLAccount).filter(GLAccount.account_code == "1010").first()
        if not vault:
            vault = GLAccount(
                account_code="1010",
                account_name="Main Vault Cash",
                account_class=1,
                account_category="10",
                account_type="ASSET",
                usage="DETAIL",
                description="Physical cash held in branch main vault"
            )
            session.add(vault)
            print("Added GL 1010 (Vault)")
        
        # 2. Teller Cash
        teller_gl = session.query(GLAccount).filter(GLAccount.account_code == "1020").first()
        if not teller_gl:
            teller_gl = GLAccount(
                account_code="1020",
                account_name="Teller Cash in Hand",
                account_class=1,
                account_category="10",
                account_type="ASSET",
                usage="DETAIL",
                description="Physical cash held in teller drawers"
            )
            session.add(teller_gl)
            print("Added GL 1020 (Teller Cash)")

        # 3. Member Savings
        savings = session.query(GLAccount).filter(GLAccount.account_code == "2010").first()
        if not savings:
            savings = GLAccount(
                account_code="2010",
                account_name="Member Savings Accounts",
                account_class=2,
                account_category="20",
                account_type="LIABILITY",
                usage="DETAIL",
                description="Consolidated liability for all member savings"
            )
            session.add(savings)
            print("Added GL 2010 (Member Savings)")

        session.commit()
        
        # 4. Link Teller User
        # We'll link the 'teller' user to GL 1020
        teller_user = session.query(User).filter(User.username == "teller").first()
        if teller_user:
            teller_user.teller_gl_account_id = teller_gl.id
            session.commit()
            print(f"Linked User 'teller' to GL Account {teller_gl.account_code} (ID: {teller_gl.id})")
        else:
            print("User 'teller' not found!")

        # 5. Link Branch to Vault
        branch = session.query(Branch).filter(Branch.id == 1).first()
        if branch:
            branch.gl_vault_code = vault.account_code
            session.commit()
            print(f"Linked Branch '{branch.name}' to Vault Account {vault.account_code}")

        # 6. Inject Initial Vault Balance (if 0)
        # Check current balance
        raw_balance = session.query(func.sum(
            case(
                (GLJournalEntry.entry_type == 'DEBIT', GLJournalEntry.amount),
                else_=-GLJournalEntry.amount
            )
        )).filter(GLJournalEntry.gl_account_id == vault.id).scalar()
        
        current_balance = float(raw_balance) if raw_balance is not None else 0.0
        
        if current_balance == 0:
            print("Injecting initial vault balance...")
            # Need a user for created_by
            ops_user = session.query(User).filter(User.username == "ops").first()
            if not ops_user:
                # Fallback to any user
                ops_user = session.query(User).first()
                
            if ops_user:
                initial_injection = GLJournalEntry(
                    entry_date=datetime.utcnow(),
                    transaction_type="INITIAL_SEEDING",
                    gl_account_id=vault.id,
                    amount=Decimal("50000000.00"),  # 50M CFA
                    entry_type="DEBIT",
                    description="Initial vault cash injection for system launch",
                    created_by=ops_user.id
                )
                session.add(initial_injection)
                session.commit()
                print(f"Successfully injected 50,000,000 CFA into Vault (Created by {ops_user.username}).")
            else:
                print("ERROR: No users found to attribute journal entry to!")
        else:
            print(f"Vault already has balance: {current_balance} CFA")

    except Exception as e:
        print(f"Error seeding: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    seed_gl()
