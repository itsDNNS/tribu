"""Integration tests for PAT scope enforcement with real HTTP requests.

Uses SQLite in-memory DB, a real FastAPI TestClient, and actual PAT tokens
to prove that scope enforcement works end-to-end:
- wrong scope => 403
- correct scope => success
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.support import TestSession, add_pat, add_user, auth, seed_member

pytestmark = pytest.mark.usefixtures("app_db")


def _seed_user_with_pat(scopes: str) -> str:
    """Create a test user without a family, with a PAT. Returns the plain token string."""
    with TestSession() as db:
        token = add_pat(db, add_user(db).id, scopes)
        db.commit()
    return token


def _seed_admin_with_pat(scopes: str) -> str:
    """Create an admin user with family + membership + PAT."""
    return seed_member(scopes=scopes).token


client = TestClient(app)


# ---------------------------------------------------------------------------
# GET /nav/order — requires profile:read
# ---------------------------------------------------------------------------


class TestNavOrderScopeIntegration:
    def test_profile_read_succeeds(self):
        token = _seed_user_with_pat("profile:read")
        resp = client.get("/nav/order", headers=auth(token))
        assert resp.status_code == 200
        assert "nav_order" in resp.json()

    def test_wrong_scope_returns_403(self):
        token = _seed_user_with_pat("calendar:read")
        resp = client.get("/nav/order", headers=auth(token))
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_wildcard_succeeds(self):
        token = _seed_user_with_pat("*")
        resp = client.get("/nav/order", headers=auth(token))
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /notifications/read-all — requires profile:write
# ---------------------------------------------------------------------------


class TestNotificationsReadAllIntegration:
    def test_profile_write_succeeds(self):
        token = _seed_user_with_pat("profile:write")
        resp = client.post("/notifications/read-all", headers=auth(token))
        assert resp.status_code == 200

    def test_profile_read_returns_403(self):
        token = _seed_user_with_pat("profile:read")
        resp = client.post("/notifications/read-all", headers=auth(token))
        assert resp.status_code == 403

    def test_unrelated_scope_returns_403(self):
        token = _seed_user_with_pat("tasks:write")
        resp = client.post("/notifications/read-all", headers=auth(token))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /admin/settings/time-format — requires admin:read
# ---------------------------------------------------------------------------


class TestAdminSettingsIntegration:
    def test_admin_read_succeeds(self):
        token = _seed_admin_with_pat("admin:read")
        resp = client.get("/admin/settings/time-format", headers=auth(token))
        assert resp.status_code == 200
        assert "time_format" in resp.json()

    def test_families_read_returns_403(self):
        """families:read should NOT grant access to admin settings."""
        token = _seed_admin_with_pat("families:read")
        resp = client.get("/admin/settings/time-format", headers=auth(token))
        assert resp.status_code == 403

    def test_profile_read_returns_403(self):
        token = _seed_admin_with_pat("profile:read")
        resp = client.get("/admin/settings/time-format", headers=auth(token))
        assert resp.status_code == 403

    def test_non_admin_with_admin_scope_returns_403(self):
        """Non-admin user with admin:read PAT must be rejected (membership check)."""
        token = _seed_user_with_pat("admin:read")
        resp = client.get("/admin/settings/time-format", headers=auth(token))
        assert resp.status_code == 403
        assert "ADMIN_REQUIRED" in str(resp.json())
