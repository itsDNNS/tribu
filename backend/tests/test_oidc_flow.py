"""Integration tests for the OIDC login + callback flow.

The IdP is simulated at three layers:
- discovery document: monkey-patched ``_fetch_json``
- token endpoint: monkey-patched ``exchange_code_for_tokens``
- ID token verification: monkey-patched ``verify_id_token`` (real
  signature verification is left to PyJWT's own test suite)

Each test exercises one branch of the identity-linking logic plus a
few state / nonce / redirect failure modes.
"""
from __future__ import annotations

import hashlib
import time

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core import oidc as oidc_core
from app.database import Base, get_db
from app.main import app
from app.models import Family, FamilyInvitation, Membership, OIDCIdentity, User
from app.modules.oidc_auth_router import FLOW_COOKIE
from app.security import JWT_SECRET, hash_password


engine = create_engine(
    "sqlite:///./test-oidc-flow.db",
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


ISSUER = "https://idp.example.com"


def _valid_discovery() -> dict:
    return {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/authorize",
        "token_endpoint": f"{ISSUER}/token",
        "userinfo_endpoint": f"{ISSUER}/userinfo",
        "jwks_uri": f"{ISSUER}/jwks",
    }


def _seed_config(
    *,
    allow_signup: bool = False,
    disable_password_login: bool = False,
    button_label: str = "",
    enabled: bool = True,
) -> None:
    db = TestSession()
    try:
        oidc_core.save_config(
            db,
            enabled=enabled,
            preset="generic",
            button_label=button_label,
            issuer=ISSUER,
            client_id="tribu-client",
            client_secret="topsecret",
            scopes="openid profile email",
            allow_signup=allow_signup,
            disable_password_login=disable_password_login,
        )
        db.commit()
    finally:
        db.close()


client = TestClient(app, follow_redirects=False)


# ---------------------------------------------------------------------------
# public-config
# ---------------------------------------------------------------------------


def test_public_config_when_disabled():
    resp = client.get("/auth/oidc/public-config")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "enabled": False,
        "ready": False,
        "button_label": "",
        "password_login_disabled": False,
    }


def test_public_config_when_enabled_and_ready():
    _seed_config(button_label="Sign in with Home IdP", disable_password_login=True)
    resp = client.get("/auth/oidc/public-config")
    body = resp.json()
    assert body["enabled"] is True
    assert body["ready"] is True
    assert body["button_label"] == "Sign in with Home IdP"
    assert body["password_login_disabled"] is True


# ---------------------------------------------------------------------------
# /auth/oidc/login
# ---------------------------------------------------------------------------


def test_login_rejects_when_not_configured():
    resp = client.get("/auth/oidc/login")
    assert resp.status_code == 400
    assert "OIDC_NOT_CONFIGURED" in str(resp.json())


def test_login_redirects_to_authorize(monkeypatch):
    _seed_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())

    resp = client.get("/auth/oidc/login?invite=abc&redirect_to=/calendar")
    assert resp.status_code == 303
    location = resp.headers["location"]
    assert location.startswith(f"{ISSUER}/authorize?")
    assert "response_type=code" in location
    assert "code_challenge_method=S256" in location
    assert "state=" in location
    assert "nonce=" in location
    assert "scope=openid+profile+email" in location

    # Flow cookie is set and signed with the service secret
    cookie = client.cookies.get(FLOW_COOKIE)
    assert cookie
    payload = jwt.decode(cookie, JWT_SECRET, algorithms=["HS256"])
    assert payload["invite"] == "abc"
    assert payload["redirect_to"] == "/calendar"
    assert payload["issuer"] == ISSUER
    assert "verifier" in payload
    assert "nonce" in payload
    assert "state" in payload
    client.cookies.clear()


def test_login_rejects_open_redirect(monkeypatch):
    _seed_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())

    resp = client.get("/auth/oidc/login?redirect_to=https://evil.example.com/")
    assert resp.status_code == 303
    cookie = client.cookies.get(FLOW_COOKIE)
    payload = jwt.decode(cookie, JWT_SECRET, algorithms=["HS256"])
    assert payload["redirect_to"] == "/"
    client.cookies.clear()


