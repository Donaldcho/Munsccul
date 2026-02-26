from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Account, Member
import requests

# Local URL (inside docker it would be http://backend:8000, outside http://localhost:8000)
BASE_URL = "http://localhost:8000/api/v1"

def test_new_endpoint():
    # Login to get token
    login_url = f"{BASE_URL}/auth/login"
    try:
        # Use credentials from init.sql (teller / teller123)
        # Note: If this fails, it might be due to incorrect password or server down
        res = requests.post(login_url, json={"username": "teller", "password": "teller123"})
        if res.status_code != 200:
            print(f"Login failed: {res.text}")
            return
            
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test by-account endpoint for account ID 1
        url = f"{BASE_URL}/members/by-account/1"
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            print(f"Successfully fetched member for account 1: {res.json()['first_name']} {res.json()['last_name']}")
        else:
            print(f"Failed to fetch member for account 1: {res.status_code} {res.text}")

        # Test by-account endpoint for account ID 2
        url = f"{BASE_URL}/members/by-account/2"
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            print(f"Successfully fetched member for account 2: {res.json()['first_name']} {res.json()['last_name']}")
        else:
            print(f"Failed to fetch member for account 2: {res.status_code} {res.text}")
            
    except Exception as e:
        print(f"Error testing new endpoint: {e}")

if __name__ == "__main__":
    test_new_endpoint()
