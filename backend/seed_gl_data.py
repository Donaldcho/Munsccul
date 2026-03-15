import sys
import os
from decimal import Decimal

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def seed_gl_data():
    # Local Override for dev execution
    DATABASE_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
    engine = create_engine(DATABASE_URL)
    SessionOverride = sessionmaker(bind=engine)
    db = SessionOverride()
    try:
        print("Starting GL Seeding (COBAC/OHADA Standards)...")
        
        # 1. Chart of Accounts (COA)
        # Category 1: Assets (What the Credit Union owns)
        coa = [
            # 1000 - Cash and Equivalents
            {"code": "1010", "name": "Main Vault - Cash", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1020", "name": "Teller 1 Drawer", "type": "ASSET", "class": 1, "category": "10"},
            
            # 1030 - Commercial Bank Placements
            {"code": "1030", "name": "Commercial Banks (General)", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1031", "name": "Afriland First Bank", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1032", "name": "BALICO / CCA Bank", "type": "ASSET", "class": 1, "category": "10"},
            
            # 1040 - Mobile Money Placements
            {"code": "1040", "name": "Mobile Money (General)", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1041", "name": "MTN Mobile Money Wallet", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1042", "name": "Orange Money Wallet", "type": "ASSET", "class": 1, "category": "10"},
            
            # 1200 - Loans to Members
            {"code": "1210", "name": "Ordinary Loans Portfolio", "type": "ASSET", "class": 1, "category": "12"},
            {"code": "1220", "name": "School Fees Loans Portfolio", "type": "ASSET", "class": 1, "category": "12"},
            
            # 2000 - Liabilities (What the Credit Union owes)
            {"code": "2010", "name": "Member Savings Deposits", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2020", "name": "Member Share Capital", "type": "LIABILITY", "class": 2, "category": "20"},
            
            # 3000 - Equity
            {"code": "3010", "name": "Retained Earnings", "type": "EQUITY", "class": 3, "category": "30"},
            
            # 4000 - Income
            {"code": "4110", "name": "Interest Income from Loans", "type": "INCOME", "class": 4, "category": "41"},
            {"code": "4210", "name": "Account Opening Fees", "type": "INCOME", "class": 4, "category": "42"},
            {"code": "4220", "name": "Withdrawal Fees", "type": "INCOME", "class": 4, "category": "42"},
            
            # 5000 - Expenses
            {"code": "5110", "name": "Staff Salaries", "type": "EXPENSE", "class": 5, "category": "51"},
            {"code": "5210", "name": "Office Rent", "type": "EXPENSE", "class": 5, "category": "52"},
        ]

        gl_map = {}
        for item in coa:
            account = db.query(models.GLAccount).filter(models.GLAccount.account_code == item["code"]).first()
            if not account:
                print(f"  Creating GL Account: {item['code']} - {item['name']}")
                account = models.GLAccount(
                    account_code=item["code"],
                    account_name=item["name"],
                    account_type=item["type"],
                    account_class=item["class"],
                    account_category=item["category"],
                    usage="DETAIL"
                )
                db.add(account)
                db.flush()
            gl_map[item["code"]] = account.id

        db.commit()

        # 2. Accounting Rules (Transaction Mapping)
        rules = [
            {
                "name": "Member Deposit",
                "tx_type": "DEPOSIT",
                "debit": "1010", # Vault/Cash
                "credit": "2010" # Savings
            },
            {
                "name": "Member Withdrawal",
                "tx_type": "WITHDRAWAL",
                "debit": "2010", # Savings
                "credit": "1010" # Vault/Cash
            },
            {
                "name": "Loan Disbursement",
                "tx_type": "LOAN_DISBURSEMENT",
                "debit": "1210", # Loans Asset
                "credit": "2010" # Credited to member savings
            },
            {
                "name": "Loan Repayment",
                "tx_type": "LOAN_REPAYMENT",
                "debit": "2010", # From Member Savings
                "credit": "1210" # To Loans Asset
            }
        ]

        print("Updating Accounting Rules...")
        for rule_data in rules:
            rule = db.query(models.AccountingRule).filter(models.AccountingRule.transaction_type == rule_data["tx_type"]).first()
            if not rule:
                rule = models.AccountingRule(
                    name=rule_data["name"],
                    transaction_type=rule_data["tx_type"],
                    debit_account_id=gl_map[rule_data["debit"]],
                    credit_account_id=gl_map[rule_data["credit"]],
                    is_active=True
                )
                db.add(rule)

        # 3. Link Branch and Users to GL
        print("Linking Branch HO to Vault GL...")
        ho_branch = db.query(models.Branch).filter(models.Branch.code == "HO").first()
        if ho_branch:
            ho_branch.gl_vault_code = "1010"
        
        print("Linking Teller to Drawer GL...")
        teller = db.query(models.User).filter(models.User.username == "teller").first()
        if teller:
            teller_gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == "1020").first()
            if teller_gl:
                teller.teller_gl_account_id = teller_gl.id

        db.commit()
        print("GL Seeding Complete.")

    except Exception as e:
        print(f"Error seeding GL data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_gl_data()
