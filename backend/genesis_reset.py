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

# Manual connection string for local host execution
LOCAL_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking")
engine = create_engine(LOCAL_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def genesis_reset():
    db = SessionLocal()
    try:
        print("--- [SYSTEM GENESIS RESET - STARTING] ---")
        
        # 1. Clear All Data (TRUNCATE CASCADE)
        print("Purging all existing transactional and entity data...")
        table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
        all_tables = ",".join([f'"{name}"' for name in table_names])
        if all_tables:
            db.execute(text(f"TRUNCATE TABLE {all_tables} RESTART IDENTITY CASCADE"))
            db.commit()

        # 2. Re-create Schema Baseline
        print("Ensuring database schema baseline...")
        # Check if we need to expand currency name_code column
        db.execute(text('ALTER TABLE "currencies" ALTER COLUMN "name_code" TYPE VARCHAR(50)'))
        db.commit()
        Base.metadata.create_all(bind=engine)

        # 3. Currency Initialization
        print("Seeding Base Currency (XAF)...")
        xaf = models.Currency(
            code="XAF",
            name="Central African CFA Franc",
            decimal_places=0,
            display_symbol="FCFA",
            name_code="currency.XAF",
            is_active=True,
            is_base_currency=True,
            exchange_rate=1.0
        )
        db.add(xaf)
        db.flush()

        # 4. Create Head Office Branch
        print("Creating Head Office branch...")
        ho_branch = models.Branch(
            code="HO",
            name="Head Office",
            city="Bamenda",
            region="North West",
            address="Commercial Avenue",
            is_active=True,
            gl_vault_code="1010"
        )
        db.add(ho_branch)
        db.commit()
        db.refresh(ho_branch)

        # 5. Seed Core Standard Users
        print("Seeding Essential System Users...")
        default_pwd = PasswordManager.hash_password("digital2026")
        users_to_seed = [
            {"username": "admin", "full_name": "System Administrator", "role": UserRole.SYSTEM_ADMIN},
            {"username": "manager", "full_name": "Branch Manager", "role": UserRole.BRANCH_MANAGER},
            {"username": "teller", "full_name": "Teller 1", "role": UserRole.TELLER},
            {"username": "credit", "full_name": "Credit Officer", "role": UserRole.CREDIT_OFFICER},
            {"username": "ops", "full_name": "Operations Manager", "role": UserRole.OPS_MANAGER},
            {"username": "board1", "full_name": "Board Director 1", "role": UserRole.BOARD_MEMBER},
            {"username": "dir1", "full_name": "Operations Director", "role": UserRole.OPS_DIRECTOR}
        ]
        
        for u in users_to_seed:
            user = models.User(
                username=u["username"],
                full_name=u["full_name"],
                hashed_password=default_pwd,
                role=u["role"],
                branch_id=ho_branch.id,
                is_active=True,
                approval_status=models.UserApprovalStatus.APPROVED
            )
            db.add(user)
        db.commit()

        # 6. Seed COBAC Standard Chart of Accounts
        print("Seeding COBAC/OHADA Standard Chart of Accounts...")
        coa = [
            # 1000 - Cash and Equivalents
            {"code": "1010", "name": "Main Vault - Cash", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1020", "name": "Teller Drawers - Cash", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1031", "name": "Bank Account (Afriland)", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1032", "name": "Bank Account (BALICO)", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1041", "name": "MTN Mobile Money Float", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1042", "name": "Orange Money Float", "type": "ASSET", "class": 1, "category": "10"},
            
            # 1200 - Loans to Members
            {"code": "1210", "name": "Ordinary Loans Portfolio", "type": "ASSET", "class": 1, "category": "12"},
            
            # 2000 - Liabilities
            {"code": "2010", "name": "Member Savings Deposits", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2020", "name": "Member Share Capital", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2030", "name": "Njangi Contributions Liability", "type": "LIABILITY", "class": 2, "category": "20"},
            
            # 3000 - Equity
            {"code": "3010", "name": "Institutional Capital / Retained Earnings", "type": "EQUITY", "class": 3, "category": "30"},
            {"code": "3020", "name": "Statutory Reserve Fund", "type": "EQUITY", "class": 3, "category": "30"},
            
            # 4000 - Income
            {"code": "4110", "name": "Interest Income (Loans)", "type": "INCOME", "class": 4, "category": "41"},
            {"code": "4210", "name": "Member Entrance Fees", "type": "INCOME", "class": 4, "category": "42"},
            {"code": "4220", "name": "Transaction Commission (MoMo/Fees)", "type": "INCOME", "class": 4, "category": "42"},
            
            # 5000 - Expenses
            {"code": "5110", "name": "Staff Salaries & Benefits", "type": "EXPENSE", "class": 5, "category": "51"},
            {"code": "5120", "name": "Energy & Utilities", "type": "EXPENSE", "class": 5, "category": "51"},
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

        # 7. Dynamically link seeded tellers to accounts
        gl_1020 = db.query(models.GLAccount).filter(models.GLAccount.account_code == "1020").first()
        if gl_1020:
            gl_1020.usage = "HEADER"
            
            tellers = db.query(models.User).filter(models.User.role == UserRole.TELLER).all()
            for t in tellers:
                if not t.teller_gl_account_id:
                    # Find next code (this is simple here since it's a reset)
                    existing_subs = db.query(models.GLAccount).filter(models.GLAccount.account_code.startswith("102"), models.GLAccount.account_code != "1020").all()
                    next_code = str(max([int(a.account_code) for a in existing_subs] + [1020]) + 1)
                    
                    new_gl = models.GLAccount(
                        account_code=next_code,
                        account_name=f"Cash Drawer - {t.full_name}",
                        account_type="ASSET",
                        account_class=1,
                        account_category="10",
                        usage="DETAIL",
                        parent_id=gl_1020.id,
                        is_active=True
                    )
                    db.add(new_gl)
                    db.flush()
                    t.teller_gl_account_id = new_gl.id
            db.commit()

        # 8. Initialize Standard Accounting Rules
        print("Configuring Transaction Routing Rules...")
        rules = [
            {"name": "Standard Cash Deposit", "tx_type": "DEPOSIT", "debit": "1020", "credit": "2010"},
            {"name": "Standard Cash Withdrawal", "tx_type": "WITHDRAWAL", "debit": "2010", "credit": "1020"},
            {"name": "Social Capital Purchase", "tx_type": "SHARE_PURCHASE", "debit": "1020", "credit": "2020"},
            {"name": "Loan Disbursement", "tx_type": "LOAN_DISBURSEMENT", "debit": "1210", "credit": "2010"},
            {"name": "Loan Repayment (Principal)", "tx_type": "LOAN_REPAYMENT", "debit": "2010", "credit": "1210"},
        ]

        for r_data in rules:
            rule = models.AccountingRule(
                name=r_data["name"],
                transaction_type=r_data["tx_type"],
                debit_account_id=gl_map[r_data["debit"]],
                credit_account_id=gl_map[r_data["credit"]],
                is_active=True
            )
            db.add(rule)

        # 8. Reset Essential Policies
        print("Resetting Policies (Share Price, etc.)...")
        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        share_price_policy = db.query(models.GlobalPolicy).filter(models.GlobalPolicy.policy_key == "share_unit_price").first()
        if not share_price_policy:
            share_price_policy = models.GlobalPolicy(
                policy_key="share_unit_price",
                policy_value="2000",
                status=models.PolicyStatus.ACTIVE,
                proposed_by_id=admin_user.id,
                approved_by_id=admin_user.id,
                change_reason="Genesis Initialization"
            )
            db.add(share_price_policy)
        else:
            share_price_policy.policy_value = "2000"

        # 9. Seed Core Treasury Accounts (for Liquidity Matrix visibility)
        print("Seeding Core Treasury Accounts...")
        treasury_accounts = [
            {"name": "Main Vault", "type": models.TreasuryAccountType.VAULT, "gl": "1010"},
            {"name": "Afriland First Bank", "type": models.TreasuryAccountType.BANK, "gl": "1031"},
            {"name": "BALICO / CCA Bank", "type": models.TreasuryAccountType.BANK, "gl": "1032"},
            {"name": "MTN Mobile Money", "type": models.TreasuryAccountType.MOBILE_MONEY, "gl": "1041"},
            {"name": "Orange Money", "type": models.TreasuryAccountType.MOBILE_MONEY, "gl": "1042"},
        ]
        
        for ta in treasury_accounts:
            account = models.TreasuryAccount(
                name=ta["name"],
                account_type=ta["type"],
                gl_account_code=ta["gl"],
                branch_id=ho_branch.id,
                is_active=True
            )
            db.add(account)

        db.commit()
        print("--- [SYSTEM GENESIS RESET - COMPLETE] ---")
        print("The system is now at state 'Zero'.")
        print("Default users created with password: 'digital2026'")

    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        print(f"CRITICAL ERROR during genesis reset: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    genesis_reset()
