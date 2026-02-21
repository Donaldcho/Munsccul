from app.database import SessionLocal
from app.services.reporting import ReportingService
from datetime import date
import json

db = SessionLocal()
# Report for tomorrow
as_of = date(2026, 2, 21)
data = ReportingService.generate_trial_balance(db, as_of)

print(f"Report Date: {as_of}")
print("-" * 50)
for item in data:
    if item['opening_balance'] != 0 or item['debit'] != 0 or item['credit'] != 0:
        print(f"Account: {item['account_name']}")
        print(f"  Opening: {item['opening_balance']}")
        print(f"  Debit:   {item['debit']}")
        print(f"  Credit:  {item['credit']}")
        print(f"  Closing: {item['closing_balance']}")
        print("-" * 20)
