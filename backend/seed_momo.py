from app.database import SessionLocal, init_db
from app import models
from decimal import Decimal

def seed_momo_config():
    db = SessionLocal()
    try:
        # Check for member Donald
        member = db.query(models.Member).filter(models.Member.member_id == 'M443602958').first()
        if member:
            print(f"Member found: {member.first_name} {member.last_name}")
        else:
            print("Member M443602958 not found!")

        # Seed MoMo Config
        for provider in [models.MobileMoneyProvider.MTN_MOMO, models.MobileMoneyProvider.ORANGE_MONEY]:
            config = db.query(models.MobileMoneyConfig).filter(models.MobileMoneyConfig.provider == provider).first()
            if not config:
                config = models.MobileMoneyConfig(
                    provider=provider,
                    api_base_url="https://api.test",
                    api_key="test_key",
                    api_secret="test_secret",
                    collection_enabled=True,
                    disbursement_enabled=True,
                    min_amount=Decimal("100"),
                    max_amount=Decimal("500000"),
                    fee_percentage=Decimal("0.02"),
                    fee_fixed=Decimal("100"),
                    is_active=True
                )
                db.add(config)
                print(f"Seeded {provider.value} config")
            else:
                config.collection_enabled = True
                config.is_active = True
                print(f"{provider.value} config already exists, ensured enabled")
        
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    seed_momo_config()
