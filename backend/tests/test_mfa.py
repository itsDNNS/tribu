import base64

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app import reset_mfa as reset_mfa_cli
from app.core import mfa
from app.core.config import COOKIE_NAME
from app.database import Base, get_db
from app.main import app, limiter as app_limiter
from app.models import AuditLog, Family, Membership, MfaRecoveryCode, User
from app.modules.mfa_router import limiter as mfa_limiter
from app.security import hash_password


engine = create_engine(
    "sqlite:///./test-mfa.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)

PASSWORD = "Secure1Pass"
ADMIN_EMAIL = "admin-mfa@example.com"
MEMBER_EMAIL = "member-mfa@example.com"


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app_limiter.reset()
    mfa_limiter.reset()

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override


def teardown_function():
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _client() -> TestClient:
    return TestClient(app)


def _seed_family() -> tuple[int, int, int]:
    db = TestSession()
    try:
        admin = User(email=ADMIN_EMAIL, password_hash=hash_password(PASSWORD), display_name="Admin", has_completed_onboarding=True)
        member = User(email=MEMBER_EMAIL, password_hash=hash_password(PASSWORD), display_name="Member", has_completed_onboarding=True)
        family = Family(name="MFA Family")
        db.add_all([admin, member, family])
        db.flush()
        db.add(Membership(user_id=admin.id, family_id=family.id, role="admin", is_adult=True))
        db.add(Membership(user_id=member.id, family_id=family.id, role="member", is_adult=True))
        db.commit()
        return family.id, admin.id, member.id
    finally:
        db.close()


def _login(client: TestClient, email: str):
    return client.post("/auth/login", json={"email": email, "password": PASSWORD})


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
    client = _client()
    assert _login(client, email).json()["status"] == "ok"
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
    _seed_family()
    client = _client()
    _login(client, MEMBER_EMAIL)

    assert client.post("/auth/me/mfa/setup", json={"password": "Wrong1Pass"}).json()["detail"]["code"] == "PASSWORD_INCORRECT"

    setup = client.post("/auth/me/mfa/setup", json={"password": PASSWORD}).json()
    wrong = client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": "000000" if _code(setup["secret"]) != "000000" else "111111"})
    assert wrong.status_code == 400
    assert client.get("/auth/me/mfa").json()["enabled"] is False

    confirm = client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": _code(setup["secret"])})
    codes = confirm.json()["recovery_codes"]
    assert len(codes) == mfa.RECOVERY_CODE_COUNT
    assert len(set(codes)) == mfa.RECOVERY_CODE_COUNT
    assert client.get("/auth/me/mfa").json() == {"enabled": True, "available": True, "recovery_codes_remaining": 10}

    db = TestSession()
    try:
        stored = {row.code_lookup for row in db.query(MfaRecoveryCode).all()}
    finally:
        db.close()
    assert not stored & set(codes), "recovery codes must not be stored in plain text"


def test_setup_token_of_another_user_is_refused():
    _seed_family()
    admin_client, member_client = _client(), _client()
    _login(admin_client, ADMIN_EMAIL)
    _login(member_client, MEMBER_EMAIL)
    setup = admin_client.post("/auth/me/mfa/setup", json={"password": PASSWORD}).json()

    stolen = member_client.post("/auth/me/mfa/confirm", json={"setup_token": setup["setup_token"], "code": _code(setup["secret"])})

    assert stolen.json()["detail"]["code"] == "MFA_SETUP_EXPIRED"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_web_login_asks_for_code_and_sets_no_session_before_it():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = _client()

    step_one = _login(client, MEMBER_EMAIL)
    assert step_one.json()["status"] == "mfa_required"
    assert COOKIE_NAME not in step_one.cookies
    assert client.get("/auth/me").status_code == 401

    step_two = client.post("/auth/login/mfa", json={"mfa_token": step_one.json()["mfa_token"], "code": _code(secret)})
    assert step_two.status_code == 200
    assert client.get("/auth/me").json()["email"] == MEMBER_EMAIL


def test_challenge_token_is_not_a_session_token():
    _seed_family()
    _enable_mfa(MEMBER_EMAIL)
    token = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]

    me = _client().get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 401


def test_mobile_login_cannot_skip_the_second_step():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = _client()

    step_one = client.post("/auth/mobile-login", json={"email": MEMBER_EMAIL, "password": PASSWORD})
    assert step_one.status_code == 401
    detail = step_one.json()["detail"]
    assert detail["code"] == "MFA_REQUIRED"
    assert "access_token" not in step_one.json()

    step_two = client.post("/auth/mobile-login/mfa", json={"mfa_token": detail["params"]["mfa_token"], "code": _code(secret)})
    assert step_two.status_code == 200
    me = _client().get("/auth/me", headers={"Authorization": f"Bearer {step_two.json()['access_token']}"})
    assert me.json()["email"] == MEMBER_EMAIL


