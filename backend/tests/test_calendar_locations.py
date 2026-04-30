import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-calendar-locations.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine, autoflush=False)


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


def _seed_adult(scopes: str = "calendar:read,calendar:write") -> tuple[str, int]:
    db = TestSession()
    try:
        user = User(email="location@example.com", password_hash=hash_password("p"), display_name="Location Admin")
        db.add(user)
        db.flush()
        family = Family(name="Location Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}calendar-location"
        digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="calendar-location-pat",
            token_hash=digest,
            token_lookup=digest,
            scopes=scopes,
        ))
        db.commit()
        return plain, family.id
    finally:
        db.close()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_create_list_update_and_clear_calendar_event_location():
    token, family_id = _seed_adult()
    client = TestClient(app)

    created = client.post(
        "/calendar/events",
        json={
            "family_id": family_id,
            "title": "Football practice",
            "starts_at": "2026-05-12T16:00:00",
            "location": "Sports Park, Field 2",
        },
        headers=_auth_headers(token),
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["location"] == "Sports Park, Field 2"

    listed = client.get(f"/calendar/events?family_id={family_id}", headers=_auth_headers(token))
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["location"] == "Sports Park, Field 2"

    updated = client.patch(
        f"/calendar/events/{body['id']}",
        json={"location": "Sports Park Main Entrance"},
        headers=_auth_headers(token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["location"] == "Sports Park Main Entrance"

    cleared = client.patch(
        f"/calendar/events/{body['id']}",
        json={"location": None},
        headers=_auth_headers(token),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["location"] is None

    db = TestSession()
    try:
        event = db.query(CalendarEvent).filter(CalendarEvent.id == body["id"]).one()
        assert event.location is None
    finally:
        db.close()
