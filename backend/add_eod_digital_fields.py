import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def upgrade_database():
    with engine.connect() as conn:
        print("Adding digital float fields to teller_reconciliations table...")
        try:
            # MTN MoMo fields
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN declared_momo_balance NUMERIC(15, 2) DEFAULT 0.00;"))
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN system_expected_momo_balance NUMERIC(15, 2) DEFAULT 0.00;"))
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN momo_variance NUMERIC(15, 2) DEFAULT 0.00;"))
            
            # Orange Money fields
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN declared_om_balance NUMERIC(15, 2) DEFAULT 0.00;"))
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN system_expected_om_balance NUMERIC(15, 2) DEFAULT 0.00;"))
            conn.execute(text("ALTER TABLE teller_reconciliations ADD COLUMN om_variance NUMERIC(15, 2) DEFAULT 0.00;"))
            
            conn.commit()
            print("Successfully added digital float fields.")
        except Exception as e:
            print(f"Error altering teller_reconciliations: {e}")
            
    print("Database upgrade complete.")

if __name__ == "__main__":
    upgrade_database()
