import sys
from datetime import date
from decimal import Decimal
from app.database import SessionLocal
from app.models import Member, Account

db = SessionLocal()

print("Seeding test members for Loan Testing...")

def create_member(first, last, nat_id):
    member = db.query(Member).filter_by(national_id=nat_id).first()
    if not member:
        member = Member(
            member_id=f"MEM-{nat_id[-4:]}",
            first_name=first,
            last_name=last,
            date_of_birth=date(1980, 1, 1),
            gender="male",
            national_id=nat_id,
            phone_primary=f"2376{nat_id[-8:]}",
            email=f"{first.lower()}.{last.lower()}@example.com",
            address="Yaounde",
            is_active=True,
            branch_id=1,
            registered_by=1,
            next_of_kin_name=f"{first} Kin",
            next_of_kin_phone="237600000000",
            next_of_kin_relationship="Parent"
        )
        # Note: Member doesn't have an is_insider field natively in this model part
        # Wait, if Insider is determined by UserRole, this is just a Member.
        db.add(member)
        db.commit()
        db.refresh(member)
        print(f"Created Member: {first} {last} (ID: {member.id})")
        
        # Create a Savings Account with large balance
        acct = Account(
            account_number=f"SAV-{member.id}-001",
            account_class=3,
            account_category="37",
            member_id=member.id,
            account_type="SAVINGS",
            balance=Decimal("20000000.00"),  # 20M XAF
            available_balance=Decimal("20000000.00"),
            interest_rate=Decimal("2.5"),
            is_active=True,
            opened_by=1
        )
        db.add(acct)
        db.commit()
        print(f"Created Savings Account {acct.account_number} with 20M XAF.")
    else:
        print(f"Member {first} {last} already exists.")
        
    return member

# Create 1 Applicant and 1 Guarantor
applicant = create_member("Loan", "Applicant", "ID-LOAN-APP")
guarantor = create_member("Loan", "Guarantor", "ID-LOAN-GUAR")

# Let's also create an Insider member for testing the bypass rule
insider = create_member("Insider", "Staff", "ID-INSIDER")

print("Done creating test members.")
