import base64

import pytest

from app import reset_mfa as reset_mfa_cli
from app.core import mfa
from app.core.config import COOKIE_NAME
from app.models import AuditLog, Membership, MfaRecoveryCode, User
from app.modules.mfa_router import limiter as mfa_limiter
from tests.support import ADMIN_EMAIL, MEMBER_EMAIL, PASSWORD, TestSession, login, new_client, seed_family


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


def _code(secret: str, offset: int = 0) -> str:
    return mfa.totp_code(secret, mfa.current_step() + offset)


def _allow_code_reuse(email: str) -> None:
    """Forget the last accepted step so a test can sign in again within 30 seconds."""
    db = TestSession()
    try:
        db.query(User).filter(User.email == email).update({User.totp_last_step: None})
        db.commit()
    finally:
        db.close()


def _enable_mfa(email: str) -> tuple[str, list[str]]:
    client = new_client()
    assert login(client, email).json()["status"] == "ok"
    setup = client.post("/auth/me/mfa/setup", json={"password": PASSWORD})
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    confirm = client.post("/auth/me/mfa/confirm", json={"setup_token": setup.json()["setup_token"], "code": _code(secret)})
    assert confirm.status_code == 200
    _allow_code_reuse(email)
    return secret, confirm.json()["recovery_codes"]


# ---------------------------------------------------------------------------
# TOTP primitives
# ---------------------------------------------------------------------------

def test_totp_matches_rfc6238_sha1_vectors():
    secret = base64.b32encode(b"12345678901234567890").decode()
    # RFC 6238 appendix B, last six digits of the 8-digit SHA-1 values.
    assert mfa.totp_code(secret, 59 // 30) == "287082"
    assert mfa.totp_code(secret, 1111111109 // 30) == "081804"
    assert mfa.totp_code(secret, 1234567890 // 30) == "005924"


def test_matching_step_allows_drift_and_refuses_replay():
    secret = mfa.generate_totp_secret()
    now = 1_700_000_000.0
    step = mfa.current_step(now)
    assert mfa.matching_step(secret, mfa.totp_code(secret, step - 1), now=now) == step - 1
    assert mfa.matching_step(secret, mfa.totp_code(secret, step + 2), now=now) is None
    assert mfa.matching_step(secret, mfa.totp_code(secret, step), after_step=step, now=now) is None
    assert mfa.matching_step(secret, "12a456", now=now) is None


def test_otpauth_uri_names_issuer_and_account():
    uri = mfa.otpauth_uri("ABC", "anna@example.com")
    assert uri.startswith("otpauth://totp/Tribu%3Aanna%40example.com?")
    assert "secret=ABC" in uri and "issuer=Tribu" in uri


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

def test_setup_requires_password_and_a_valid_first_code():
    seed_family()
    client = new_client()
    login(client, MEMBER_EMAIL)

    assert client.post("/auth/me/mfa/setup", json={"password": "Wrong1Pass"}).json()["detail"]["code"] == "PASSWORD_INCORRECT"

    setup = client.post("/auth/me/mfa/setup", json={"password": PASSWORD}).json()
    wrong = client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": "000000" if _code(setup["secret"]) != "000000" else "111111"})
    assert wrong.status_code == 400
    assert client.get("/auth/me/mfa").json()["enabled"] is False

    confirm = client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": _code(setup["secret"])})
    codes = confirm.json()["recovery_codes"]
    assert len(codes) == mfa.RECOVERY_CODE_COUNT
    assert len(set(codes)) == mfa.RECOVERY_CODE_COUNT
    assert client.get("/auth/me/mfa").json() == {"enabled": True, "available": True, "recovery_codes_remaining": 10, "required": False}

    db = TestSession()
    try:
        stored = {row.code_lookup for row in db.query(MfaRecoveryCode).all()}
    finally:
        db.close()
    assert not stored & set(codes), "recovery codes must not be stored in plain text"


def test_setup_token_of_another_user_is_refused():
    seed_family()
    admin_client, member_client = new_client(), new_client()
    login(admin_client, ADMIN_EMAIL)
    login(member_client, MEMBER_EMAIL)
    setup = admin_client.post("/auth/me/mfa/setup", json={"password": PASSWORD}).json()

    stolen = member_client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": _code(setup["secret"])})

    assert stolen.json()["detail"]["code"] == "MFA_SETUP_EXPIRED"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_web_login_asks_for_code_and_sets_no_session_before_it():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = new_client()

    step_one = login(client, MEMBER_EMAIL)
    assert step_one.json()["status"] == "mfa_required"
    assert COOKIE_NAME not in step_one.cookies
    assert client.get("/auth/me").status_code == 401

    step_two = client.post("/auth/login/mfa", json={"mfa_token": step_one.json()["mfa_token"], "code": _code(secret)})
    assert step_two.status_code == 200
    assert client.get("/auth/me").json()["email"] == MEMBER_EMAIL


def test_challenge_token_is_not_a_session_token():
    seed_family()
    _enable_mfa(MEMBER_EMAIL)
    token = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]

    me = new_client().get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 401


def test_mobile_login_cannot_skip_the_second_step():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = new_client()

    step_one = client.post("/auth/mobile-login", json={"email": MEMBER_EMAIL, "password": PASSWORD})
    assert step_one.status_code == 401
    detail = step_one.json()["detail"]
    assert detail["code"] == "MFA_REQUIRED"
    assert "access_token" not in step_one.json()

    step_two = client.post("/auth/mobile-login/mfa", json={"mfa_token": detail["params"]["mfa_token"], "code": _code(secret)})
    assert step_two.status_code == 200
    me = new_client().get("/auth/me", headers={"Authorization": f"Bearer {step_two.json()['access_token']}"})
    assert me.json()["email"] == MEMBER_EMAIL


def test_a_used_code_cannot_be_replayed():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    code = _code(secret)
    first = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]
    assert new_client().post("/auth/login/mfa", json={"mfa_token": first, "code": code}).status_code == 200

    second = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]
    replay = new_client().post("/auth/login/mfa", json={"mfa_token": second, "code": code})

    assert replay.json()["detail"]["code"] == "MFA_CODE_INVALID"


