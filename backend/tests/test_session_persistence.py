from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, User, UserSession
from app.security import JWT_ALG, JWT_SECRET, hash_password

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
