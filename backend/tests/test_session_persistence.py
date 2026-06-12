from datetime import datetime, timedelta, timezone

import pytest
import jwt
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.auth_sessions import issue_refresh_session, rotate_refresh_token
from app.core.deps import _resolve_user
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, User, UserSession
from app.security import JWT_ALG, JWT_SECRET, generate_pat, hash_password

engine = create_engine(
    "sqlite:///./test-session-persistence.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

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


client = TestClient(app)


def _seed_user():
    db = TestSession()
    try:
        user = User(
            email="session@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Session User",
            has_completed_onboarding=True,
        )
        db.add(user)
        db.flush()
        family = Family(name="Session Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        db.commit()
        return user.id
    finally:
        db.close()


def _expired_access_token(user_id: int) -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": "session@example.com",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
        },
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def test_rotate_refresh_token_accepts_aware_postgres_expiry_timestamp():
    user_id = _seed_user()
    db = TestSession()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        refresh_token = issue_refresh_session(db, user)
        session = db.query(UserSession).filter(UserSession.user_id == user_id).one()
        setattr(session, "expires_at", datetime.now(timezone.utc) + timedelta(days=1))

        result, refreshed_user, next_token = rotate_refresh_token(db, refresh_token)

        assert result == "ok"
        assert refreshed_user is not None
        assert getattr(refreshed_user, "id") == user_id
        assert next_token is not None
    finally:
        db.close()


def test_issue_refresh_session_uses_aware_utc_values_for_timezone_columns():
    user_id = _seed_user()
    db = TestSession()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        issue_refresh_session(db, user)
        session = next(obj for obj in db.new if isinstance(obj, UserSession))

        for value in (session.created_at, session.last_used_at, session.expires_at):
            assert value.tzinfo is not None
            assert value.utcoffset() == timedelta(0)
    finally:
        db.close()


def test_expired_refresh_token_with_aware_postgres_timestamp_is_invalid():
    user_id = _seed_user()
    db = TestSession()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        refresh_token = issue_refresh_session(db, user)
        session = db.query(UserSession).filter(UserSession.user_id == user_id).one()
        setattr(session, "expires_at", datetime.now(timezone.utc) - timedelta(minutes=1))

        result, refreshed_user, next_token = rotate_refresh_token(db, refresh_token)

        assert result == "invalid"
        assert refreshed_user is None
        assert next_token is None
        assert getattr(session, "revoked_at") is not None
    finally:
        db.close()


def test_expired_pat_with_aware_timestamp_returns_unauthorized():
    user_id = _seed_user()
    token, token_hash, token_lookup = generate_pat()
    db = TestSession()
    try:
        db.add(
            PersonalAccessToken(
                user_id=user_id,
                name="expired-aware-pat",
                token_hash=token_hash,
                token_lookup=token_lookup,
                scopes="profile:read",
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )
        db.flush()
        request = Request({"type": "http", "headers": []})

        with pytest.raises(HTTPException) as exc_info:
            _resolve_user(request, token, db)

        assert exc_info.value.status_code == 401
    finally:
        db.close()


def test_login_issues_refresh_cookie_and_refreshes_expired_access_cookie():
    user_id = _seed_user()

    login = client.post(
        "/auth/login",
        json={"email": "session@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200
    assert "tribu_token" in client.cookies
    assert "tribu_refresh" in client.cookies
    assert "tribu_refresh" in login.headers["set-cookie"]
    assert "Path=/" in login.headers["set-cookie"]

    client.cookies.set("tribu_token", _expired_access_token(user_id), domain="testserver.local", path="/")

    refresh = client.post("/auth/refresh")
    assert refresh.status_code == 200
    assert refresh.json() == {"status": "ok"}

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "session@example.com"


def test_logout_revokes_refresh_cookie():
    _seed_user()
    login = client.post(
        "/auth/login",
        json={"email": "session@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200
    assert "tribu_refresh" in client.cookies

    logout = client.post("/auth/logout")
    assert logout.status_code == 200
    assert "tribu_token" not in client.cookies
    assert "tribu_refresh" not in client.cookies

    db = TestSession()
    try:
        session = db.query(UserSession).one()
        assert session.revoked_at is not None
    finally:
        db.close()

    refresh = client.post("/auth/refresh")
    assert refresh.status_code == 401


def test_password_change_revokes_refresh_sessions():
    _seed_user()
    login = client.post(
        "/auth/login",
        json={"email": "session@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200

    changed = client.patch(
        "/auth/me/password",
        json={"old_password": "Secure1Pass", "new_password": "Changed1Pass"},
    )
    assert changed.status_code == 200
    assert "tribu_token" not in client.cookies
    assert "tribu_refresh" not in client.cookies

    refresh = client.post("/auth/refresh")
    assert refresh.status_code == 401

def test_unknown_refresh_token_does_not_clear_potentially_rotated_cookies():
    _seed_user()
    client.cookies.set("tribu_token", "fresh-access", domain="testserver.local", path="/")
    client.cookies.set("tribu_refresh", "stale-refresh", domain="testserver.local", path="/")

    refresh = client.post("/auth/refresh")

    assert refresh.status_code == 401
    set_cookie = refresh.headers.get("set-cookie", "")
    assert 'tribu_token=""' not in set_cookie
    assert 'tribu_refresh=""' not in set_cookie


def test_revoked_refresh_token_clears_session_cookies():
    _seed_user()
    login = client.post(
        "/auth/login",
        json={"email": "session@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200
    db = TestSession()
    try:
        session = db.query(UserSession).one()
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    refresh = client.post("/auth/refresh")

    assert refresh.status_code == 401
    set_cookie = refresh.headers.get("set-cookie", "")
    assert 'tribu_token=""' in set_cookie
    assert 'tribu_refresh=""' in set_cookie


def test_expired_refresh_token_clears_session_cookies():
    _seed_user()
    login = client.post(
        "/auth/login",
        json={"email": "session@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200
    db = TestSession()
    try:
        session = db.query(UserSession).one()
        session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    refresh = client.post("/auth/refresh")

    assert refresh.status_code == 401
    set_cookie = refresh.headers.get("set-cookie", "")
    assert 'tribu_token=""' in set_cookie
    assert 'tribu_refresh=""' in set_cookie
