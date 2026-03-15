import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import date
from decimal import Decimal

# Add the backend directory to sys.path so we can import 'app' directly
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app import models
from app.services.reporting import ReportingService

# Manual DB URL override for local execution
DATABASE_URL = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()

print("--- VERIFYING TRIAL BALANCE compliance ---")
today = date.today()
tb = ReportingService.generate_trial_balance(db, today)

print(f"As of: {tb['as_of_date']}")
print(f"Total Rows: {len(tb['rows'])}")
print(f"Net Balance: {tb['totals']['net_balance']}")
print(f"Is Balanced: {tb['totals']['is_balanced']}")

important_codes = ["1210", "2020", "4110", "4210", "4220"]
found_codes = [r["account_code"] for r in tb["rows"]]

print("\n--- CHECKING MANDATORY ACCOUNTS ---")
for code in important_codes:
    if code in found_codes:
        row = next(r for r in tb["rows"] if r["account_code"] == code)
        print(f"[OK] {code}: {row['account_name']} (Balance: {row['closing_balance']})")
    else:
        print(f"[FAIL] {code}: Missing from Trial Balance!")

db.close()
