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
    db = SessionLocal()
    try:
        print("Starting GL Seeding (COBAC/OHADA Standards)...")
        
        # 1. Chart of Accounts (COA)
        coa = [
            # Category 1: Assets
            {"code": "1010", "name": "Main Vault - Cash", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1020", "name": "Teller Drawers (Tills)", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1031", "name": "Afriland First Bank", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1032", "name": "BALICO / CCA Bank", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1041", "name": "MTN Mobile Money Wallet", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1042", "name": "Orange Money Wallet", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1050", "name": "Cash in Transit", "type": "ASSET", "class": 1, "category": "10"},
            {"code": "1210", "name": "Ordinary Loan Portfolio", "type": "ASSET", "class": 1, "category": "12"},
            {"code": "1290", "name": "Provision for Bad Debts", "type": "ASSET", "class": 1, "category": "12"},
            
            # Category 2: Liabilities
            {"code": "2010", "name": "Member Savings Deposits", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2020", "name": "Member Share Capital", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2030", "name": "Term Deposits (Fixed)", "type": "LIABILITY", "class": 2, "category": "20"},
            {"code": "2090", "name": "Dividends Payable", "type": "LIABILITY", "class": 2, "category": "20"},
            
            # Category 3: Equity
            {"code": "3010", "name": "Retained Earnings", "type": "EQUITY", "class": 3, "category": "30"},
            {"code": "3020", "name": "Current Year Profit/Loss", "type": "EQUITY", "class": 3, "category": "30"},
            
            # Category 4: Income
            {"code": "4110", "name": "Interest Income (Loans)", "type": "INCOME", "class": 4, "category": "41"},
            {"code": "4210", "name": "Account Opening Fees", "type": "INCOME", "class": 4, "category": "42"},
            {"code": "4220", "name": "Withdrawal & Transfer Fees", "type": "INCOME", "class": 4, "category": "42"},
            {"code": "4230", "name": "Loan Late Penalties", "type": "INCOME", "class": 4, "category": "42"},
            {"code": "4900", "name": "Cash Overage (EOD)", "type": "INCOME", "class": 4, "category": "49"},
            
            # Category 5: Expenses
            {"code": "5110", "name": "Staff Salaries", "type": "EXPENSE", "class": 5, "category": "51"},
            {"code": "5210", "name": "Office Rent & Utilities", "type": "EXPENSE", "class": 5, "category": "52"},
            {"code": "5310", "name": "IT & Server Hosting", "type": "EXPENSE", "class": 5, "category": "53"},
            {"code": "5900", "name": "Cash Shortage (EOD)", "type": "EXPENSE", "class": 5, "category": "59"},

            # Category 8: Distributed Clearing
            {"code": "8010", "name": "Inter-Branch Transit", "type": "ASSET", "class": 8, "category": "80"},
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