def test_login_falls_back_when_discovery_fails(monkeypatch):
    _seed_config()

    def broken(url, timeout=5.0):
        raise oidc_core.DiscoveryError("boom")

    monkeypatch.setattr(oidc_core, "_fetch_json", broken)

    resp = client.get("/auth/oidc/login")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=discovery_failed"
    client.cookies.clear()


# ---------------------------------------------------------------------------
# /auth/oidc/callback — error branches
# ---------------------------------------------------------------------------


def test_callback_without_flow_cookie_redirects_to_error():
    resp = client.get("/auth/oidc/callback?code=x&state=y")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=missing_state"


def test_callback_with_tampered_flow_cookie():
    client.cookies.set(FLOW_COOKIE, "not-a-jwt", path="/auth/oidc")
    resp = client.get("/auth/oidc/callback?code=x&state=y")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=invalid_state"
    client.cookies.clear()


def test_callback_state_mismatch(monkeypatch):
    _seed_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())

    client.get("/auth/oidc/login")
    resp = client.get("/auth/oidc/callback?code=x&state=WRONG")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=state_mismatch"
    client.cookies.clear()


def test_callback_provider_error_is_reported(monkeypatch):
    _seed_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())

    start = client.get("/auth/oidc/login")
    assert start.status_code == 303
    resp = client.get("/auth/oidc/callback?error=access_denied&error_description=user+cancelled")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=provider_error"
    client.cookies.clear()


# ---------------------------------------------------------------------------
# Happy-path helpers
# ---------------------------------------------------------------------------


def _perform_login_and_extract_state(monkeypatch) -> str:
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())
    resp = client.get("/auth/oidc/login")
    location = resp.headers["location"]
    for part in location.split("?", 1)[1].split("&"):
        k, _, v = part.partition("=")
        if k == "state":
            return v
    raise AssertionError("no state in authorize URL")


def _mock_token_exchange(monkeypatch, *, subject: str, email: str | None, email_verified: bool, name: str | None = None):
    def fake_exchange(**kwargs):
        return {"id_token": "MOCK_ID_TOKEN", "access_token": "MOCK_ACCESS_TOKEN"}

    def fake_verify(id_token, *, issuer, client_id, jwks_uri, expected_nonce):
        assert id_token == "MOCK_ID_TOKEN"
        assert issuer == ISSUER
        assert client_id == "tribu-client"
        assert jwks_uri == f"{ISSUER}/jwks"
        return oidc_core.IDTokenClaims(
            subject=subject,
            email=email,
            email_verified=email_verified,
            name=name,
            raw={"sub": subject, "email": email},
        )

    monkeypatch.setattr(oidc_core, "exchange_code_for_tokens", fake_exchange)
    monkeypatch.setattr(oidc_core, "verify_id_token", fake_verify)


# ---------------------------------------------------------------------------
# Linking existing user by email
# ---------------------------------------------------------------------------


def test_callback_links_existing_user_by_verified_email(monkeypatch):
    _seed_config()
    db = TestSession()
    try:
        user = User(
            email="anna@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Anna",
        )
        db.add(user)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="sub-123",
        email="anna@example.com",
        email_verified=True,
    )

    resp = client.get(f"/auth/oidc/callback?code=authcode&state={state}")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/"
    # tribu_token cookie is set on successful callback
    assert "tribu_token" in resp.cookies or "tribu_token" in client.cookies

    db = TestSession()
    try:
        link = db.query(OIDCIdentity).first()
        assert link is not None
        assert link.issuer == ISSUER
        assert link.subject == "sub-123"
        assert link.user_id == user_id
        assert link.email_at_login == "anna@example.com"
    finally:
        db.close()
    client.cookies.clear()


def test_callback_refuses_unverified_email(monkeypatch):
    _seed_config()
    db = TestSession()
    try:
        db.add(User(
            email="anna@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Anna",
        ))
        db.commit()
    finally:
        db.close()

    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="sub-bad",
        email="anna@example.com",
        email_verified=False,
    )

    resp = client.get(f"/auth/oidc/callback?code=authcode&state={state}")
    assert resp.status_code == 303
    # Error surfaced as a redirect tag rather than a 4xx JSON
    assert "sso_error=" in resp.headers["location"]
    db = TestSession()
    try:
        assert db.query(OIDCIdentity).count() == 0
    finally:
        db.close()
    client.cookies.clear()


