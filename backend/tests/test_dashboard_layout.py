"""Integration tests for per-user dashboard module layout preferences."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import PersonalAccessToken, User, UserNavOrder
from app.security import PAT_PREFIX, hash_password


engine = create_engine("sqlite:///./test-dashboard-layout.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
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


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_user(scopes: str = "*") -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"dashboard-layout-{scopes.replace(':', '-').replace('*', 'star')}@example.com",
        password_hash=hash_password("Password1"),
        display_name="Dashboard User",
    )
    db.add(user)
    db.flush()
    plain = f"{PAT_PREFIX}dashboard-layout-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(user_id=user.id, name="dashboard-layout-pat", token_hash=fingerprint, token_lookup=fingerprint, scopes=scopes))
    db.commit()
    user_id = user.id
    db.close()
    return plain, user_id


def test_dashboard_layout_persists_normalizes_and_resets_per_user():
    token, user_id = _seed_user()

    default_response = client.get("/nav/dashboard-layout", headers=_auth(token))
    assert default_response.status_code == 200, default_response.json()
    assert default_response.json()["modules"] == [
        "quick_capture",
        "daily_loop",
        "events",
        "tasks",
        "birthdays",
        "activity",
        "rewards",
    ]

    update_response = client.put(
        "/nav/dashboard-layout",
        json={"modules": ["tasks", "events", "tasks", "quick_capture"]},
        headers=_auth(token),
    )
    assert update_response.status_code == 200, update_response.json()
    assert update_response.json()["modules"] == [
        "tasks",
        "events",
        "quick_capture",
        "daily_loop",
        "birthdays",
        "activity",
        "rewards",
    ]

    db = TestSession()
    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user_id).first()
    assert row is not None
    assert row.dashboard_layout[0:3] == ["tasks", "events", "quick_capture"]
    db.close()

    saved_response = client.get("/nav/dashboard-layout", headers=_auth(token))
    assert saved_response.status_code == 200, saved_response.json()
    assert saved_response.json()["modules"][0:3] == ["tasks", "events", "quick_capture"]

    reset_response = client.delete("/nav/dashboard-layout", headers=_auth(token))
    assert reset_response.status_code == 200, reset_response.json()
    assert reset_response.json()["modules"][0:2] == ["quick_capture", "daily_loop"]


def test_dashboard_layout_rejects_unknown_modules_and_enforces_scopes():
    read_token, _ = _seed_user(scopes="profile:read")
    write_token, _ = _seed_user(scopes="profile:write")

    forbidden_read = client.get("/nav/dashboard-layout", headers=_auth(write_token))
    assert forbidden_read.status_code == 403

    forbidden_write = client.put(
        "/nav/dashboard-layout",
        json={"modules": ["tasks", "events"]},
        headers=_auth(read_token),
    )
    assert forbidden_write.status_code == 403

    invalid = client.put(
        "/nav/dashboard-layout",
        json={"modules": ["tasks", "unknown"]},
        headers=_auth(write_token),
    )
    assert invalid.status_code == 422
    assert "unknown" in str(invalid.json())
