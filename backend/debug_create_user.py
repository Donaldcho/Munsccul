import httpx
import asyncio
import secrets

BASE_URL = "http://localhost:8000/api/v1"

async def test_create_user_empty_email():
    async with httpx.AsyncClient() as client:
        # 1. Login
        print("Logging in...")
        try:
            resp = await client.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "digital2026"
            })
            if resp.status_code != 200:
                print(f"Login failed: {resp.status_code} {resp.text}")
                return
            
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            print("Login successful.")
        except Exception as e:
            print(f"Login exception: {e}")
            return

        # 2. Create User with empty email
        username = f"testuser_{secrets.token_hex(4)}"
        print(f"\nCreating user {username} with empty email...")
        payload = {
            "username": username,
            "full_name": "Test User",
            "email": "",  # Empty string - should be converted to None
            "password": "password123",
            "role": "TELLER",
            "branch_id": 1, 
            "is_active": True
        }
        
        resp = await client.post(f"{BASE_URL}/auth/users", json=payload, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            user = resp.json()
            print(f"User created successfully. ID: {user['id']}")
            print(f"Email returned: '{user.get('email')}'")
            if user.get('email') is None:
                 print("SUCCESS: Email is None")
            else:
                 print(f"WARNING: Email is '{user.get('email')}'")
        else:
            print(f"FAILED: {resp.text}")

if __name__ == "__main__":
    asyncio.run(test_create_user_empty_email())
