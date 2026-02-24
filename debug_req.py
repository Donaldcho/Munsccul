import requests
import json

base_url = "http://localhost:8000/api/v1"

def debug():
    # 1. Login
    print("Logging in...")
    login_resp = requests.post(f"{base_url}/auth/login", data={
        "username": "manager",
        "password": "manager123"
    })
    
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.status_code}")
        print(login_resp.text)
        return
        
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Fetch Liquidity Stats
    print("Fetching liquidity stats...")
    resp = requests.get(f"{base_url}/branches/1/stats/liquidity", headers=headers)
    print(f"Status: {resp.status_code}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except:
        print(resp.text)

if __name__ == "__main__":
    debug()
