import requests
import json

def test_dashboard():
    # Login as manager
    login_url = "http://localhost:8000/api/v1/auth/login"
    login_data = {"username": "testmanager", "password": "test1234"}
    
    print(f"Logging in as testmanager...")
    response = requests.post(login_url, json=login_data)
    
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Call dashboard
    dashboard_url = "http://localhost:8000/api/v1/reports/dashboard"
    print(f"Calling dashboard endpoint: {dashboard_url}")
    response = requests.get(dashboard_url, headers=headers)
    
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print("SUCCESS: Dashboard returned 200 OK")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"FAILURE: Dashboard returned {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_dashboard()
