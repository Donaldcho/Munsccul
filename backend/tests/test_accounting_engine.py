import pytest
from fastapi import status
from app import models
from decimal import Decimal

from datetime import datetime
from app.services.eod import EODService


def setup_accounting_test_data(db_session, branch_id):
    """Ensure baseline GL accounts and open EOD state for testing."""
    # 1. Ensure 1010 exists
    vault_gl = db_session.query(models.GLAccount).filter(models.GLAccount.account_code == "1010").first()
    if not vault_gl:
        vault_gl = models.GLAccount(
            account_code="1010",
            account_name="Main Vault Cash",
            account_class=1,
            account_category="10",
            account_type="ASSET",
            usage="DETAIL",
            is_active=True
        )
        db_session.add(vault_gl)
    
    # 2. Ensure 3010 exists
    equity_gl = db_session.query(models.GLAccount).filter(models.GLAccount.account_code == "3010").first()
    if not equity_gl:
        equity_gl = models.GLAccount(
            account_code="3010",
            account_name="Retained Earnings",
            account_class=3,
            account_category="30",
            account_type="EQUITY",
            usage="DETAIL",
            is_active=True
        )
        db_session.add(equity_gl)
        
    # 3. Ensure EOD is NOT closed for today on this branch
    target_date = datetime.utcnow().date()
    closure = db_session.query(models.DailyClosure).filter(
        models.DailyClosure.closure_date == target_date,
        models.DailyClosure.branch_id == branch_id
    ).first()
    if closure:
        closure.is_closed = False
    # If no closure record exists, the date is open by default (is_date_closed returns False)
    
    db_session.flush()


def test_vault_adjustment_success(client, ops_headers, db_session, ops_manager):
    """
    Test: Create a vault adjustment (Genesis Deposit).
    Debit: 1010 (Vault), Credit: 3010 (Retained Earnings)
    """
    setup_accounting_test_data(db_session, ops_manager.branch_id)
    
    payload = {
        "amount": 50000.0,
        "description": "Initial vault injection for testing"
    }

    response = client.post("/api/v1/treasury/vault-adjustment", headers=ops_headers, json=payload)
    
    assert response.status_code == status.HTTP_200_OK, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert float(data["amount"]) == 50000.0
    assert data["transfer_type"] == "VAULT_ADJUSTMENT"


def test_gl_opening_balance_bulk(client, ops_headers, db_session, ops_manager):
    """
    Test: Post historical GL opening balances (Bulk).
    """
    setup_accounting_test_data(db_session, ops_manager.branch_id)
    
    # Ensure intermediate GLs for bulk test
    for code in ["2020", "1030"]:
        if not db_session.query(models.GLAccount).filter(models.GLAccount.account_code == code).first():
            gl = models.GLAccount(
                account_code=code,
                account_name=f"Test GL {code}",
                account_class=int(code[0]),
                account_category=code[:2],
                account_type="ASSET" if code.startswith("1") else "LIABILITY",
                usage="DETAIL",
                is_active=True
            )
            db_session.add(gl)
    db_session.flush()

    payload = [
        {
            "debit_gl_code": "1010",
            "credit_gl_code": "2020",
            "amount": 100000.0,
            "description": "Initial Share Capital setup"
        },
        {
            "debit_gl_code": "1030",
            "credit_gl_code": "3010",
            "amount": 250000.0,
            "description": "Historical Afriland Balance"
        }
    ]

    response = client.post("/api/v1/treasury/gl-opening-balances", headers=ops_headers, json=payload)
    
    assert response.status_code == status.HTTP_200_OK, f"Expected 200, got {response.status_code}: {response.text}"
    assert response.json()["posted_count"] == 2


def test_gl_balance_update_after_adjustment(client, ops_headers, db_session, ops_manager):
    """
    Test: Verify that a treasury adjustment updates the GL balance correctly.
    """
    setup_accounting_test_data(db_session, ops_manager.branch_id)
    
    vault_gl = db_session.query(models.GLAccount).filter(models.GLAccount.account_code == "1010").first()
    
    payload = {
        "amount": 10000.0,
        "description": "Balance update test"
    }
    
    response = client.post("/api/v1/treasury/vault-adjustment", headers=ops_headers, json=payload)
    assert response.status_code == status.HTTP_200_OK, f"Expected 200, got {response.status_code}: {response.text}"
    
    # Verify journal entries were created
    entries = db_session.query(models.GLJournalEntry).filter(
        models.GLJournalEntry.description == "Balance update test"
    ).all()
    
    assert len(entries) == 2  # 1 debit + 1 credit
    debit_entry = next(e for e in entries if e.entry_type == "DEBIT")
    assert debit_entry.amount == Decimal("10000.0")
    assert debit_entry.gl_account_id == vault_gl.id