def test_a_used_code_cannot_be_replayed():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    code = _code(secret)
    first = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]
    assert _client().post("/auth/login/mfa", json={"mfa_token": first, "code": code}).status_code == 200

    second = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]
    replay = _client().post("/auth/login/mfa", json={"mfa_token": second, "code": code})

    assert replay.json()["detail"]["code"] == "MFA_CODE_INVALID"


def test_recovery_code_works_once():
    _seed_family()
    _, codes = _enable_mfa(MEMBER_EMAIL)
    client = _client()

    token = _login(client, MEMBER_EMAIL).json()["mfa_token"]
    assert client.post("/auth/login/mfa", json={"mfa_token": token, "code": codes[0].upper().replace("-", " ")}).status_code == 200
    assert client.get("/auth/me/mfa").json()["recovery_codes_remaining"] == 9

    token = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]
    again = _client().post("/auth/login/mfa", json={"mfa_token": token, "code": codes[0]})
    assert again.json()["detail"]["code"] == "MFA_CODE_INVALID"


def test_five_wrong_codes_pause_the_account_even_for_the_right_code():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    token = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]
    right = _code(secret)
    wrong = "000000" if right != "000000" else "111111"

    for _ in range(mfa.MAX_FAILED_ATTEMPTS):
        assert _client().post("/auth/login/mfa", json={"mfa_token": token, "code": wrong}).status_code == 400
    mfa_limiter.reset()
    locked = _client().post("/auth/login/mfa", json={"mfa_token": token, "code": right})

    assert locked.status_code == 429
    assert locked.json()["detail"]["code"] == "MFA_TOO_MANY_ATTEMPTS"


def test_password_change_voids_a_pending_challenge():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    pending = _login(_client(), MEMBER_EMAIL).json()["mfa_token"]

    owner = _client()
    token = _login(owner, MEMBER_EMAIL).json()["mfa_token"]
    owner.post("/auth/login/mfa", json={"mfa_token": token, "code": _code(secret)})
    assert owner.patch("/auth/me/password", json={"old_password": PASSWORD, "new_password": "Changed2Pass"}).status_code == 200
    _allow_code_reuse(MEMBER_EMAIL)

    late = _client().post("/auth/login/mfa", json={"mfa_token": pending, "code": _code(secret)})
    assert late.json()["detail"]["code"] == "MFA_CHALLENGE_INVALID"


# ---------------------------------------------------------------------------
# Turning it off and getting back in
# ---------------------------------------------------------------------------

def test_disable_requires_password_and_code():
    _seed_family()
    secret, _ = _enable_mfa(MEMBER_EMAIL)
    client = _client()
    token = _login(client, MEMBER_EMAIL).json()["mfa_token"]
    client.post("/auth/login/mfa", json={"mfa_token": token, "code": _code(secret)})
    _allow_code_reuse(MEMBER_EMAIL)

    assert client.post("/auth/me/mfa/disable", json={"password": "Wrong1Pass", "code": _code(secret)}).status_code == 400
    assert client.post("/auth/me/mfa/disable", json={"password": PASSWORD, "code": "abcde-fghjk"}).status_code == 400
    assert client.post("/auth/me/mfa/disable", json={"password": PASSWORD, "code": _code(secret)}).status_code == 200

    assert client.get("/auth/me/mfa").json()["enabled"] is False
    assert _login(_client(), MEMBER_EMAIL).json()["status"] == "ok"


def test_family_admin_can_reset_a_members_second_step():
    family_id, admin_id, member_id = _seed_family()
    _enable_mfa(MEMBER_EMAIL)
    admin = _client()
    _login(admin, ADMIN_EMAIL)

    reset = admin.post(f"/families/{family_id}/members/{member_id}/reset-mfa")

    assert reset.status_code == 200
    assert _login(_client(), MEMBER_EMAIL).json()["status"] == "ok"
    db = TestSession()
    try:
        assert db.query(MfaRecoveryCode).count() == 0
        entry = db.query(AuditLog).filter(AuditLog.action == "mfa_reset").one()
        assert (entry.admin_user_id, entry.target_user_id) == (admin_id, member_id)
    finally:
        db.close()


def test_member_reset_is_admin_only_and_not_for_yourself():
    family_id, admin_id, member_id = _seed_family()
    _enable_mfa(ADMIN_EMAIL)
    secret, _ = _enable_mfa(MEMBER_EMAIL)

    member = _client()
    token = _login(member, MEMBER_EMAIL).json()["mfa_token"]
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
    _seed_family()
    _enable_mfa(ADMIN_EMAIL)
    monkeypatch.setattr(reset_mfa_cli, "SessionLocal", TestSession)

    assert reset_mfa_cli.main([ADMIN_EMAIL.upper()]) == 0
    assert reset_mfa_cli.main(["nobody@example.com"]) == 1
    assert reset_mfa_cli.main([]) == 2

    assert "is off" in capsys.readouterr().out
    assert _login(_client(), ADMIN_EMAIL).json()["status"] == "ok"
