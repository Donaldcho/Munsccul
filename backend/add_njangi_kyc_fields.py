import psycopg2
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking")

def run():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        print("Adding PENDING_KYC to enum NjangiGroupStatus...")
        cursor.execute("ALTER TYPE njangigroupstatus ADD VALUE IF NOT EXISTS 'PENDING_KYC';")
    except Exception as e:
        print(f"Enum update error (might already exist): {e}")
        
    try:
        print("Adding columns to njangi_groups...")
        cursor.execute("ALTER TABLE njangi_groups ADD COLUMN IF NOT EXISTS bylaws_url VARCHAR(255);")
        cursor.execute("ALTER TABLE njangi_groups ADD COLUMN IF NOT EXISTS meeting_minutes_url VARCHAR(255);")
        cursor.execute("ALTER TABLE njangi_groups ADD COLUMN IF NOT EXISTS executive_signatories TEXT;")
    except Exception as e:
        print(f"Columns update error: {e}")
        
    cursor.close()
    conn.close()
    print("Done")

if __name__ == "__main__":
    run()
