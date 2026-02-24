import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models

def seed_njangi():
    db = SessionLocal()
    try:
        print("Starting Smart Njangi Seeding...")
        
        # 1. Get or Create President Member
        president = db.query(models.Member).filter_by(national_id="ID-PRESIDENT").first()
        if not president:
            president = models.Member(
                member_id="MEM-PRESI",
                first_name="Mama",
                last_name="Celine",
                date_of_birth=datetime(1975, 5, 12),
                national_id="ID-PRESIDENT",
                phone_primary="237670000001",
                branch_id=1,
                registered_by=1,
                next_of_kin_name="Celine Son",
                next_of_kin_phone="237670000002",
                next_of_kin_relationship="Son"
            )
            db.add(president)
            db.flush()
            print(f"Created President: {president.first_name}")

        # 2. Create Njangi Group
        group = db.query(models.NjangiGroup).filter_by(name="Sandaga Market Women").first()
        if not group:
            group = models.NjangiGroup(
                name="Sandaga Market Women",
                description="Savings and Credit for Sandaga merchants",
                contribution_amount=Decimal("50000.00"),
                cycle_frequency=models.CycleInterval.MONTHLY,
                president_id=president.id,
                status=models.NjangiGroupStatus.ACTIVE
            )
            db.add(group)
            db.flush()
            print(f"Created Group: {group.name}")

        # 3. Add Memberships
        members = db.query(models.Member).limit(10).all()
        for i, member in enumerate(members):
            membership = db.query(models.NjangiMembership).filter_by(group_id=group.id, member_id=member.id).first()
            if not membership:
                membership = models.NjangiMembership(
                    group_id=group.id,
                    member_id=member.id,
                    payout_order=i+1,
                    trust_score=Decimal("70.00") if i > 0 else Decimal("90.00")
                )
                db.add(membership)
        db.flush()
        print(f"Added {len(members)} memberships.")

        # 4. Create Current Cycle
        cycle = db.query(models.NjangiCycle).filter_by(group_id=group.id, cycle_number=1).first()
        if not cycle:
            cycle = models.NjangiCycle(
                group_id=group.id,
                cycle_number=1,
                recipient_member_id=president.id,
                start_date=datetime.utcnow() - timedelta(days=5),
                due_date=datetime.utcnow() + timedelta(days=25),
                pot_target_amount=Decimal("500000.00"),
                status=models.CycleStatus.COLLECTING
            )
            db.add(cycle)
            db.flush()
            print(f"Created Cycle #1 for {group.name}")

        # 5. Add some Contributions
        for i, member in enumerate(members[:4]):
            contribution = db.query(models.NjangiContribution).filter_by(cycle_id=cycle.id, member_id=member.id).first()
            if not contribution:
                contribution = models.NjangiContribution(
                    cycle_id=cycle.id,
                    member_id=member.id,
                    amount_paid=Decimal("50000.00"),
                    payment_channel=models.PaymentChannel.MTN_MOMO,
                    status=models.ContributionStatus.PAID_ON_TIME
                )
                db.add(contribution)
                cycle.current_pot_amount += Decimal("50000.00")
        
        db.commit()
        print("Smart Njangi Seeding Complete.")

    except Exception as e:
        print(f"Error seeding Njangi data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_njangi()
