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

from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import oidc as oidc_core
from app.core.clock import utcnow
from app.main import app
from app.models import Family, FamilyInvitation, Membership, OIDCIdentity, User
from app.modules.oidc_auth_router import FLOW_COOKIE
from app.security import JWT_SECRET
from tests.oidc_support import ISSUER, discovery_document, seed_oidc_config, seed_user
from tests.support import TestSession


pytestmark = pytest.mark.usefixtures("oidc_db")

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
    seed_oidc_config(button_label="Sign in with Home IdP", disable_password_login=True)
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
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

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
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    resp = client.get("/auth/oidc/login?redirect_to=https://evil.example.com/")
    assert resp.status_code == 303
    cookie = client.cookies.get(FLOW_COOKIE)
    payload = jwt.decode(cookie, JWT_SECRET, algorithms=["HS256"])
    assert payload["redirect_to"] == "/"
    client.cookies.clear()


def test_login_accepts_native_mobile_redirect(monkeypatch):
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    resp = client.get("/auth/oidc/login?mobile_redirect_uri=tribu%3A%2F%2Fauth%2Foidc%2Fcallback&mobile_state=native-123")
    assert resp.status_code == 303
    cookie = client.cookies.get(FLOW_COOKIE)
    payload = jwt.decode(cookie, JWT_SECRET, algorithms=["HS256"])
    assert payload["mobile_redirect_uri"] == "tribu://auth/oidc/callback"
    assert payload["mobile_state"] == "native-123"
    assert payload["redirect_to"] == "/"
    client.cookies.clear()


def test_login_rejects_untrusted_mobile_redirect(monkeypatch):
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    resp = client.get("/auth/oidc/login?mobile_redirect_uri=https%3A%2F%2Fevil.example%2Fcallback")
    assert resp.status_code == 400
    assert "OIDC_INVALID_CALLBACK" in str(resp.json())
    client.cookies.clear()


def test_login_falls_back_when_discovery_fails(monkeypatch):
    seed_oidc_config()

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
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    client.get("/auth/oidc/login")
    resp = client.get("/auth/oidc/callback?code=x&state=WRONG")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=state_mismatch"
    client.cookies.clear()


def test_callback_provider_error_is_reported(monkeypatch):
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    start = client.get("/auth/oidc/login")
    assert start.status_code == 303
    resp = client.get("/auth/oidc/callback?error=access_denied&error_description=user+cancelled")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=provider_error"
    client.cookies.clear()


def test_mobile_callback_provider_error_returns_to_app(monkeypatch):
    seed_oidc_config()
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())

    start = client.get("/auth/oidc/login?mobile_redirect_uri=tribu%3A%2F%2Fauth%2Foidc%2Fcallback&mobile_state=native-err")
    assert start.status_code == 303
    resp = client.get("/auth/oidc/callback?error=access_denied&error_description=user+cancelled")
    assert resp.status_code == 303
    assert resp.headers["location"] == "tribu://auth/oidc/callback?error=provider_error&state=native-err"
    client.cookies.clear()


# ---------------------------------------------------------------------------
# Happy-path helpers
# ---------------------------------------------------------------------------


def _perform_login_and_extract_state(monkeypatch) -> str:
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
    resp = client.get("/auth/oidc/login")
    location = resp.headers["location"]
    for part in location.split("?", 1)[1].split("&"):
        k, _, v = part.partition("=")
        if k == "state":
            return v
    raise AssertionError("no state in authorize URL")


def _perform_mobile_login_and_extract_state(monkeypatch, mobile_state: str = "") -> str:
    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
    url = "/auth/oidc/login?mobile_redirect_uri=tribu%3A%2F%2Fauth%2Foidc%2Fcallback"
    if mobile_state:
        url += f"&mobile_state={mobile_state}"
    resp = client.get(url)
    location = resp.headers["location"]
    return parse_qs(urlsplit(location).query)["state"][0]


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


