import sys
import os
from decimal import Decimal
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import create_engine

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import Base
from app import models
from app.security.jwt_auth import PasswordManager
from app.schemas import UserRole

# Manual connection string for local host execution (matching seed_gl.py)
LOCAL_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking")
engine = create_engine(LOCAL_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def production_init():
    db = SessionLocal()
    try:
        print("--- [PRODUCTION INITIALIZATION] ---")
        
        # 1. Clear All Data (TRUNCATE CASCADE)
        print("Clearing all existing data...")
        table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
        all_tables = ",".join([f'"{name}"' for name in table_names])
        if all_tables:
            db.execute(text(f"TRUNCATE TABLE {all_tables} RESTART IDENTITY CASCADE"))
            db.commit()

        # 2. Ensure Tables Exist
        print("Ensuring database schema is up to date...")
        Base.metadata.create_all(bind=engine)

        # 3. Create Head Office Branch
        print("Creating Head Office branch...")
        ho_branch = models.Branch(
            code="HO",
            name="Head Office",
            city="Bamenda",
            region="North West",
            address="Commercial Avenue",
            is_active=True,
            gl_vault_code="1010" # Linked to COBAC standard Vault GL
        )
        db.add(ho_branch)
        db.commit()
        db.refresh(ho_branch)

        # 4. Create Primary Admin User
        print("Creating System Administrator...")
        admin_user = models.User(
            username="admin",
            full_name="System Administrator",
            hashed_password=PasswordManager.hash_password("digital2026"),
            role=UserRole.SYSTEM_ADMIN,
            branch_id=ho_branch.id,
            is_active=True,
            approval_status=models.UserApprovalStatus.APPROVED
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        # 5. Seed Chart of Accounts (COBAC/OHADA Standards)
        print("Seeding COBAC/OHADA Chart of Accounts...")
        coa = [
            # 1000 - Cash and Equivalents
            {"code": "1010", "name": "Main Vault - Cash", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1020", "name": "Teller Drawers - Cash", "type": "ASSET", "class": 1, "category": "10"},
            
            # 1200 - Loans to Members
            {"code": "1210", "name": "Ordinary Loans Portfolio", "type": "ASSET", "class": 1, "category": "12"},
            
            # 2000 - Liabilities
            {"code": "2010", "name": "Member Savings Deposits", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2020", "name": "Member Share Capital", "type": "LIABILITY", "class": 2, "category": "20"},
            
            # 3000 - Equity
            {"code": "3010", "name": "Retained Earnings / Startup Capital", "type": "EQUITY", "class": 3, "category": "30"},
            
            # 4000 - Income
            {"code": "4110", "name": "Interest Income (Loans)", "type": "INCOME", "class": 4, "category": "41"},
            {"code": "4210", "name": "Account Opening Fees", "type": "INCOME", "class": 4, "category": "42"},
            
            # 5000 - Expenses
            {"code": "5110", "name": "Operational Expenses", "type": "EXPENSE", "class": 5, "category": "51"},
        ]

        gl_map = {}
        for item in coa:
            account = models.GLAccount(
                account_code=item["code"],
                account_name=item["name"],
                account_type=item["type"],
                account_class=item["class"],
                account_category=item["category"],
                usage="DETAIL",
                is_active=True
            )
            db.add(account)
            db.flush()
            gl_map[item["code"]] = account.id

        # 6. Initialize Accounting Rules
        print("Initializing standard Accounting Rules...")
        rules = [
            {"name": "Member Deposit", "tx_type": "DEPOSIT", "debit": "1010", "credit": "2010"},
            {"name": "Member Withdrawal", "tx_type": "WITHDRAWAL", "debit": "2010", "credit": "1010"},
            {"name": "Loan Disbursement", "tx_type": "LOAN_DISBURSEMENT", "debit": "1210", "credit": "2010"},
            {"name": "Loan Repayment", "tx_type": "LOAN_REPAYMENT", "debit": "2010", "credit": "1210"}
        ]

        for rule_data in rules:
            rule = models.AccountingRule(
                name=rule_data["name"],
                transaction_type=rule_data["tx_type"],
                debit_account_id=gl_map[rule_data["debit"]],
                credit_account_id=gl_map[rule_data["credit"]],
                is_active=True
            )
            db.add(rule)

        db.commit()
        print("--- [PRODUCTION INITIALIZATION COMPLETE] ---")
        print("Access the system with username 'admin' and password 'digital2026'.")

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        print(f"Error during initialization: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    production_init()
