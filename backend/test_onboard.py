from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
from app.services.reporting import ReportingService
from datetime import date

def test_onboard_payment_cashflow():
    db = SessionLocal()
    try:
        # Check if the Entrance Fee transaction we just created via script is visible in DCF
        # But wait, the script failed to login. Let's just create a generic mock transaction
        
        # 1. Look for existing entrance fee transactions in the database first to see if any are picked up
        today = date.today()
        dcf = ReportingService.generate_daily_cash_flow(db, today)
        
        found = False
        print("Checking INFLOWS section of Daily Cash Flow...")
        for item in dcf["sections"].get("INFLOWS", []):
            desc = item["description"]
            if desc == "ENTRANCE FEE" or desc == "ENTRANCE FEES":
                found = True
                print(f"FOUND: {desc} -> {item['total']}")
            else:
                print(f"  - {desc}: {item['total']}")
                
        if not found:
            print("\nENTRANCE FEE not found in INFLOWS. Simulating one now...")
            
            # Simulate an entrance fee transaction
            tx = models.Transaction(
                transaction_ref="TEST-FEE-001",
                account_id=1,
                transaction_type=models.TransactionType.ENTRANCE_FEE,
                amount=2500,
                currency="XAF",
                balance_after=0,
                description="Test Entrance Fee",
                payment_channel=models.PaymentChannel.CASH,
                purpose="ENTRANCE_FEE",
                created_by=1
            )
            db.add(tx)
            db.commit()
            
            print("Running Cash Flow again...")
            dcf2 = ReportingService.generate_daily_cash_flow(db, today)
            for item in dcf2["sections"].get("INFLOWS", []):
                desc = item["description"]
                if desc == "ENTRANCE FEE" or desc == "ENTRANCE FEES" or "ENTRANCE" in desc:
                    print(f"FOUND AFTER ADDING: {desc} -> {item['total']}")
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_onboard_payment_cashflow()
