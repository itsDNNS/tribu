import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.support import seed_member

pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_user() -> int:
    return seed_member(
        "mobile-login@example.com", scopes=None, family_name="Mobile Family", password="Secure1Pass",
        display_name="Mobile Login", user_fields={"must_change_password": True, "has_completed_onboarding": True},
    ).family_id


def test_mobile_login_returns_bearer_token_usable_for_authenticated_routes():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "Secure1Pass"},
    )

    assert login.status_code == 200, login.json()
    data = login.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["expires_in_hours"] > 0
    assert data["refresh_expires_in_seconds"] > 0
    assert data["must_change_password"] is True
    assert "set-cookie" not in {
        key.lower(): value for key, value in login.headers.items()
    }

    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert me.status_code == 200, me.json()
    assert me.json()["email"] == "mobile-login@example.com"


def test_mobile_refresh_rotates_token_and_revokes_on_mobile_logout():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200, login.json()
    first_refresh = login.json()["refresh_token"]

    refreshed = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": first_refresh},
    )
    assert refreshed.status_code == 200, refreshed.json()
    refreshed_data = refreshed.json()
    assert refreshed_data["access_token"]
    assert refreshed_data["refresh_token"]
    assert refreshed_data["refresh_token"] != first_refresh
    assert "set-cookie" not in {
        key.lower(): value for key, value in refreshed.headers.items()
    }

    stale = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": first_refresh},
    )
    assert stale.status_code == 401

    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {refreshed_data['access_token']}"}
    )
    assert me.status_code == 200, me.json()

    logout = client.post(
        "/auth/mobile-logout",
        json={"refresh_token": refreshed_data["refresh_token"]},
    )
    assert logout.status_code == 200, logout.json()

    revoked = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": refreshed_data["refresh_token"]},
    )
    assert revoked.status_code == 401


def test_mobile_login_rejects_invalid_credentials():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "WrongPass1"},
    )

    assert login.status_code == 401
