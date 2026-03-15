from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from app import models
from app.services.accounting import AccountingService
from app.services.eod import EODService
from app.routers.transactions import create_double_entry_transaction

def setup_dynamic_policies(db: Session):
    """Seed the database with dynamic GL mappings."""
    potential_policies = [
        ("gl_map_inter_branch_transit", "8010"),
        ("gl_map_eod_overage", "4900"),
        ("gl_map_eod_shortage", "5900")
    ]
    
    for key, value in potential_policies:
        exists = db.query(models.GlobalPolicy).filter(
            models.GlobalPolicy.policy_key == key,
            models.GlobalPolicy.status == models.PolicyStatus.ACTIVE
        ).first()
        if not exists:
            db.add(models.GlobalPolicy(
                policy_key=key, 
                policy_value=value, 
                status=models.PolicyStatus.ACTIVE, 
                proposed_by_id=1, 
                approved_by_id=1
            ))
    db.commit()

def test_inter_branch_withdrawal_routing(db: Session):
    """
    Test Clearing: Verify that withdrawing from a different branch creates
    the correct cross-branch clearing entries.
    """
    setup_dynamic_policies(db)
    
    # 1. Setup Branches
    branch_buea = db.query(models.Branch).filter(models.Branch.code == "BUEA").first()
    if not branch_buea:
        branch_buea = models.Branch(code="BUEA", name="Buea Branch", city="Buea", region="SW")
        db.add(branch_buea)
    
    branch_douala = db.query(models.Branch).filter(models.Branch.code == "DLA").first()
    if not branch_douala:
        branch_douala = models.Branch(code="DLA", name="Douala Branch", city="Douala", region="LT")
        db.add(branch_douala)
    db.commit()
    
    # 2. Setup Member at Buea
    member = db.query(models.Member).filter(models.Member.member_id == "MEM-BUEA-001").first()
    if not member:
        member = models.Member(
            member_id="MEM-BUEA-001", first_name="John", last_name="Doe", 
            date_of_birth=datetime(1990, 1, 1), phone_primary="670000000",
            next_of_kin_name="Jane Doe", next_of_kin_phone="671111111", next_of_kin_relationship="Wife",
            branch_id=branch_buea.id, registered_by=1
        )
        db.add(member)
        db.flush()
    
    account = db.query(models.Account).filter(models.Account.account_number == "2010-BUEA-001").first()
    if not account:
        account = models.Account(
            account_number="2010-BUEA-001", member_id=member.id, 
            account_class=2, account_category="20", account_type=models.AccountType.SAVINGS,
            balance=Decimal("100000.00"), available_balance=Decimal("100000.00"),
            opened_by=1
        )
        db.add(account)
    else:
        # RESET BALANCE for idempotency
        account.balance = Decimal("100000.00")
        account.available_balance = Decimal("100000.00")
    db.commit()

    # 3. Setup Teller at Douala
    teller = db.query(models.User).filter(models.User.username == "teller_dla").first()
    if not teller:
        teller = models.User(
            username="teller_dla", full_name="Douala Teller", 
            hashed_password="hashed", role=models.UserRole.TELLER,
            branch_id=branch_douala.id, is_active=True,
            teller_gl_account_id=1 
        )
        db.add(teller)
    db.commit()
    
    # 4. Perform Withdrawal at Douala (Serving) for Buea Member (Home)
    amount = Decimal("50000.00")
    print(f"DEBUG: Member Branch ID: {account.member.branch_id}")
    teller_branch = db.query(models.Branch).join(models.User).filter(models.User.id == teller.id).first()
    print(f"DEBUG: Teller Branch ID: {teller_branch.id}")
    
    print("Starting Inter-branch Withdrawal...")
    txn = create_double_entry_transaction(
        db=db,
        account=account,
        transaction_type=models.TransactionType.WITHDRAWAL,
        amount=amount,
        debit_account_code="2010", # This will be overridden by transit 8010
        credit_account_code="1020",
        description="Cross-branch withdrawal",
        created_by=teller.id
    )
    print(f"Withdrawal created. Ref: {txn.transaction_ref}, Debit: {txn.debit_account}")
    
    print(f"DEBUG: Account Balance: {account.balance}")
    # VERIFICATION
    # The transaction record should show transit GL as debit
    assert txn.debit_account == "8010"
    assert txn.credit_account == "1020"
    
    # Check that savings account was still debited for internal tracking
    assert account.balance == Decimal("50000.00")
    print("Test Inter-branch Withdrawal: PASSED")

def test_eod_shortage_journaling(db: Session):
    """
    Test EOD Discrepancy: Verify shortage auto-journals to 5900.
    """
    setup_dynamic_policies(db)
    
    # Cleanup old entries for this test to avoid false positives
    shortage_gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == "5900").first()
    if shortage_gl:
        db.query(models.GLJournalEntry).filter(
            models.GLJournalEntry.gl_account_id == shortage_gl.id,
            models.GLJournalEntry.entry_type == "DEBIT"
        ).delete()
        db.commit()
    
    # 1. Setup Teller with GL account
    print("Setting up Teller with GL...")
    teller_gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == "1020").first()
    if not teller_gl:
        # Fallback to Vault if 1020 missing from seed
        teller_gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == "1010").first()
    
    test_teller = db.query(models.User).filter(models.User.username == "test_teller_eod").first()
    if not test_teller:
        test_teller = models.User(
            username="test_teller_eod", full_name="EOD Test Teller", 
            hashed_password="hashed", role=models.UserRole.TELLER,
            branch_id=1, is_active=True
        )
        db.add(test_teller)
    
    test_teller.teller_gl_account_id = teller_gl.id
    db.commit()

    # 2. Setup Teller Reconciliation with variance
    print("Setting up Teller Reconciliation...")
    recon = models.TellerReconciliation(
        teller_id=test_teller.id,
        branch_id=1,
        declared_amount=Decimal("995000.00"),
        system_expected_amount=Decimal("1000000.00"),
        variance_amount=Decimal("-5000.00"),
        status="PENDING_REVIEW",
        created_at=datetime.utcnow()
    )
    db.add(recon)
    db.commit()
    
    # 3. Finalize EOD
    print("Processing Teller Variances...")
    EODService.process_teller_variances(db, datetime.utcnow().date(), 1, 1)
    db.commit()
    
    # VERIFICATION
    # Check if a transaction for the shortage was created
    print("Verifying GL entries for shortage...")
    gl_entry = db.query(models.GLJournalEntry).filter(
        models.GLJournalEntry.entry_type == "DEBIT"
    ).join(models.GLAccount).filter(models.GLAccount.account_code == "5900").first()
    
    assert gl_entry is not None
    assert gl_entry.amount == Decimal("5000.00")
    print("Test EOD Shortage: PASSED")

if __name__ == "__main__":
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        print("Running COBAC Upgrade Tests...")
        test_inter_branch_withdrawal_routing(db)
        test_eod_shortage_journaling(db)
        print("All tests PASSED.")
    except Exception as e:
        print("\n" + "="*50)
        print("!!! TEST SUITE ERROR !!!")
        print("="*50)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        print("="*50 + "\n")
    finally:
        db.close()
    print("TEST SCRIPT FINISHED")
