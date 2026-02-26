import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.database import SessionLocal
from app import models

def seed_treasury():
    db = SessionLocal()
    try:
        branch = db.query(models.Branch).first()
        if not branch:
            print("No branch found. Please seed basic data first.")
            return

        print("Ensuring GL accounts 1010, 1030, 1040 exist...")
        gl_accounts = [
            {"code": "1010", "name": "Internal Physical Cash", "cls": 1, "cat": "10", "type": "ASSET"},
            {"code": "1030", "name": "External Placements (Banks/Partners)", "cls": 1, "cat": "10", "type": "ASSET"},
            {"code": "1040", "name": "Digital Wallets (Mobile Money)", "cls": 1, "cat": "10", "type": "ASSET"}
        ]
        
        for acc in gl_accounts:
            existing = db.query(models.GLAccount).filter_by(account_code=acc["code"]).first()
            if not existing:
                new_gl = models.GLAccount(
                    account_code=acc["code"],
                    account_name=acc["name"],
                    account_class=acc["cls"],
                    account_category=acc["cat"],
                    account_type=acc["type"],
                    usage="DETAIL"
                )
                db.add(new_gl)
                print(f"Added GL: {acc['code']}")
            else:
                print(f"GL {acc['code']} already exists. Skipping.")
        db.commit()
        
        print("\nSeeding Treasury Accounts...")
        treasury_accounts = [
            {
                "name": "Main Branch Vault",
                "type": models.TreasuryAccountType.VAULT,
                "gl": "1010",
                "number": None,
                "limit": None
            },
            {
                "name": "Afriland First Bank (Current Account)",
                "type": models.TreasuryAccountType.BANK,
                "gl": "1030",
                "number": "AFR-0012394",
                "limit": None
            },
            {
                "name": "BALICO Credit Union (Savings Account)",
                "type": models.TreasuryAccountType.CREDIT_UNION,
                "gl": "1030",
                "number": "BAL-88229",
                "limit": None
            },
            {
                "name": "MTN Mobile Money (Corporate)",
                "type": models.TreasuryAccountType.MOBILE_MONEY,
                "gl": "1040",
                "number": "670000000",
                "limit": 5000000.00
            },
            {
                "name": "Orange Money (Corporate)",
                "type": models.TreasuryAccountType.MOBILE_MONEY,
                "gl": "1040",
                "number": "690000000",
                "limit": 5000000.00
            }
        ]
        
        for ta in treasury_accounts:
            existing = db.query(models.TreasuryAccount).filter_by(name=ta["name"], branch_id=branch.id).first()
            if not existing:
                new_ta = models.TreasuryAccount(
                    name=ta["name"],
                    account_type=ta["type"],
                    account_number=ta["number"],
                    branch_id=branch.id,
                    gl_account_code=ta["gl"],
                    max_limit=ta["limit"]
                )
                db.add(new_ta)
                print(f"Added Treasury Account: {ta['name']}")
            else:
                print(f"Treasury Account {ta['name']} already exists. Skipping.")
                
        db.commit()
        print("\nSuccessfully seeded treasury accounts and GLs!")

    except Exception as e:
        print(f"Error seeding treasury: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_treasury()
