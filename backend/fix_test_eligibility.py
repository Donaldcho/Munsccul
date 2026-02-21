from app.database import SessionLocal
from app.models import Member, Account, AccountType
from datetime import datetime, timedelta

db = SessionLocal()

members = db.query(Member).filter(Member.national_id.in_(["ID-LOAN-APP", "ID-LOAN-GUAR", "ID-INSIDER"])).all()

for member in members:
    # 1. Backdate created_at across 100 days to pass cooling-off
    member.created_at = datetime.now() - timedelta(days=100)
    member.updated_at = datetime.now() - timedelta(days=100)
    
    # 2. Ensure an active savings account exists to pass the 3x savings rule
    acct = db.query(Account).filter_by(member_id=member.id).first()
    if not acct:
        print(f"Adding account for {member.first_name} (ID: {member.id})")
        acct = Account(
            account_number=f"SAV-{member.id}-001",
            account_class=3,
            account_category="37",
            member_id=member.id,
            account_type=AccountType.SAVINGS,
            balance=20000000.00,
            available_balance=20000000.00,
            interest_rate=2.5,
            is_active=True,
            opened_by=1
        )
        db.add(acct)
    else:
        print(f"Updating account for {member.first_name} (ID: {member.id})")
        acct.account_type = AccountType.SAVINGS
        acct.balance = 20000000.00
        acct.available_balance = 20000000.00
        acct.is_active = True

db.commit()
print("Test members successfully modified for full COBAC eligibility.")