def test_recovery_code_works_once():
    seed_family()
    _, codes = _enable_mfa(MEMBER_EMAIL)
    client = new_client()

    token = login(client, MEMBER_EMAIL).json()["mfa_token"]
    assert client.post("/auth/login/mfa", json={"mfa_token": token, "code": codes[0].upper().replace("-", " ")}).status_code == 200
    assert client.get("/auth/me/mfa").json()["recovery_codes_remaining"] == 9

    token = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]
    again = new_client().post("/auth/login/mfa", json={"mfa_token": token, "code": codes[0]})
    assert again.json()["detail"]["code"] == "MFA_CODE_INVALID"


def test_five_wrong_codes_pause_the_account_even_for_the_right_code():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    token = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]
    right = _code(secret)
    wrong = "000000" if right != "000000" else "111111"

    for _ in range(mfa.MAX_FAILED_ATTEMPTS):
        assert new_client().post("/auth/login/mfa", json={"mfa_token": token, "code": wrong}).status_code == 400
    mfa_limiter.reset()
    locked = new_client().post("/auth/login/mfa", json={"mfa_token": token, "code": right})

    assert locked.status_code == 429
    assert locked.json()["detail"]["code"] == "MFA_TOO_MANY_ATTEMPTS"


def test_password_change_voids_a_pending_challenge():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    pending = login(new_client(), MEMBER_EMAIL).json()["mfa_token"]

    owner = new_client()
    token = login(owner, MEMBER_EMAIL).json()["mfa_token"]
    owner.post("/auth/login/mfa", json={"mfa_token": token, "code": _code(secret)})
    assert owner.patch("/auth/me/password", json={"old_password": PASSWORD, "new_password": "Changed2Pass"}).status_code == 200
    _allow_code_reuse(MEMBER_EMAIL)

    late = new_client().post("/auth/login/mfa", json={"mfa_token": pending, "code": _code(secret)})
    assert late.json()["detail"]["code"] == "MFA_CHALLENGE_INVALID"


# ---------------------------------------------------------------------------
# Turning it off and getting back in
# ---------------------------------------------------------------------------

def test_disable_requires_password_and_code():
    seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = new_client()
    token = login(client, MEMBER_EMAIL).json()["mfa_token"]
    client.post("/auth/login/mfa", json={"mfa_token": token, "code": _code(secret)})
    _allow_code_reuse(MEMBER_EMAIL)

    assert client.post("/auth/me/mfa/disable", json={"password": "Wrong1Pass", "code": _code(secret)}).status_code == 400
    assert client.post("/auth/me/mfa/disable", json={"password": PASSWORD, "code": "abcde-fghjk"}).status_code == 400
    assert client.post("/auth/me/mfa/disable", json={"password": PASSWORD, "code": _code(secret)}).status_code == 200

    assert client.get("/auth/me/mfa").json()["enabled"] is False
    assert login(new_client(), MEMBER_EMAIL).json()["status"] == "ok"


def test_family_admin_can_reset_a_members_second_step():
    family_id, admin_id, member_id = seed_family()
    _enable_mfa(MEMBER_EMAIL)
    admin = new_client()
    login(admin, ADMIN_EMAIL)

    reset = admin.post(f"/families/{family_id}/members/{member_id}/reset-mfa")

    assert reset.status_code == 200
    assert login(new_client(), MEMBER_EMAIL).json()["status"] == "ok"
    db = TestSession()
    try:
        assert db.query(MfaRecoveryCode).count() == 0
        entry = db.query(AuditLog).filter(AuditLog.action == "mfa_reset").one()
        assert (entry.admin_user_id, entry.target_user_id) == (admin_id, member_id)
    finally:
        db.close()


def test_member_reset_is_admin_only_and_not_for_yourself():
    family_id, admin_id, member_id = seed_family()
    _enable_mfa(ADMIN_EMAIL)
    secret, _ = _enable_mfa(MEMBER_EMAIL)

    member = new_client()
    token = login(member, MEMBER_EMAIL).json()["mfa_token"]
    member.post("/auth/login/mfa", json={"mfa_token": token, "code": _code(secret)})
    assert member.post(f"/families/{family_id}/members/{admin_id}/reset-mfa").status_code == 403

    db = TestSession()
    try:
        db.query(Membership).filter(Membership.user_id == member_id).update({Membership.role: "admin"})
        db.commit()
    finally:
        db.close()
    own = member.post(f"/families/{family_id}/members/{member_id}/reset-mfa")
    assert own.json()["detail"]["code"] == "CANNOT_RESET_OWN_MFA"


def test_server_command_turns_mfa_off(monkeypatch, capsys):
    seed_family()
    _enable_mfa(ADMIN_EMAIL)
    monkeypatch.setattr(reset_mfa_cli, "SessionLocal", TestSession)

    assert reset_mfa_cli.main([ADMIN_EMAIL.upper()]) == 0
    assert reset_mfa_cli.main(["nobody@example.com"]) == 1
    assert reset_mfa_cli.main([]) == 2

    assert "is off" in capsys.readouterr().out
    assert login(new_client(), ADMIN_EMAIL).json()["status"] == "ok"
