import pytest
from fastapi import status
from decimal import Decimal
from datetime import date

def test_member_onboarding_lifecycle(client, ops_headers, db_session, test_branch):
    """Test creating a member and verifying their initial state."""
    # 1. Create Member
    member_payload = {
        "first_name": "John",
        "last_name": "Doe",
        "date_of_birth": "1990-01-01",
        "phone_primary": "670000000",
        "next_of_kin_name": "Jane Doe",
        "next_of_kin_phone": "670000001",
        "next_of_kin_relationship": "Sister",
        "branch_id": test_branch.id
    }

    response = client.post("/api/v1/members/", headers=ops_headers, json=member_payload)
    assert response.status_code == status.HTTP_200_OK, response.text
    
    data = response.json()
    assert data["first_name"] == "John"
    assert data["member_id"].startswith("MEM-")
    member_id = data["id"]
    
    # Verify the member can be fetched
    get_response = client.get(f"/api/v1/members/{member_id}", headers=ops_headers)
    assert get_response.status_code == status.HTTP_200_OK
    assert get_response.json()["id"] == member_id

def test_account_creation(client, ops_headers, db_session, test_branch):
    """Test creating a savings account for a new member."""
    # 1. Create Member
    member_payload = {
        "first_name": "Alice",
        "last_name": "Smith",
        "date_of_birth": "1985-05-15",
        "phone_primary": "670000002",
        "next_of_kin_name": "Bob Smith",
        "next_of_kin_phone": "670000003",
        "next_of_kin_relationship": "Brother",
        "branch_id": test_branch.id
    }
    member_resp = client.post("/api/v1/members/", headers=ops_headers, json=member_payload)
    member_id = member_resp.json()["id"]
    
    # 2. Create Savings Account
    account_payload = {
        "member_id": member_id,
        "account_type": "SAVINGS",
        "minimum_balance": "5000.00"
    }
    
    response = client.post("/api/v1/accounts/", headers=ops_headers, json=account_payload)
    assert response.status_code == status.HTTP_200_OK, response.text
    
    data = response.json()
    assert data["account_type"] == "SAVINGS"
    assert float(data["balance"]) == 0.0
    assert data["account_number"].startswith("SAV-")

def test_transaction_deposit_withdrawal_flow(client, ops_headers, teller_headers, test_branch):
    """Test a full transaction flow: Deposit -> Withdrawal and verify balances."""
    # 1. Setup Member and Account (using ops manager)
    member_payload = {
        "first_name": "Bob",
        "last_name": "Marley",
        "date_of_birth": "1970-02-06",
        "phone_primary": "670000004",
        "next_of_kin_name": "Ziggy Marley",
        "next_of_kin_phone": "670000005",
        "next_of_kin_relationship": "Son",
        "branch_id": test_branch.id
    }
    member_id = client.post("/api/v1/members/", headers=ops_headers, json=member_payload).json()["id"]
    
    account_payload = {
        "member_id": member_id,
        "account_type": "SAVINGS",
        "minimum_balance": "0.00"
    }
    account_id = client.post("/api/v1/accounts/", headers=ops_headers, json=account_payload).json()["id"]
    
    # 2. Teller performs Deposit
    deposit_payload = {
        "account_id": account_id,
        "amount": 100000.0,
        "payment_channel": "CASH",
        "purpose": "SAVINGS",
        "description": "Initial Deposit"
    }
    dep_resp = client.post("/api/v1/transactions/deposit", headers=teller_headers, json=deposit_payload)
    assert dep_resp.status_code == status.HTTP_200_OK, dep_resp.text
    assert float(dep_resp.json()["amount"]) == 100000.0
    
    # Verify Account Balance
    acc_resp = client.get(f"/api/v1/accounts/{account_id}", headers=ops_headers)
    assert float(acc_resp.json()["balance"]) == 100000.0
    
    # 3. Teller performs Withdrawal
    with_payload = {
        "account_id": account_id,
        "amount": 25000.0,
        "payment_channel": "CASH",
        "purpose": "SAVINGS",
        "description": "ATM Withdrawal"
    }
    with_resp = client.post("/api/v1/transactions/withdrawal", headers=teller_headers, json=with_payload)
    assert with_resp.status_code == status.HTTP_200_OK, with_resp.text
    
    # Verify final Account Balance
    acc_resp = client.get(f"/api/v1/accounts/{account_id}", headers=ops_headers)
    assert float(acc_resp.json()["balance"]) == 75000.0

def test_transaction_internal_transfer(client, ops_headers, teller_headers, test_branch):
    """Test moving funds between two accounts."""
    # 1. Setup Sender
    sender = client.post("/api/v1/members/", headers=ops_headers, json={
        "first_name": "Sender", "last_name": "One", "date_of_birth": "1990-01-01",
        "phone_primary": "670000010", "next_of_kin_name": "x", "next_of_kin_phone": "y",
        "next_of_kin_relationship": "z", "branch_id": test_branch.id
    }).json()
    sender_acc = client.post("/api/v1/accounts/", headers=ops_headers, json={
        "member_id": sender["id"], "account_type": "SAVINGS"
    }).json()
    
    # Fund Sender
    client.post("/api/v1/transactions/deposit", headers=teller_headers, json={
        "account_id": sender_acc["id"], "amount": 50000.0, "payment_channel": "CASH", "purpose": "SAVINGS"
    })
    
    # 2. Setup Receiver
    receiver = client.post("/api/v1/members/", headers=ops_headers, json={
        "first_name": "Receiver", "last_name": "Two", "date_of_birth": "1990-01-01",
        "phone_primary": "670000011", "next_of_kin_name": "x", "next_of_kin_phone": "y",
        "next_of_kin_relationship": "z", "branch_id": test_branch.id
    }).json()
    receiver_acc = client.post("/api/v1/accounts/", headers=ops_headers, json={
        "member_id": receiver["id"], "account_type": "SAVINGS"
    }).json()
    
    # 3. Perform Transfer
    transfer_payload = {
        "from_account_id": sender_acc["id"],
        "to_account_id": receiver_acc["id"],
        "amount": 20000.0,
        "description": "Rent Payment"
    }
    trans_resp = client.post("/api/v1/transactions/transfer", headers=teller_headers, json=transfer_payload)
    assert trans_resp.status_code == status.HTTP_200_OK, trans_resp.text
    
    # 4. Verify Balances
    final_sender_acc = client.get(f"/api/v1/accounts/{sender_acc['id']}", headers=ops_headers).json()
    final_receiver_acc = client.get(f"/api/v1/accounts/{receiver_acc['id']}", headers=ops_headers).json()
    
    assert float(final_sender_acc["balance"]) == 30000.0
    assert float(final_receiver_acc["balance"]) == 20000.0
