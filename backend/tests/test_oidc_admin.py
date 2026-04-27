"""Integration tests for the OIDC admin endpoints.

Covers:
- GET /admin/oidc/presets returns the full catalog
- GET /admin/oidc returns defaults then reflects saved values
- PUT /admin/oidc partial update, secret passthrough, empty-string clears,
  invalid preset rejected, ``scopes`` validator enforces ``openid``
- POST /admin/oidc/test surfaces discovery errors + success payload
- Non-admin PATs cannot reach any of these endpoints
"""
from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core import oidc as oidc_core
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-oidc-admin.db",
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
    oidc_core.invalidate_discovery_cache()


def _seed_admin(scopes: str = "*") -> str:
    db = TestSession()
    user = User(
        email=f"admin-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Admin",
    )
    db.add(user)
    db.flush()
    family = Family(name="Fam")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))

    plain = f"{PAT_PREFIX}admintok-{scopes.replace(':', '_').replace('*', 'star')}"
    digest = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id, name="admin", token_hash=digest, token_lookup=digest,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain


def _seed_second_family_admin(scopes: str = "*") -> str:
    db = TestSession()
    user = User(
        email=f"second-admin-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Second Admin",
    )
    db.add(user)
    db.flush()
    family = Family(name="Second Fam")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))

    plain = f"{PAT_PREFIX}secondadmintok-{scopes.replace(':', '_').replace('*', 'star')}"
    digest = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id, name="second-admin", token_hash=digest, token_lookup=digest,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain


def _seed_non_admin(scopes: str = "admin:read,admin:write") -> str:
    db = TestSession()
    user = User(
        email=f"nonadmin-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Member",
    )
    db.add(user)
    db.flush()
    plain = f"{PAT_PREFIX}nonadmin-{scopes.replace(':', '_').replace(',', '-')}"
    digest = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id, name="n", token_hash=digest, token_lookup=digest,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain


client = TestClient(app)


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------


