import requests
import sys

BASE_URL = "http://localhost:8000/api/v1"

def check_login(username, password):
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": username,
            "password": password
        })
        if response.status_code == 200:
            user = response.json()["user"]
            print(f"SUCCESS: {username} / {password} -> Role: {user['role']}")
            return True
        else:
            print(f"FAILED: {username} / {password} -> {response.status_code} {response.text}")
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    print("Verifying credentials...")
    check_login("admin", "admin123")
    check_login("manager", "manager123") # Trying default manager123
    check_login("manager", "admin123")   # Trying admin123 just in case
    check_login("teller", "teller123")
    check_login("credit", "credit123")
