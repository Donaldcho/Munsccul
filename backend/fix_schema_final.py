import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine, Base
from app import models

def safe_execute(conn, sql, description):
    try:
        conn.execute(text(sql))
        conn.commit()
        print(f"PASS: {description}")
    except Exception as e:
        conn.rollback()
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            print(f"INFO: {description} (already done)")
        else:
            print(f"FAIL: {description} - {e}")

def upgrade_database():
    with engine.connect() as conn:
        print("Starting robust database schema update...")
        
        # 1. users
        safe_execute(conn, "ALTER TABLE users ADD COLUMN counter_number VARCHAR(20);", "Add counter_number to users")
        
        # 2. ENUMs
        safe_execute(conn, "CREATE TYPE branchstatus AS ENUM ('OPEN', 'EOD_IN_PROGRESS', 'CLOSED');", "Create branchstatus enum")
        safe_execute(conn, "CREATE TYPE overridestatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');", "Create overridestatus enum")
        
        # 3. branches
        safe_execute(conn, "ALTER TABLE branches ADD COLUMN status branchstatus DEFAULT 'OPEN';", "Add status to branches")
        safe_execute(conn, "ALTER TABLE branches ADD COLUMN vault_cash_limit NUMERIC(18, 2) DEFAULT 15000000.00;", "Add vault_cash_limit to branches")
        safe_execute(conn, "ALTER TABLE branches ADD COLUMN mtn_float NUMERIC(18, 2) DEFAULT 0.00;", "Add mtn_float to branches")
        safe_execute(conn, "ALTER TABLE branches ADD COLUMN orange_float NUMERIC(18, 2) DEFAULT 0.00;", "Add orange_float to branches")

    # 4. Tables
    print("Ensuring all tables exist...")
    try:
        Base.metadata.create_all(bind=engine)
        print("PASS: Create tables via SQLAlchemy metadata")
    except Exception as e:
        print(f"FAIL: Create tables - {e}")
        
    print("Database upgrade check complete.")

if __name__ == "__main__":
    upgrade_database()
