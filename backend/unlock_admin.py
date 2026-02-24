from sqlalchemy import text
from app.database import engine

def unlock():
    with engine.connect() as conn:
        print("Unlocking admin account...")
        conn.execute(text("DELETE FROM login_attempts WHERE username = 'admin';"))
        conn.commit()
    print("Unlock complete.")

if __name__ == "__main__":
    unlock()
