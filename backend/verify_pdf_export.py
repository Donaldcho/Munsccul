import requests
import json
import os

def test_pdf_export():
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
    
    # Call daily-cash-flow with PDF format
    url = "http://localhost:8000/api/v1/reports/daily-cash-flow?target_date=2026-02-21&format=pdf"
    print(f"Calling PDF export: {url}")
    response = requests.get(url, headers=headers)
    
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print("SUCCESS: PDF returned 200 OK")
        filename = "test_daily_cash_flow.pdf"
        with open(filename, "wb") as f:
            f.write(response.content)
        print(f"Saved PDF to {filename}")
        print(f"File size: {os.path.getsize(filename)} bytes")
    else:
        print(f"FAILURE: PDF returned {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_pdf_export()
