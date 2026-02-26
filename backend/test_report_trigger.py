
import sys
import os
from datetime import date
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

# Mock settings/env
os.environ["DATABASE_URL"] = "postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking"

# Add path to import app
sys.path.append(os.getcwd())

from app.services.reporting import ReportingService
from app.database import SessionLocal, engine
from app import models

def test_trigger():
    db = SessionLocal()
    try:
        target_date = date.today()
        print(f"Generating report for {target_date}...")
        data = ReportingService.generate_daily_cash_flow(db, target_date)
        
        print("Exporting to Excel...")
        file_path = ReportingService.export_to_excel("daily_cash_flow", data)
        
        print(f"Report exported to: {file_path}")
        print("Checking file exists...")
        if os.path.exists(file_path):
            print("SUCCESS: File exists.")
        else:
            print("FAILURE: File NOT found.")
            
    finally:
        db.close()

if __name__ == "__main__":
    test_trigger()
