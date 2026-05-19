from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, User
from app.security import hash_password


engine = create_engine(
    "sqlite:///./test-mobile-auth.db",
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
            email="mobile-login@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Mobile Login",
            must_change_password=True,
            has_completed_onboarding=True,
        )
        db.add(user)
        db.flush()
        family = Family(name="Mobile Family")
        db.add(family)
        db.flush()
        db.add(
            Membership(
                user_id=user.id, family_id=family.id, role="admin", is_adult=True
            )
        )
        db.commit()
        return family.id
    finally:
        db.close()


def test_mobile_login_returns_bearer_token_usable_for_authenticated_routes():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "Secure1Pass"},
    )

    assert login.status_code == 200, login.json()
    data = login.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["expires_in_hours"] > 0
    assert data["refresh_expires_in_seconds"] > 0
    assert data["must_change_password"] is True
    assert "set-cookie" not in {
        key.lower(): value for key, value in login.headers.items()
    }

    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert me.status_code == 200, me.json()
    assert me.json()["email"] == "mobile-login@example.com"


def test_mobile_refresh_rotates_token_and_revokes_on_mobile_logout():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "Secure1Pass"},
    )
    assert login.status_code == 200, login.json()
    first_refresh = login.json()["refresh_token"]

    refreshed = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": first_refresh},
    )
    assert refreshed.status_code == 200, refreshed.json()
    refreshed_data = refreshed.json()
    assert refreshed_data["access_token"]
    assert refreshed_data["refresh_token"]
    assert refreshed_data["refresh_token"] != first_refresh
    assert "set-cookie" not in {
        key.lower(): value for key, value in refreshed.headers.items()
    }

    stale = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": first_refresh},
    )
    assert stale.status_code == 401

    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {refreshed_data['access_token']}"}
    )
    assert me.status_code == 200, me.json()

    logout = client.post(
        "/auth/mobile-logout",
        json={"refresh_token": refreshed_data["refresh_token"]},
    )
    assert logout.status_code == 200, logout.json()

    revoked = client.post(
        "/auth/mobile-refresh",
        json={"refresh_token": refreshed_data["refresh_token"]},
    )
    assert revoked.status_code == 401


def test_mobile_login_rejects_invalid_credentials():
    _seed_user()

    login = client.post(
        "/auth/mobile-login",
        json={"email": "mobile-login@example.com", "password": "WrongPass1"},
    )

    assert login.status_code == 401
