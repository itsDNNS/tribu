"""Tests for ICS import provenance and re-import upsert.

Covers two pieces of the calendar interoperability work:

* The VEVENT UID survives import as ``ical_uid`` so the same event
  can be looked up on a subsequent re-import (unit level, against
  ``ics_to_event_dicts``).
* The ``POST /calendar/events/import-ics`` endpoint updates an
  existing row when an imported VEVENT UID matches, instead of
  inserting a duplicate (integration level, through TestClient).
"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.ics_utils import ics_to_event_dicts
from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-calendar-ics-import.db",
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
        user = User(email="cal@example.com", password_hash=hash_password("p"), display_name="Cal")
        db.add(user)
        db.flush()
        family = Family(name="ICS Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}cal-rw"
        digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="cal-pat",
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


def _ics(uid: str, summary: str = "Standup", dtstart: str = "20260310T090000") -> str:
    return (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DTSTART:{dtstart}\r\n"
        "DTEND:20260310T093000\r\n"
        "DTSTAMP:20260101T000000\r\n"
        f"UID:{uid}\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )


# --- unit ---------------------------------------------------------------


class TestUidPreservation:
    def test_vevent_uid_kept_as_ical_uid(self):
        valid, errors = ics_to_event_dicts(
            _ics("apple-holidays-2026@example.com"),
            family_id=1,
            user_id=1,
        )
        assert errors == []
        assert len(valid) == 1
        assert valid[0]["ical_uid"] == "apple-holidays-2026@example.com"
        assert valid[0]["source_type"] == "import"

    def test_default_source_metadata_applied(self):
        valid, _ = ics_to_event_dicts(
            _ics("u-2@example.com"),
            family_id=1,
            user_id=1,
            source_name="Apple Holidays",
            source_url="https://example.com/holidays.ics",
        )
        assert valid[0]["source_name"] == "Apple Holidays"
        assert valid[0]["source_url"] == "https://example.com/holidays.ics"
        assert valid[0]["imported_at"] is not None


# --- integration (endpoint) --------------------------------------------


class TestReimportUpdates:
    def test_first_import_creates_then_reimport_updates(self):
        token, family_id = _seed_adult()
        client = TestClient(app)

        first = client.post(
            "/calendar/events/import-ics",
            json={
                "family_id": family_id,
                "ics_text": _ics("evt-1@example.com", summary="Standup"),
                "source_name": "Team feed",
            },
            headers=_auth_headers(token),
        )
        assert first.status_code == 200, first.text
        body = first.json()
        assert body["created"] == 1
        assert body["updated"] == 0

        second = client.post(
            "/calendar/events/import-ics",
            json={
                "family_id": family_id,
                "ics_text": _ics("evt-1@example.com", summary="Standup (renamed)"),
                "source_name": "Team feed",
            },
            headers=_auth_headers(token),
        )
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["created"] == 0
        assert body["updated"] == 1

        db = TestSession()
        try:
            rows = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "evt-1@example.com",
            ).all()
            assert len(rows) == 1
            assert rows[0].title == "Standup (renamed)"
            assert rows[0].source_type == "import"
            assert rows[0].source_name == "Team feed"
        finally:
            db.close()



    def test_reimport_does_not_overwrite_existing_local_uid(self):
        token, family_id = _seed_adult()
        db = TestSession()
        try:
            from datetime import datetime

            local = CalendarEvent(
                family_id=family_id,
                title="Local copy",
                starts_at=datetime(2026, 3, 10, 9, 0),
                created_by_user_id=None,
                ical_uid="shared@example.com",
                source_type="local",
            )
            db.add(local)
            db.commit()
        finally:
            db.close()

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/import-ics",
            json={
                "family_id": family_id,
                "ics_text": _ics("shared@example.com", summary="External version"),
                "source_name": "External feed",
            },
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert "non-imported event" in body["errors"][0]["error"]

        db = TestSession()
        try:
            rows = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "shared@example.com",
            ).all()
            assert len(rows) == 1
            assert rows[0].title == "Local copy"
            assert rows[0].source_type == "local"
        finally:
            db.close()

    def test_distinct_uids_create_separate_rows(self):
        token, family_id = _seed_adult()
        client = TestClient(app)

        ics_text = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:A\r\n"
            "DTSTART:20260310T090000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:a@example.com\r\n"
            "END:VEVENT\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:B\r\n"
            "DTSTART:20260311T090000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:b@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )

        resp = client.post(
            "/calendar/events/import-ics",
            json={"family_id": family_id, "ics_text": ics_text},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["created"] == 2
        assert resp.json()["updated"] == 0
