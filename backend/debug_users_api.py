import httpx
import asyncio
import json

BASE_URL = "http://localhost:8000/api/v1"

async def test_users_endpoint():
    async with httpx.AsyncClient() as client:
        # 1. Login
        print("Logging in...")
        try:
            resp = await client.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
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

        # 2. Call /users (Normal)
        print("\nCalling /auth/users (No params)...")
        resp = await client.get(f"{BASE_URL}/auth/users", headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Response: {resp.text}")

        # 3. Call /users with _t param
        print("\nCalling /auth/users?_t=123 (Timestamp param)...")
        resp = await client.get(f"{BASE_URL}/auth/users", params={"_t": 123}, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Response: {resp.text}")
            
        # 4. Call /users with invalid param type (e.g. skip=string)
        print("\nCalling /auth/users?skip=invalid (Invalid param)...")
        resp = await client.get(f"{BASE_URL}/auth/users", params={"skip": "invalid"}, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Response: {resp.text}")

if __name__ == "__main__":
    asyncio.run(test_users_endpoint())
