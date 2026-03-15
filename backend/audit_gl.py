import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from decimal import Decimal

# Add the project directory to sys.path
sys.path.append(os.getcwd())

from backend.app import models

# Manual DB URL override for local execution (Note: port 5434 based on docker ps)
DATABASE_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()

print("--- GL ACCOUNTS ---")
gl_accounts = db.query(models.GLAccount).all()
if not gl_accounts:
    print("No GL accounts found.")
for acc in gl_accounts:
    print(f"Code: {acc.account_code}, Name: {acc.account_name}, Type: {acc.account_type}")

print("\n--- ACCOUNTING RULES ---")
rules = db.query(models.AccountingRule).all()
if not rules:
    print("No accounting rules found.")
for rule in rules:
    print(f"Type: {rule.transaction_type}, Debit: {rule.debit_account.account_code if rule.debit_account else 'N/A'}, Credit: {rule.credit_account.account_code if rule.credit_account else 'N/A'}")

db.close()
