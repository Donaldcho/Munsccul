import urllib.request
import urllib.parse
import json

url = "http://localhost:8000/api/v1"

# Login
data = urllib.parse.urlencode({"username": "ops", "password": "ops"}).encode()
req = urllib.request.Request(f"{url}/auth/login", data=data)
req.add_header("Content-Type", "application/x-www-form-urlencoded")

with urllib.request.urlopen(req) as response:
    login_response = json.loads(response.read().decode())

token = login_response.get("access_token")

# Get accounts
req2 = urllib.request.Request(f"{url}/accounts?limit=100")
req2.add_header("Authorization", f"Bearer {token}")

try:
    with urllib.request.urlopen(req2) as response2:
        print(f"Status: {response2.status}")
        print(response2.read().decode())
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode())