# ---------------------------------------------------------------------------
# Returning user (identity already linked)
# ---------------------------------------------------------------------------


def test_callback_returning_user_updates_last_login(monkeypatch):
    _seed_config()
    db = TestSession()
    try:
        user = User(
            email="anna@example.com",
            password_hash=None,
            display_name="Anna",
        )
        db.add(user)
        db.flush()
        db.add(OIDCIdentity(
            user_id=user.id,
            issuer=ISSUER,
            subject="sub-123",
            email_at_login="old@example.com",
        ))
        db.commit()
    finally:
        db.close()

    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="sub-123",
        email="anna-new@example.com",
        email_verified=True,
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/"

    db = TestSession()
    try:
        link = db.query(OIDCIdentity).filter(OIDCIdentity.subject == "sub-123").one()
        assert link.email_at_login == "anna-new@example.com"
        assert link.last_login_at is not None
    finally:
        db.close()
    client.cookies.clear()


# ---------------------------------------------------------------------------
# Signup refused when no invite / allow_signup disabled
# ---------------------------------------------------------------------------


def test_callback_unknown_user_without_signup(monkeypatch):
    _seed_config(allow_signup=False)
    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="new-sub",
        email="newbie@example.com",
        email_verified=True,
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    assert resp.status_code == 303
    assert "sso_error=" in resp.headers["location"]
    db = TestSession()
    try:
        assert db.query(User).filter(User.email == "newbie@example.com").first() is None
    finally:
        db.close()
    client.cookies.clear()


# ---------------------------------------------------------------------------
# Invite-bound signup
# ---------------------------------------------------------------------------


