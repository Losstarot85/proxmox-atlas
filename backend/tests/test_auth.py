"""Tests for authentication flow."""


def test_login_success(client):
    """Default admin login should return a token."""
    res = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["must_change_password"] is True


def test_login_wrong_password(client):
    """Wrong password should return 401."""
    res = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert res.status_code == 401


def test_login_wrong_username(client):
    """Non-existent username should return 401."""
    res = client.post("/auth/login", json={"username": "nobody", "password": "admin"})
    assert res.status_code == 401


def test_protected_route_without_token(client):
    """Accessing protected route without token should return 401."""
    res = client.get("/clusters")
    assert res.status_code == 401


def test_protected_route_with_token(client, auth_headers):
    """Accessing protected route with valid token should succeed."""
    res = client.get("/clusters", headers=auth_headers)
    assert res.status_code == 200


def test_protected_route_invalid_token(client):
    """Accessing protected route with garbage token should return 401."""
    res = client.get("/clusters", headers={"Authorization": "Bearer garbage.token.here"})
    assert res.status_code == 401


def test_change_password(client, auth_token):
    """Password change flow should work and new password should authenticate."""
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Change password
    res = client.post(
        "/auth/change-password", json={"old_password": "admin", "new_password": "newpass123"}, headers=headers
    )
    assert res.status_code == 200

    # Login with new password
    res = client.post("/auth/login", json={"username": "admin", "password": "newpass123"})
    assert res.status_code == 200
    assert res.json()["must_change_password"] is False

    # Old password should fail
    res = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 401


def test_change_password_wrong_old(client, auth_headers):
    """Changing password with wrong old password should fail."""
    res = client.post(
        "/auth/change-password", json={"old_password": "wrongold", "new_password": "newpass"}, headers=auth_headers
    )
    assert res.status_code == 400
