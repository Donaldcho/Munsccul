import pytest
from fastapi import status
from app import models
from app.security.jwt_auth import hash_password

def test_login_success(client, db_session, test_password, test_branch):
    """Test successful login with valid credentials."""
    # Setup test user
    username = "auth_test_user"
    user = models.User(
        username=username,
        full_name="Auth Test",
        hashed_password=hash_password(test_password),
        role=models.UserRole.TELLER,
        branch_id=test_branch.id,
        is_active=True,
        approval_status=models.UserApprovalStatus.APPROVED
    )
    db_session.add(user)
    db_session.commit()

    # Enhanced auth login expects JSON
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": test_password}
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "refresh_token" in data

def test_login_invalid_password(client, admin_user, test_password):
    """Test login failure with incorrect password."""
    response = client.post(
        "/api/v1/auth/login",
        json={"username": admin_user.username, "password": "wrongpassword"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_access_protected_route_success(client, auth_headers):
    """Test access to a protected route with valid JWT."""
    response = client.get("/api/v1/system/info", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK
    assert "security" in response.json()

def test_access_protected_route_unauthorized(client):
    """Test access to a protected route without authentication."""
    response = client.get("/api/v1/members")
    # In some FastAPI/Security configs, missing token returns 403 instead of 401
    assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

def test_rbac_admin_only_success(client, auth_headers):
    """Test RBAC: Admin can access admin-only route."""
    # /api/v1/branches requires admin access
    response = client.get("/api/v1/branches", headers=auth_headers)
    assert response.status_code == status.HTTP_200_OK

def test_rbac_forbidden_for_teller(client, teller_headers):
    """Test RBAC: Teller cannot access admin-only route."""
    # POST /api/v1/auth/users requires admin role
    response = client.post("/api/v1/auth/users", json={}, headers=teller_headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN
