import requests

url = "http://localhost:8000/api/v1"

# Login as admin
login_response = requests.post(f"{url}/auth/login", json={"username": "ops", "password": "ops123"})
if login_response.status_code != 200:
    print(f"Login Failed: {login_response.text}")
    exit(1)
token = login_response.json().get("access_token")

# Get Members
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(f"{url}/members", headers=headers)
print(f"Members endpoint - Status Code: {response.status_code}")
print(f"Response snippet: {response.text[:200]}")
