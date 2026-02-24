import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine, Base
from app import models

def upgrade_database():
    with engine.connect() as conn:
        print("Starting database schema update for Ops Manager...")
        
        # 1. Add counter_number to users
        print("Adding counter_number to users table...")
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN counter_number VARCHAR(20);"))
            print("Successfully added counter_number.")
        except Exception as e:
            if "already exists" in str(e):
                print("counter_number already exists.")
            else:
                print(f"Error adding counter_number: {e}")
        
        # 2. Add fields to branches
        print("Adding status and float fields to branches table...")
        try:
            # Handle ENUM creation for Postgres
            try:
                conn.execute(text("CREATE TYPE branchstatus AS ENUM ('OPEN', 'EOD_IN_PROGRESS', 'CLOSED');"))
            except Exception as e:
                print(f"Note: branchstatus type might already exist: {e}")
                
            conn.execute(text("ALTER TABLE branches ADD COLUMN status branchstatus DEFAULT 'OPEN';"))
            print("Successfully added branch status.")
        except Exception as e:
            if "already exists" in str(e):
                print("branch status already exists.")
            else:
                print(f"Error adding branch status: {e}")
                
        try:
            conn.execute(text("ALTER TABLE branches ADD COLUMN vault_cash_limit NUMERIC(18, 2) DEFAULT 15000000.00;"))
            conn.execute(text("ALTER TABLE branches ADD COLUMN mtn_float NUMERIC(18, 2) DEFAULT 0.00;"))
            conn.execute(text("ALTER TABLE branches ADD COLUMN orange_float NUMERIC(18, 2) DEFAULT 0.00;"))
            print("Successfully added branch float fields.")
        except Exception as e:
            print(f"Note: Some branch float fields might already exist: {e}")

        conn.commit()

    # 3. Create new tables (TransactionOverride)
    print("Creating new tables (TransactionOverride, etc.)...")
    try:
        # Create the overridestatus enum type if it doesn't exist
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE TYPE overridestatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');"))
                conn.commit()
            except Exception as e:
                print(f"Note: overridestatus type might already exist: {e}")

        Base.metadata.create_all(bind=engine)
        print("New tables created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")
        
    print("Database upgrade complete.")

if __name__ == "__main__":
    upgrade_database()
