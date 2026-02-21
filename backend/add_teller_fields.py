import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine, Base
from app import models

def upgrade_database():
    with engine.connect() as conn:
        print("Adding fields to users table...")
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN teller_cash_limit NUMERIC(15, 2) DEFAULT 1000000.00;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN teller_gl_account_id INTEGER REFERENCES accounts(id);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN teller_pin VARCHAR(255);"))
            print("Successfully added users fields.")
        except Exception as e:
            print(f"Error altering users: {e}")
            
        print("Adding fields to members table...")
        try:
            conn.execute(text("ALTER TABLE members ADD COLUMN signature_scan_path VARCHAR(255);"))
            print("Successfully added members fields.")
        except Exception as e:
            print(f"Error altering members: {e}")
            
        conn.commit()

    print("Creating new tables (TellerReconciliation)...")
    Base.metadata.create_all(bind=engine)
    print("Database upgrade complete.")

if __name__ == "__main__":
    upgrade_database()
