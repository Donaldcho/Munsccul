import requests
import sys

BASE_URL = "http://localhost:8000/api/v1"
import time
TIMESTAMP = int(time.time())
TEST_USER = f"teller_{TIMESTAMP}"

def login(username, password):
    print(f"--- Attempting login for {username} ---")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": username,
            "password": password
        })
        if response.status_code == 200:
            token = response.json()["access_token"]
            user_id = response.json()["user"]["id"]
            print(f"SUCCESS: Logged in as {username}")
            return token, user_id
        else:
            print(f"FAILED: Login failed for {username} (Status: {response.status_code})")
            print(response.text)
            return None, None
    except Exception as e:
        print(f"ERROR: {e}")
        return None, None

def test_role_restriction(token):
    print("\n--- Testing Role Restriction (SYSTEM_ADMIN should be blocked from transactions) ---")
    headers = {"Authorization": f"Bearer {token}"}
    deposit_data = {
        "account_id": 1,
        "amount": 1000,
        "description": "IAM SOP Validation Deposit"
    }
    response = requests.post(f"{BASE_URL}/transactions/deposit", json=deposit_data, headers=headers)
    if response.status_code == 403:
        print("SUCCESS: SYSTEM_ADMIN correctly restricted (403 Forbidden)")
    else:
        print(f"FAILED: SYSTEM_ADMIN was NOT restricted (Status: {response.status_code})")
        print(response.text)

def test_maker_checker(admin_token):
    print("\n--- Testing Maker-Checker (User Creation & Activation) ---")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # 1. Create User
    new_user_data = {
        "username": TEST_USER,
        "password": "password123",
        "full_name": f"SOP Test Teller {TIMESTAMP}",
        "role": "TELLER",
        "branch_id": 1
    }
    response = requests.post(f"{BASE_URL}/auth/users", json=new_user_data, headers=headers)
    if response.status_code == 200:
        new_user = response.json()
        new_user_id = new_user["id"]
        print(f"SUCCESS: Created pending user {new_user['username']} (ID: {new_user_id})")
        print(f"Status: {new_user['approval_status']}, Active: {new_user['is_active']}")
        
        # 2. Try login (should fail because inactive)
        print("Verifying inactive user cannot login...")
        token, _ = login(TEST_USER, "password123")
        if token:
            print("FAILED: Inactive user was allowed to login!")
        else:
            print("SUCCESS: Inactive user correctly blocked from login")
            
        # 3. Approve as Manager (Level 2)
        print("Activating user as manager...")
        # Since I updated 'manager' to OPS_MANAGER earlier
        manager_token, _ = login("manager", "admin123")
        if not manager_token: return
        
        mgr_headers = {"Authorization": f"Bearer {manager_token}"}
        approval_data = {
            "approve": True,
            "transaction_limit": 500000
        }
        resp_app = requests.put(f"{BASE_URL}/auth/users/{new_user_id}/approve", json=approval_data, headers=mgr_headers)
        if resp_app.status_code == 200:
            print(f"SUCCESS: User {new_user_id} activated with limit 500,000 FCFA")
            
            # 4. Verify login now works
            token, _ = login(TEST_USER, "password123")
            if token:
                print("SUCCESS: Activated user can now login")
                
                # 5. Testing Kill Switch (Suspend)
                print("\n--- Testing Kill Switch (Suspension) ---")
                resp_susp = requests.put(f"{BASE_URL}/auth/users/{new_user_id}", json={"is_active": False}, headers=headers)
                if resp_susp.status_code == 200:
                    print(f"SUCCESS: User {new_user_id} suspended")
                    token_after, _ = login(TEST_USER, "password123")
                    if not token_after:
                        print("SUCCESS: Suspended user correctly blocked (Kill Switch verified)")
                    else:
                        print("FAILED: Suspended user still able to login!")
            else:
                print("FAILED: User activation failed to enable login")
        else:
            print(f"FAILED: User activation failed (Status: {resp_app.status_code})")
            print(resp_app.text)
    else:
        print(f"FAILED: User creation failed (Status: {response.status_code})")
        print(response.text)

if __name__ == "__main__":
    admin_token, _ = login("admin", "admin123")
    if admin_token:
        test_role_restriction(admin_token)
        test_maker_checker(admin_token)
    else:
        print("Could not retrieve admin token, skipping tests.")