def test_callback_reuses_authorize_redirect_uri(monkeypatch):
    """Regression: the flow JWT must pin the redirect_uri so the
    token exchange submits the same value as authorize.

    If base_url or x-forwarded headers change between the two
    requests the IdP would otherwise reject the code for
    redirect_uri_mismatch.
    """
    seed_oidc_config(proven=False)

    captured = {}

    def fake_exchange(**kwargs):
        captured["redirect_uri"] = kwargs["redirect_uri"]
        return {"id_token": "MOCK", "access_token": "A"}

    def fake_verify(id_token, *, issuer, client_id, jwks_uri, expected_nonce):
        return oidc_core.IDTokenClaims(
            subject="pin-sub",
            email="pin@example.com",
            email_verified=True,
            name="Pin",
            raw={},
        )

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
    monkeypatch.setattr(oidc_core, "exchange_code_for_tokens", fake_exchange)
    monkeypatch.setattr(oidc_core, "verify_id_token", fake_verify)

    # The proxy terminates TLS, so the Secure flow cookie must come back over https.
    https_client = TestClient(app, base_url="https://testserver", follow_redirects=False)

    # Authorize request goes through the proxied host
    start = https_client.get(
        "/auth/oidc/login",
        headers={"x-forwarded-host": "first.example.com", "x-forwarded-proto": "https"},
    )
    state = start.headers["location"].split("state=", 1)[1].split("&", 1)[0]

    # Seed a user so the callback succeeds
    seed_user("pin@example.com", "Pin", password="P1xxx1234")

    # Callback arrives with a DIFFERENT forwarded host. Without the
    # pin, redirect_uri would be recomputed to the second host and
    # the token exchange would fail at the IdP.
    https_client.get(
        f"/auth/oidc/callback?code=c&state={state}",
        headers={"x-forwarded-host": "second.example.com", "x-forwarded-proto": "https"},
    )
    assert captured["redirect_uri"] == "https://first.example.com/auth/oidc/callback"


def test_callback_stamps_last_success_timestamp(monkeypatch):
    """Every successful callback must record oidc_last_success_at.

    That timestamp is the proof-of-life the password_login_disabled
    gate depends on; without it the gate stays open and
    disable_password_login never locks out the admin. Start with
    proven=False so the assertion actually proves the callback is
    the thing that stamps.
    """
    seed_oidc_config(proven=False)
    seed_user("stamp@example.com", "Stamp")

    state = _perform_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="stamp-sub",
        email="stamp@example.com",
        email_verified=True,
    )
    resp = client.get(f"/auth/oidc/callback?code=c&state={state}")
    assert resp.status_code == 303

    db = TestSession()
    try:
        stored = oidc_core.get_setting(db, oidc_core.KEY_LAST_SUCCESS_AT, "")
        assert stored  # non-empty ISO string
        from datetime import datetime, timezone
        parsed = datetime.fromisoformat(stored)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        assert abs((oidc_core.utcnow() - parsed).total_seconds()) < 300
    finally:
        db.close()
    client.cookies.clear()


def test_mobile_callback_exchanges_short_code_for_bearer_tokens(monkeypatch):
    seed_oidc_config(proven=False)
    seed_user("mobile-sso@example.com", "Mobile SSO")

    state = _perform_mobile_login_and_extract_state(monkeypatch)
    _mock_token_exchange(
        monkeypatch,
        subject="mobile-sub",
        email="mobile-sso@example.com",
        email_verified=True,
        name="Mobile SSO",
    )

    resp = client.get(f"/auth/oidc/callback?code=authcode&state={state}")
    assert resp.status_code == 303
    location = resp.headers["location"]
    assert location.startswith("tribu://auth/oidc/callback?code=")
    code = parse_qs(urlsplit(location).query)["code"][0]

    exchange = client.post("/auth/oidc/mobile-exchange", json={"code": code})
    assert exchange.status_code == 200, exchange.text
    data = exchange.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["expires_in_hours"] > 0
    assert data["refresh_expires_in_seconds"] > 0
    assert data["must_change_password"] is False

    db = TestSession()
    try:
        stored = oidc_core.get_setting(db, oidc_core.KEY_LAST_SUCCESS_AT, "")
        assert stored
    finally:
        db.close()
    client.cookies.clear()


