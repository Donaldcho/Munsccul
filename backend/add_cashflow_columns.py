import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def upgrade_database():
    with engine.connect() as conn:
        print("Checking for missing columns in transactions table...")
        
        # 1. Add payment_channel
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50) DEFAULT 'CASH' NOT NULL;"))
            print("Verified payment_channel column.")
        except Exception as e:
            print(f"Error adding payment_channel: {e}")
            
        # 2. Add purpose
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purpose VARCHAR(50);"))
            print("Verified purpose column.")
        except Exception as e:
            print(f"Error adding purpose: {e}")
            
        # 3. Add external_reference
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_reference VARCHAR(50);"))
            print("Verified external_reference column.")
        except Exception as e:
            print(f"Error adding external_reference: {e}")
            
        # 4. Add comments
        try:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS comments TEXT;"))
            print("Verified comments column.")
        except Exception as e:
            print(f"Error adding comments: {e}")
            
        conn.commit()
    
    print("Database upgrade check complete.")

if __name__ == "__main__":
    upgrade_database()
