"""Integration tests for PAT scope enforcement with real HTTP requests.

Uses SQLite in-memory DB, a real FastAPI TestClient, and actual PAT tokens
to prove that scope enforcement works end-to-end:
- wrong scope => 403
- correct scope => success
"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


# ---------------------------------------------------------------------------
# SQLite test DB setup (shared connection for in-memory DB)
# ---------------------------------------------------------------------------

engine = create_engine(
    "sqlite:///./test-scope-integration.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _seed_user_with_pat(scopes: str) -> str:
    """Create a test user with PAT. Returns the plain token string."""
    db = TestSession()
    user = User(
        email=f"test-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Test User",
    )
    db.add(user)
    db.flush()

    plain_token = f"{PAT_PREFIX}tok-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    pat = PersonalAccessToken(
        user_id=user.id,
        name="test-pat",
        token_hash=token_hash,
        scopes=scopes,
    )
    db.add(pat)
    db.commit()
    db.close()
    return plain_token


def _seed_admin_with_pat(scopes: str) -> str:
    """Create an admin user with family + membership + PAT."""
    db = TestSession()
    user = User(
        email=f"admin-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Admin User",
    )
    db.add(user)
    db.flush()

    family = Family(name="Test Family")
    db.add(family)
    db.flush()

    membership = Membership(
        user_id=user.id,
        family_id=family.id,
        role="admin",
        is_adult=True,
    )
    db.add(membership)
    db.flush()

    plain_token = f"{PAT_PREFIX}admtok-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    pat = PersonalAccessToken(
        user_id=user.id,
        name="admin-pat",
        token_hash=token_hash,
        scopes=scopes,
    )
    db.add(pat)
    db.commit()
    db.close()
    return plain_token


client = TestClient(app)


# ---------------------------------------------------------------------------
# GET /nav/order — requires profile:read
# ---------------------------------------------------------------------------


class TestNavOrderScopeIntegration:
    def test_profile_read_succeeds(self):
        token = _seed_user_with_pat("profile:read")
        resp = client.get("/nav/order", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert "nav_order" in resp.json()

    def test_wrong_scope_returns_403(self):
        token = _seed_user_with_pat("calendar:read")
        resp = client.get("/nav/order", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_wildcard_succeeds(self):
        token = _seed_user_with_pat("*")
        resp = client.get("/nav/order", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /notifications/read-all — requires profile:write
# ---------------------------------------------------------------------------


class TestNotificationsReadAllIntegration:
    def test_profile_write_succeeds(self):
        token = _seed_user_with_pat("profile:write")
        resp = client.post("/notifications/read-all", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_profile_read_returns_403(self):
        token = _seed_user_with_pat("profile:read")
        resp = client.post("/notifications/read-all", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_unrelated_scope_returns_403(self):
        token = _seed_user_with_pat("tasks:write")
        resp = client.post("/notifications/read-all", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /admin/settings/time-format — requires admin:read
# ---------------------------------------------------------------------------


class TestAdminSettingsIntegration:
    def test_admin_read_succeeds(self):
        token = _seed_admin_with_pat("admin:read")
        resp = client.get("/admin/settings/time-format", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert "time_format" in resp.json()

    def test_families_read_returns_403(self):
        """families:read should NOT grant access to admin settings."""
        token = _seed_admin_with_pat("families:read")
        resp = client.get("/admin/settings/time-format", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_profile_read_returns_403(self):
        token = _seed_admin_with_pat("profile:read")
        resp = client.get("/admin/settings/time-format", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_non_admin_with_admin_scope_returns_403(self):
        """Non-admin user with admin:read PAT must be rejected (membership check)."""
        token = _seed_user_with_pat("admin:read")
        resp = client.get("/admin/settings/time-format", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert "ADMIN_REQUIRED" in str(resp.json())
