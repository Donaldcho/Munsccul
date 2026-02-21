"""
COBAC Regulatory Compliance Migration
Adds new columns and enum values required for COBAC constraints.
Safe to run multiple times (uses IF NOT EXISTS patterns).
"""
import psycopg2
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://camccul:camccul_password@localhost:5432/camccul_banking"
)

def parse_db_url(url):
    """Parse database URL into connection params"""
    # postgresql://user:pass@host:port/dbname
    url = url.replace("postgresql://", "")
    userpass, hostdb = url.split("@")
    user, password = userpass.split(":")
    hostport, dbname = hostdb.split("/")
    if ":" in hostport:
        host, port = hostport.split(":")
    else:
        host, port = hostport, "5432"
    return {
        "host": host,
        "port": int(port),
        "user": user,
        "password": password,
        "dbname": dbname
    }

def run_migration():
    params = parse_db_url(DATABASE_URL)
    conn = psycopg2.connect(**params)
    conn.autocommit = True
    cur = conn.cursor()
    
    print("=== COBAC Regulatory Compliance Migration ===\n")
    
    # 1. Add SHARES to accounttype enum
    print("[1/6] Adding SHARES to accounttype enum...")
    try:
        cur.execute("ALTER TYPE accounttype ADD VALUE IF NOT EXISTS 'SHARES';")
        print("  ✓ SHARES added to accounttype enum")
    except Exception as e:
        print(f"  ⚠ {e}")
    
    # 2. Add dormancy fields to accounts table
    print("[2/6] Adding dormancy tracking fields to accounts...")
    for col, dtype, default in [
        ("last_member_activity", "TIMESTAMP", None),
        ("dormancy_status", "VARCHAR(20)", "'ACTIVE'"),
    ]:
        try:
            sql = f"ALTER TABLE accounts ADD COLUMN IF NOT EXISTS {col} {dtype}"
            if default:
                sql += f" DEFAULT {default}"
            cur.execute(sql)
            print(f"  ✓ accounts.{col}")
        except Exception as e:
            print(f"  ⚠ accounts.{col}: {e}")
    
    # 3. Add income/minor fields to members table
    print("[3/6] Adding income & minor account fields to members...")
    for col, dtype, default in [
        ("monthly_income", "NUMERIC(15,2)", None),
        ("guardian_member_id", "INTEGER", None),
        ("is_minor", "BOOLEAN", "FALSE"),
    ]:
        try:
            sql = f"ALTER TABLE members ADD COLUMN IF NOT EXISTS {col} {dtype}"
            if default:
                sql += f" DEFAULT {default}"
            cur.execute(sql)
            print(f"  ✓ members.{col}")
        except Exception as e:
            print(f"  ⚠ members.{col}: {e}")
    
    # 4. Add foreign key for guardian_member_id
    print("[4/6] Adding guardian foreign key constraint...")
    try:
        cur.execute("""
            DO $$ BEGIN
                ALTER TABLE members 
                ADD CONSTRAINT fk_members_guardian 
                FOREIGN KEY (guardian_member_id) REFERENCES members(id);
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """)
        print("  ✓ FK constraint fk_members_guardian")
    except Exception as e:
        print(f"  ⚠ {e}")
    
    # 5. Set default dormancy_status for existing accounts
    print("[5/6] Setting defaults for existing data...")
    try:
        cur.execute("UPDATE accounts SET dormancy_status = 'ACTIVE' WHERE dormancy_status IS NULL;")
        cur.execute("UPDATE members SET is_minor = FALSE WHERE is_minor IS NULL;")
        print("  ✓ Defaults applied")
    except Exception as e:
        print(f"  ⚠ {e}")
    
    # 6. Verify
    print("[6/6] Verifying migration...")
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts' AND column_name IN ('last_member_activity', 'dormancy_status')")
    account_cols = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'members' AND column_name IN ('monthly_income', 'guardian_member_id', 'is_minor')")
    member_cols = [r[0] for r in cur.fetchall()]
    
    print(f"  Accounts new cols: {account_cols}")
    print(f"  Members new cols: {member_cols}")
    
    # Check SHARES enum
    cur.execute("SELECT unnest(enum_range(null::accounttype))")
    enum_vals = [r[0] for r in cur.fetchall()]
    print(f"  AccountType enum values: {enum_vals}")
    
    cur.close()
    conn.close()
    
    print("\n=== Migration Complete ===")
    if 'SHARES' in enum_vals and len(account_cols) == 2 and len(member_cols) == 3:
        print("✅ All COBAC fields successfully added!")
    else:
        print("⚠ Some fields may be missing - check output above.")

if __name__ == "__main__":
    run_migration()