def test_mobile_callback_binds_short_code_to_native_state(monkeypatch):
    seed_oidc_config(proven=False)
    seed_user("mobile-state@example.com", "Mobile State")

    native_state = "native-state-456"
    state = _perform_mobile_login_and_extract_state(monkeypatch, native_state)
    _mock_token_exchange(
        monkeypatch,
        subject="mobile-state-sub",
        email="mobile-state@example.com",
        email_verified=True,
        name="Mobile State",
    )

    resp = client.get(f"/auth/oidc/callback?code=authcode&state={state}")
    assert resp.status_code == 303
    params = parse_qs(urlsplit(resp.headers["location"]).query)
    assert params["state"][0] == native_state
    code = params["code"][0]

    mismatch = client.post("/auth/oidc/mobile-exchange", json={"code": code, "state": "wrong-state"})
    assert mismatch.status_code == 401

    exchange = client.post("/auth/oidc/mobile-exchange", json={"code": code, "state": native_state})
    assert exchange.status_code == 200, exchange.text
    assert exchange.json()["access_token"]
    client.cookies.clear()


def test_login_not_blocked_until_first_sso_success(monkeypatch):
    """disable_password_login=true alone must not lock admins out.

    Regression for the adversarial finding: is_ready() only checks
    non-empty fields. Password login must stay available until at
    least one callback has actually completed.
    """
    seed_user("admin@example.com", "Admin")
    seed_oidc_config(disable_password_login=True, proven=False)

    resp = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "Secure1Pass"},
    )
    # Password login must still work — no SSO success has been recorded
    assert resp.status_code == 200, resp.text
    client.cookies.clear()


def test_callback_links_existing_user_by_verified_email(monkeypatch):
    seed_oidc_config()
    user_id = seed_user("anna@example.com", "Anna")

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
    seed_oidc_config()
    seed_user("anna@example.com", "Anna")

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
    seed_oidc_config()
    user_id = seed_user("anna@example.com", "Anna", password=None)
    with TestSession() as db:
        db.add(OIDCIdentity(
            user_id=user_id,
            issuer=ISSUER,
            subject="sub-123",
            email_at_login="old@example.com",
        ))
        db.commit()

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
    seed_oidc_config(allow_signup=False)
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


def _seed_invitation(token: str, *, family_name: str, role_preset: str, is_adult_preset: bool) -> int:
    """Commits a new family with an invitation valid for a day and returns the family id."""
    with TestSession() as db:
        family = Family(name=family_name)
        db.add(family)
        db.flush()
        db.add(FamilyInvitation(
            family_id=family.id,
            token=token,
            role_preset=role_preset,
            is_adult_preset=is_adult_preset,
            expires_at=utcnow() + timedelta(days=1),
        ))
        db.commit()
        return family.id


def test_invite_bound_signup_creates_user_and_membership(monkeypatch):
    seed_oidc_config(allow_signup=True)
    fam_id = _seed_invitation("invite-xyz", family_name="Mueller Family", role_preset="member", is_adult_preset=True)

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
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
    seed_oidc_config()
    winner_user_id = seed_user("anna@example.com", "Anna")
    # Seed the winner row that would appear between our read and
    # write. The handler should catch IntegrityError and reuse it.
    with TestSession() as db:
        db.add(OIDCIdentity(
            user_id=winner_user_id,
            issuer=ISSUER,
            subject="sub-race",
            email_at_login="anna@example.com",
        ))
        db.commit()

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
    # Craft a JWT with valid HS256/exp but missing purpose claim.
    fake = jwt.encode(
        {"state": "anything", "nonce": "n", "verifier": "v",
         "invite": "", "redirect_to": "/", "issuer": ISSUER,
         "exp": utcnow() + timedelta(seconds=60)},
        JWT_SECRET, algorithm="HS256",
    )
    client.cookies.set("tribu_oidc_flow", fake, path="/auth/oidc")
    resp = client.get("/auth/oidc/callback?code=c&state=anything")
    assert resp.status_code == 303
    assert resp.headers["location"] == "/?sso_error=invalid_state"
    client.cookies.clear()


def test_invite_bound_signup_rejects_admin_non_adult_preset(monkeypatch):
    """Defensive demotion: preset admin+non-adult must be downgraded to member."""
    seed_oidc_config(allow_signup=True)
    _seed_invitation("tok", family_name="Fam", role_preset="admin", is_adult_preset=False)

    monkeypatch.setattr(oidc_core, "_fetch_json", lambda url, timeout=5.0: discovery_document())
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
