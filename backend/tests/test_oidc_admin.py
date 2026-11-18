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

import pytest
from fastapi.testclient import TestClient

from app.core import oidc as oidc_core
from app.main import app
from tests.oidc_support import discovery_document, seed_oidc_config, seed_user
from tests.support import TestSession, add_pat, auth, seed_member


pytestmark = pytest.mark.usefixtures("oidc_db")


def _seed_admin(scopes: str = "*") -> str:
    return seed_member(scopes=scopes, family_name="Fam", display_name="Admin").token


def _seed_second_family_admin(scopes: str = "*") -> str:
    return seed_member(scopes=scopes, family_name="Second Fam", display_name="Second Admin").token


def _seed_non_admin(scopes: str = "admin:read,admin:write") -> str:
    """A user with an admin-scoped PAT but no family at all."""
    user_id = seed_user(f"nonadmin-{scopes}@example.com", "Member")
    with TestSession() as db:
        token = add_pat(db, user_id, scopes)
        db.commit()
    return token


client = TestClient(app)


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------


def test_presets_listed_for_admin():
    token = _seed_admin()
    resp = client.get("/admin/oidc/presets", headers=auth(token))
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert {"generic", "authentik", "zitadel", "keycloak"}.issubset(ids)


def test_presets_requires_admin_membership():
    token = _seed_non_admin()
    resp = client.get("/admin/oidc/presets", headers=auth(token))
    assert resp.status_code == 403


def test_oidc_admin_rejects_second_family_admin():
    _seed_admin()
    token = _seed_second_family_admin()

    resp = client.get("/admin/oidc", headers=auth(token))

    assert resp.status_code == 403


def test_presets_requires_auth():
    resp = client.get("/admin/oidc/presets")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /admin/oidc
# ---------------------------------------------------------------------------


def test_get_config_defaults():
    token = _seed_admin()
    resp = client.get("/admin/oidc", headers=auth(token))
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
    resp = client.get("/admin/oidc", headers=auth(token))
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
            **auth(token),
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
    resp = client.get("/admin/oidc", headers=auth(token))
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /admin/oidc
# ---------------------------------------------------------------------------


def test_put_config_partial_update():
    token = _seed_admin()
    # Initial save
    resp = client.put(
        "/admin/oidc",
        headers=auth(token),
        json={
            "enabled": True,
            "preset": "authentik",
            "issuer": "https://auth.example.com/application/o/tribu/",
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
        headers=auth(token),
        json={"button_label": "Sign in with home IdP"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["button_label"] == "Sign in with home IdP"
    assert body["client_secret_set"] is True
    assert body["issuer"] == "https://auth.example.com/application/o/tribu/"


def test_put_clears_secret_on_empty_string():
    token = _seed_admin()
    client.put(
        "/admin/oidc",
        headers=auth(token),
        json={
            "enabled": True, "preset": "generic",
            "issuer": "https://idp.example.com", "client_id": "tribu",
            "client_secret": "seed", "scopes": "openid profile email",
        },
    )
    resp = client.put(
        "/admin/oidc",
        headers=auth(token),
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
        headers=auth(token),
        json={"preset": "bogus"},
    )
    assert resp.status_code == 400
    assert "OIDC_INVALID_PRESET" in str(resp.json())


def test_put_rejects_scopes_missing_openid():
    token = _seed_admin()
    resp = client.put(
        "/admin/oidc",
        headers=auth(token),
        json={"scopes": "profile email"},
    )
    assert resp.status_code == 422


def test_put_requires_admin_scope():
    token = _seed_admin("families:write")
    resp = client.put(
        "/admin/oidc",
        headers=auth(token),
        json={"enabled": True},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /admin/oidc/test
# ---------------------------------------------------------------------------


def test_discovery_probe_success(monkeypatch):
    token = _seed_admin()

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
    resp = client.post(
        "/admin/oidc/test",
        headers=auth(token),
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
        headers=auth(token),
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
        headers=auth(token),
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
        headers=auth(token),
        json={"issuer": "file:///etc/passwd"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "http" in body["error"].lower()


# ---------------------------------------------------------------------------
# Password-login gate applied to /auth/*
# ---------------------------------------------------------------------------


def test_login_blocked_when_password_login_disabled():
    seed_user("existing@example.com", "Existing")
    seed_oidc_config(disable_password_login=True)

    resp = client.post(
        "/auth/login",
        json={"email": "existing@example.com", "password": "Secure1Pass"},
    )
    assert resp.status_code == 403
    assert "PASSWORD_LOGIN_DISABLED" in str(resp.json())


def test_register_blocked_when_password_login_disabled():
    seed_oidc_config(disable_password_login=True)
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
    seed_user("existing2@example.com", "Existing")

    # Flag on but no issuer/client => not ready => flag ignored
    seed_oidc_config(issuer="", client_id="", client_secret="", disable_password_login=True, proven=False)

    resp = client.post(
        "/auth/login",
        json={"email": "existing2@example.com", "password": "Secure1Pass"},
    )
    assert resp.status_code == 200
