import requests
import json

# Local URL (inside docker it would be http://backend:8000, outside http://localhost:8000)
BASE_URL = "http://localhost:8000/api/v1"

def test_api_member():
    # Login to get token
    login_url = f"{BASE_URL}/auth/login"
    try:
        res = requests.post(login_url, json={"username": "teller", "password": "teller123"})
        res.raise_for_status()
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get member 1
        member_url = f"{BASE_URL}/members/1"
        res = requests.get(member_url, headers=headers)
        res.raise_for_status()
        print("--- Member 1 JSON Response ---")
        print(json.dumps(res.json(), indent=2))
        
        # Get member 2
        member_url = f"{BASE_URL}/members/2"
        res = requests.get(member_url, headers=headers)
        res.raise_for_status()
        print("\n--- Member 2 JSON Response ---")
        print(json.dumps(res.json(), indent=2))
        
    except Exception as e:
        print(f"Error testing API: {e}")

if __name__ == "__main__":
    test_api_member()
