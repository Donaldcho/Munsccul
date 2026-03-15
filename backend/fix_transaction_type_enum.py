import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def safe_execute(conn, sql, description):
    try:
        # PostgreSQL specific: ADD VALUE IF NOT EXISTS cannot be run in a transction block in some versions
        # but here we'll try standard execution
        conn.execute(text(sql))
        conn.commit()
        print(f"PASS: {description}")
    except Exception as e:
        conn.rollback()
        if "already exists" in str(e).lower():
            print(f"INFO: {description} (already exists)")
        else:
            print(f"FAIL: {description} - {e}")

def fix_enums():
    # We need to set autocommit because ALTER TYPE ADD VALUE cannot run in a transaction block
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        print("Synchronizing TransactionType enum values...")
        
        values = [
            'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'LOAN_DISBURSEMENT',
            'LOAN_REPAYMENT', 'FEE', 'INTEREST', 'NJANGI_CONTRIBUTION',
            'NJANGI_PAYOUT', 'SHARE_PURCHASE', 'ENTRANCE_FEE'
        ]
        
        for val in values:
            sql = f"ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS '{val}';"
            try:
                conn.execute(text(sql))
                print(f"SUCCESS: Added/Verified '{val}' in transactiontype enum")
            except Exception as e:
                print(f"ERROR: Could not add '{val}' - {e}")

    print("Enum synchronization complete.")

if __name__ == "__main__":
    fix_enums()
