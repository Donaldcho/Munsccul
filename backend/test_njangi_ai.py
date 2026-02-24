import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_njangi_ai():
    # 1. Get Access Token (assuming admin/admin)
    login_data = {"username": "admin", "password": "admin_secure_password"}
    login_res = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    if login_res.status_code != 200:
        print("Login failed")
        return
    
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test Loan Readiness
    readiness_res = requests.get(f"{BASE_URL}/njangi/readiness/1", headers=headers)
    print(f"Readiness Status: {readiness_res.status_code}")
    print(f"Readiness Body: {json.dumps(readiness_res.json(), indent=2)}")

    # 3. Test Group Insights
    insights_res = requests.get(f"{BASE_URL}/njangi/insights/1", headers=headers)
    print(f"Insights Status: {insights_res.status_code}")
    print(f"Insights Body: {json.dumps(insights_res.json(), indent=2)}")

if __name__ == "__main__":
    test_njangi_ai()
