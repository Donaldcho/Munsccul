import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import models
from app.auth import create_access_token, get_password_hash
from decimal import Decimal
from datetime import datetime
from app.services.eod import EODService

def test_raw_vault_adjustment(db_session):
    client = TestClient(app)
    
    # 1. Setup Branch
    import secrets
    branch_code = f"DBUG-{secrets.token_hex(2)}"
    branch = models.Branch(
        name="Debug Branch",
        code=branch_code,
        server_api_key=secrets.token_hex(16),
        is_active=True,
        city="Test City",
        region="Test Region"
    )
    db_session.add(branch)
    db_session.flush()
    
    # 2. Setup Ops Manager
    user = models.User(
        username="debug_ops",
        full_name="Debug Ops",
        hashed_password=get_password_hash("password123"),
        role=models.UserRole.OPS_MANAGER,
        branch_id=branch.id,
        is_active=True,
        approval_status=models.UserApprovalStatus.APPROVED
    )
    db_session.add(user)
    db_session.flush()
    
    # 3. Setup GL Accounts
    for code in ["1010", "3010"]:
        gl = models.GLAccount(
            account_code=code,
            account_name=f"GL {code}",
            account_class=int(code[0]),
            account_category=code[:2],
            account_type="ASSET" if code.startswith("1") else "EQUITY",
            usage="DETAIL",
            is_active=True
        )
        db_session.add(gl)
    
    # 4. Ensure EOD Open
    target_date = datetime.utcnow().date()
    closure = EODService.get_or_create_closure_record(db_session, target_date, branch.id)
    closure.is_closed = False
    
    db_session.commit()
    
    # 5. Get Token
    access_token = create_access_token(data={"sub": user.username})
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # 6. Call API
    payload = {"amount": 1000.0, "description": "Debug adjustment"}
    print("\n--- Sending request ---")
    try:
        response = client.post("/api/v1/treasury/vault-adjustment", headers=headers, json=payload)
        print(f"--- Status: {response.status_code} ---")
        if response.status_code == 200:
            print(f"--- Response: {response.json()} ---")
        else:
            print(f"--- Error Body: {response.text} ---")
    except Exception as e:
        print(f"--- EXCEPTION: {type(e).__name__}: {e} ---")
        import traceback
        traceback.print_exc()
        raise e