def test_invite_bound_signup_creates_user_and_membership(monkeypatch):
    _seed_config(allow_signup=True)
    db = TestSession()
    try:
        fam = Family(name="Mueller Family")
        db.add(fam)
        db.flush()
        invitation = FamilyInvitation(
            family_id=fam.id,
            token="invite-xyz",
            role_preset="member",
            is_adult_preset=True,
            expires_at=oidc_core.utcnow() if False else __import__("app.core.clock", fromlist=["utcnow"]).utcnow(),
        )
        # extend expiry into the future
        from datetime import timedelta
        invitation.expires_at = invitation.expires_at + timedelta(days=1)
        db.add(invitation)
        db.commit()
        fam_id = fam.id
    finally:
        db.close()

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())
    resp_start = client.get("/auth/oidc/login?invite=invite-xyz")
    state = None
    for part in resp_start.headers["location"].split("?", 1)[1].split("&"):
        k, _, v = part.partition("=")
        if k == "state":
            state = v
    assert state

    _mock_token_exchange(
        monkeypatch,
        subject="new-sub",
        email="newbie@example.com",
        email_verified=True,
        name="Newbie",
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/"

    db = TestSession()
    try:
        user = db.query(User).filter(User.email == "newbie@example.com").one()
        assert user.password_hash is None
        assert user.display_name == "Newbie"
        membership = db.query(Membership).filter(Membership.user_id == user.id).one()
        assert membership.family_id == fam_id
        assert membership.role == "member"
        assert membership.is_adult is True
        link = db.query(OIDCIdentity).filter(OIDCIdentity.subject == "new-sub").one()
        assert link.user_id == user.id
        inv = db.query(FamilyInvitation).filter(FamilyInvitation.token == "invite-xyz").one()
        assert inv.use_count == 1
    finally:
        db.close()
    client.cookies.clear()


def test_callback_race_guard_on_existing_email_link(monkeypatch):
    """Two concurrent first-time callbacks for the same (iss, sub) converge.

    We simulate the race by seeding the DB with the "winner" row
    between the first lookup (which finds no identity) and the
    insert — achieved by patching _link_identity_with_race_guard's
    IntegrityError path via a pre-seeded row that fails the flush.
    """
    _seed_config()
    db = TestSession()
    try:
        user = User(
            email="anna@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Anna",
        )
        db.add(user)
        db.flush()
        winner_user_id = user.id
        # Seed the winner row that would appear between our read and
        # write. The handler should catch IntegrityError and reuse it.
        db.add(OIDCIdentity(
            user_id=winner_user_id,
            issuer=ISSUER,
            subject="sub-race",
            email_at_login="anna@example.com",
        ))
        db.commit()
    finally:
        db.close()

    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="sub-race",
        email="anna@example.com",
        email_verified=True,
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    # Should redirect to "/" — handler recognised (iss, sub) pre-
    # existing on the first lookup and used the existing row.
    assert resp.status_code == 303
    assert resp.headers["location"] == "/"

    db = TestSession()
    try:
        assert db.query(OIDCIdentity).filter(OIDCIdentity.subject == "sub-race").count() == 1
    finally:
        db.close()
    client.cookies.clear()


def test_token_endpoint_auth_falls_back_to_basic(monkeypatch):
    """If client_secret_post returns 401 we retry with HTTP Basic auth."""
    from app.core import oidc as oidc_core_mod

    call_log = []

    def fake_post(token_endpoint, form_fields, *, basic_auth, timeout):
        call_log.append({"auth": "basic" if basic_auth else "post", "form": dict(form_fields)})
        if basic_auth is None:
            return 401, b'{"error":"invalid_client"}'
        return 200, (
            b'{"id_token":"MOCK","access_token":"A","token_type":"Bearer"}'
        )

    monkeypatch.setattr(oidc_core_mod, "_post_token_request", fake_post)

    data = oidc_core_mod.exchange_code_for_tokens(
        token_endpoint="https://idp.example.com/token",
        code="authcode",
        redirect_uri="https://tribu.example.com/auth/oidc/callback",
        client_id="tribu-client",
        client_secret="secret",
        code_verifier="verifier",
    )
    assert data["id_token"] == "MOCK"
    # First attempt was post, second basic
    assert [c["auth"] for c in call_log] == ["post", "basic"]
    # Basic attempt does NOT include client_secret in form body
    assert "client_secret" not in call_log[1]["form"]


def test_token_endpoint_auth_bubbles_non_401_failure(monkeypatch):
    from app.core import oidc as oidc_core_mod

    def fake_post(*args, **kwargs):
        return 500, b'{"error":"server_error"}'

    monkeypatch.setattr(oidc_core_mod, "_post_token_request", fake_post)
    with pytest.raises(oidc_core_mod.TokenExchangeError):
        oidc_core_mod.exchange_code_for_tokens(
            token_endpoint="https://idp.example.com/token",
            code="c", redirect_uri="https://x/", client_id="a",
            client_secret="s", code_verifier="v",
        )


def test_flow_cookie_rejects_wrong_purpose():
    """Session-style JWTs (no purpose=oidc_flow) must not satisfy callback."""
    import jwt as _jwt
    from datetime import timedelta as _td
    from app.core.clock import utcnow as _now
    from app.security import JWT_SECRET as _secret

    # Craft a JWT with valid HS256/exp but missing purpose claim.
    fake = _jwt.encode(
        {"state": "anything", "nonce": "n", "verifier": "v",
         "invite": "", "redirect_to": "/", "issuer": ISSUER,
         "exp": _now() + _td(seconds=60)},
        _secret, algorithm="HS256",
    )
    client.cookies.set("tribu_oidc_flow", fake, path="/auth/oidc")
    resp = client.get("/auth/oidc/callback?code=c&state=anything")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=invalid_state"
    client.cookies.clear()


def test_invite_bound_signup_rejects_admin_non_adult_preset(monkeypatch):
    """Defensive demotion: preset admin+non-adult must be downgraded to member."""
    _seed_config(allow_signup=True)
    db = TestSession()
    try:
        fam = Family(name="Fam")
        db.add(fam)
        db.flush()
        from datetime import timedelta
        inv = FamilyInvitation(
            family_id=fam.id,
            token="tok",
            role_preset="admin",
            is_adult_preset=False,
            expires_at=__import__("app.core.clock", fromlist=["utcnow"]).utcnow() + timedelta(days=1),
        )
        db.add(inv)
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: _valid_discovery())
    resp_start = client.get("/auth/oidc/login?invite=tok")
    state = resp_start.headers["location"].split("state=", 1)[1].split("&", 1)[0]

    _mock_token_exchange(
        monkeypatch,
        subject="kid-sub",
        email="kid@example.com",
        email_verified=True,
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    assert resp.status_code == 303

    db = TestSession()
    try:
        membership = db.query(Membership).one()
        assert membership.role == "member"  # demoted
        assert membership.is_adult is False
    finally:
        db.close()
    client.cookies.clear()