def test_presets_listed_for_admin():
    token = _seed_admin()
    resp = client.get("/admin/oidc/presets", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert {"generic", "authentik", "zitadel", "keycloak"}.issubset(ids)


def test_presets_requires_admin_membership():
    token = _seed_non_admin()
    resp = client.get("/admin/oidc/presets", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_oidc_admin_rejects_second_family_admin():
    _seed_admin()
    token = _seed_second_family_admin()

    resp = client.get("/admin/oidc", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 403


def test_presets_requires_auth():
    resp = client.get("/admin/oidc/presets")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /admin/oidc
# ---------------------------------------------------------------------------


def test_get_config_defaults():
    token = _seed_admin()
    resp = client.get("/admin/oidc", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["preset"] == "generic"
    assert body["client_secret_set"] is False
    assert body["ready"] is False
    # Effective callback URL always populated, derived from the
    # request host (TestClient uses http://testserver by default).
    assert body["effective_callback_url"].endswith("/auth/oidc/callback")


def test_effective_callback_url_honours_base_url_env(monkeypatch):
    """BASE_URL env overrides request-based derivation so admins
    behind a reverse proxy see the real external URL, not the
    internal request host."""
    token = _seed_admin()
    monkeypatch.setenv("BASE_URL", "https://tribu.example.com")
    resp = client.get("/admin/oidc", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["effective_callback_url"] == (
        "https://tribu.example.com/auth/oidc/callback"
    )


def test_effective_callback_url_honours_forwarded_headers():
    """x-forwarded-host + x-forwarded-proto win over the direct
    request headers when no BASE_URL is set, matching how
    resolve_base_url is used elsewhere."""
    token = _seed_admin()
    resp = client.get(
        "/admin/oidc",
        headers={
            "Authorization": f"Bearer {token}",
            "x-forwarded-host": "tribu.example.com",
            "x-forwarded-proto": "https",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["effective_callback_url"] == (
        "https://tribu.example.com/auth/oidc/callback"
    )


def test_get_config_requires_admin_scope():
    token = _seed_admin("families:read")
    resp = client.get("/admin/oidc", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /admin/oidc
# ---------------------------------------------------------------------------


def test_put_config_partial_update():
    token = _seed_admin()
    # Initial save
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "enabled": True,
            "preset": "authentik",
            "issuer": "https://auth.example.com/application/o/tribu",
            "client_id": "tribu",
            "client_secret": "s3cr3t",
            "scopes": "openid profile email",
            "allow_signup": True,
            "disable_password_login": False,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is True
    assert body["preset"] == "authentik"
    assert body["client_secret_set"] is True
    assert body["ready"] is True
    # Secret value itself never leaks
    assert "client_secret" not in body

    # Partial update: change button label only, secret preserved
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={"button_label": "Sign in with home IdP"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["button_label"] == "Sign in with home IdP"
    assert body["client_secret_set"] is True
    assert body["issuer"] == "https://auth.example.com/application/o/tribu"


def test_put_clears_secret_on_empty_string():
    token = _seed_admin()
    client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "enabled": True, "preset": "generic",
            "issuer": "https://idp.example.com", "client_id": "tribu",
            "client_secret": "seed", "scopes": "openid profile email",
        },
    )
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={"client_secret": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_secret_set"] is False
    assert body["ready"] is False


def test_put_rejects_unknown_preset():
    token = _seed_admin()
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={"preset": "bogus"},
    )
    assert resp.status_code == 400
    assert "OIDC_INVALID_PRESET" in str(resp.json())


def test_put_rejects_scopes_missing_openid():
    token = _seed_admin()
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={"scopes": "profile email"},
    )
    assert resp.status_code == 422


def test_put_requires_admin_scope():
    token = _seed_admin("families:write")
    resp = client.put(
        "/admin/oidc",
        headers={"Authorization": f"Bearer {token}"},
        json={"enabled": True},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /admin/oidc/test
# ---------------------------------------------------------------------------


def test_discovery_probe_success(monkeypatch):
    token = _seed_admin()

    def fake_fetch(url, timeout=5.0):
        return {
            "issuer": "https://idp.example.com",
            "authorization_endpoint": "https://idp.example.com/authorize",
            "token_endpoint": "https://idp.example.com/token",
            "userinfo_endpoint": "https://idp.example.com/userinfo",
            "jwks_uri": "https://idp.example.com/jwks",
        }

    monkeypatch.setattr(oidc_core, "_fetch_json", fake_fetch)
    resp = client.post(
        "/admin/oidc/test",
        headers={"Authorization": f"Bearer {token}"},
        json={"issuer": "https://idp.example.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["authorization_endpoint"].endswith("/authorize")
    assert body["token_endpoint"].endswith("/token")
    assert body["jwks_uri"].endswith("/jwks")


def test_discovery_probe_surfaces_error(monkeypatch):
    token = _seed_admin()

    def fake_fetch(url, timeout=5.0):
        raise oidc_core.DiscoveryError("unreachable")

    monkeypatch.setattr(oidc_core, "_fetch_json", fake_fetch)
    resp = client.post(
        "/admin/oidc/test",
        headers={"Authorization": f"Bearer {token}"},
        json={"issuer": "https://idp.example.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "unreachable" in body["error"]


def test_discovery_probe_empty_issuer():
    token = _seed_admin()
    resp = client.post(
        "/admin/oidc/test",
        headers={"Authorization": f"Bearer {token}"},
        json={"issuer": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "empty" in body["error"].lower()


def test_discovery_probe_rejects_file_scheme():
    """SSRF: admin probe must not dereference file:// URLs."""
    token = _seed_admin()
    resp = client.post(
        "/admin/oidc/test",
        headers={"Authorization": f"Bearer {token}"},
        json={"issuer": "file:///etc/passwd"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "http" in body["error"].lower()


# ---------------------------------------------------------------------------
# Password-login gate applied to /auth/*
# ---------------------------------------------------------------------------


def _enable_oidc_ready(disable_password: bool, *, proven: bool = True) -> None:
    """Seed a ready OIDC config directly via the DB, bypassing admin API.

    ``proven=True`` also stamps ``oidc_last_success_at`` so the
    password-login gate honors ``disable_password_login``. Set it to
    False when the test wants to cover the "admin flipped the flag
    before SSO ever worked" edge case.
    """
    db = TestSession()
    try:
        oidc_core.save_config(
            db,
            enabled=True,
            preset="generic",
            button_label="",
            issuer="https://idp.example.com",
            client_id="tribu",
            client_secret="seed",
            scopes="openid profile email",
            allow_signup=False,
            disable_password_login=disable_password,
        )
        if proven:
            oidc_core.record_successful_sso_login(db)
        db.commit()
    finally:
        db.close()


def test_login_blocked_when_password_login_disabled():
    db = TestSession()
    try:
        user = User(
            email="existing@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Existing",
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    _enable_oidc_ready(disable_password=True)

    resp = client.post(
        "/auth/login",
        json={"email": "existing@example.com", "password": "Secure1Pass"},
    )
    assert resp.status_code == 403
    assert "PASSWORD_LOGIN_DISABLED" in str(resp.json())


def test_register_blocked_when_password_login_disabled():
    _enable_oidc_ready(disable_password=True)
    resp = client.post(
        "/auth/register",
        json={
            "email": "new@example.com",
            "password": "Secure1Pass",
            "display_name": "New",
            "family_name": "Fam",
        },
    )
    assert resp.status_code == 403
    assert "PASSWORD_LOGIN_DISABLED" in str(resp.json())


def test_login_still_works_when_oidc_not_ready():
    """Setting disable_password_login alone must not lock users out."""
    db = TestSession()
    try:
        user = User(
            email="existing2@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Existing",
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    # Flag on but no issuer/client => not ready => flag ignored
    db = TestSession()
    try:
        oidc_core.save_config(
            db,
            enabled=True, preset="generic", button_label="",
            issuer="", client_id="", client_secret="",
            scopes="openid profile email",
            allow_signup=False, disable_password_login=True,
        )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        "/auth/login",
        json={"email": "existing2@example.com", "password": "Secure1Pass"},
    )
    assert resp.status_code == 200
