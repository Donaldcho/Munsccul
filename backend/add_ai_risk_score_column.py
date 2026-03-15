from sqlalchemy import create_engine, text
from app.database import engine

def add_ai_risk_score_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE loans ADD COLUMN ai_risk_score FLOAT NULL;"))
            conn.commit()
            print("Successfully added ai_risk_score column to loans table.")
        except Exception as e:
            print(f"Error adding column: {e}")

if __name__ == "__main__":
    add_ai_risk_score_column()
