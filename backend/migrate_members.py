from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.connect() as conn:
        print("Adding trust_score column...")
        try:
            conn.execute(text('ALTER TABLE members ADD COLUMN trust_score NUMERIC(5, 2) DEFAULT 50.00;'))
        except Exception as e:
            print(f"Error or already exists: {e}")
            
        print("Adding on_time_streak column...")
        try:
            conn.execute(text('ALTER TABLE members ADD COLUMN on_time_streak INTEGER DEFAULT 0;'))
        except Exception as e:
            print(f"Error or already exists: {e}")
            
        print("Adding ai_default_risk_flag column...")
        try:
            conn.execute(text('ALTER TABLE members ADD COLUMN ai_default_risk_flag BOOLEAN DEFAULT FALSE;'))
        except Exception as e:
            print(f"Error or already exists: {e}")
            
        conn.commit()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
