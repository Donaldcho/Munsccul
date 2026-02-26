import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.database import engine, Base
from sqlalchemy import text
from app import models

def upgrade_schema():
    print("Creating new tables...")
    # Create treasury_accounts table natively if it doesn't exist
    Base.metadata.create_all(bind=engine, tables=[models.TreasuryAccount.__table__])
    print("Created treasury_accounts table.")

    print("Altering vault_transfers table...")
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE vault_transfers ADD COLUMN source_treasury_id INTEGER REFERENCES treasury_accounts(id)"))
            print("Added source_treasury_id to vault_transfers.")
        except Exception as e:
            print("Could not add source_treasury_id (might already exist):", e)
            
        try:
            conn.execute(text("ALTER TABLE vault_transfers ADD COLUMN destination_treasury_id INTEGER REFERENCES treasury_accounts(id)"))
            print("Added destination_treasury_id to vault_transfers.")
        except Exception as e:
            print("Could not add destination_treasury_id (might already exist):", e)
            
    print("Schema upgrade complete!")

if __name__ == "__main__":
    upgrade_schema()
