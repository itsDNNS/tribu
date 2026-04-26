"""Tests for the calendar import/subscription preview endpoints.

The preview endpoints classify what an apply call *would* do without
mutating the database. They mirror the auth + URL safety rules of the
apply endpoints and return ``would_create`` / ``would_update`` /
``would_skip`` / ``errors`` plus a small ``sample_events`` list.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-calendar-preview.db",
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
    # Ensure stale rows from interrupted local runs cannot leak between tests.
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


def _seed(scopes: str = "calendar:read,calendar:write", is_adult: bool = True) -> tuple[str, int]:
    db = TestSession()
    try:
        user = User(email="prev@example.com", password_hash=hash_password("p"), display_name="Prev")
        db.add(user)
        db.flush()
        family = Family(name="Preview Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=is_adult))
        plain = f"{PAT_PREFIX}prev-rw"
        digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="prev-pat",
            token_hash=digest,
            token_lookup=digest,
            scopes=scopes,
        ))
        db.commit()
        return plain, family.id
    finally:
        db.close()


def _auth(token: str) -> dict:
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


def _patch_fetch(monkeypatch, fn):
    """Stub the network fetch helper used by the subscribe-ics router."""
    from app.modules import calendar_router as router_mod

    monkeypatch.setattr(router_mod, "fetch_ics_text", fn)


# --- import preview --------------------------------------------------------


class TestImportPreviewClassifies:
    def test_new_uid_counts_as_would_create_without_inserting(self):
        token, family_id = _seed()
        client = TestClient(app)

        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": _ics("evt-new@example.com", summary="New"),
                "source_name": "Team feed",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 1
        assert body["would_update"] == 0
        assert body["would_skip"] == 0
        assert body["errors"] == []

        db = TestSession()
        try:
            assert db.query(CalendarEvent).count() == 0
        finally:
            db.close()

    def test_existing_imported_uid_counts_as_would_update(self):
        token, family_id = _seed()

        db = TestSession()
        try:
            db.add(CalendarEvent(
                family_id=family_id,
                title="Old title",
                starts_at=datetime(2026, 3, 10, 9, 0),
                ical_uid="evt-1@example.com",
                source_type="import",
                source_name="Team feed",
            ))
            db.commit()
        finally:
            db.close()

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": _ics("evt-1@example.com", summary="Renamed"),
                "source_name": "Team feed",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 1
        assert body["would_skip"] == 0

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.ical_uid == "evt-1@example.com",
            ).one()
            # Preview must not mutate the existing row.
            assert row.title == "Old title"
        finally:
            db.close()

    def test_uid_collision_with_local_event_counts_as_would_skip(self):
        token, family_id = _seed()

        db = TestSession()
        try:
            db.add(CalendarEvent(
                family_id=family_id,
                title="Local copy",
                starts_at=datetime(2026, 3, 10, 9, 0),
                ical_uid="shared@example.com",
                source_type="local",
            ))
            db.commit()
        finally:
            db.close()

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": _ics("shared@example.com", summary="External"),
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 0
        assert body["would_skip"] == 1
        assert body["errors"]
        assert "non-imported" in body["errors"][0]["error"]

    def test_non_adult_member_is_forbidden(self):
        token, family_id = _seed(is_adult=False)
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={"family_id": family_id, "ics_text": _ics("evt@example.com")},
            headers=_auth(token),
        )
        assert resp.status_code == 403, resp.text

    def test_sample_events_capped_and_safe(self):
        token, family_id = _seed()

        # Build an ICS with a handful of distinct VEVENTs.
        vevents = "".join(
            (
                "BEGIN:VEVENT\r\n"
                f"SUMMARY:Event {i}\r\n"
                f"DTSTART:202603{10 + i:02d}T090000\r\n"
                "DTEND:20260310T093000\r\n"
                "DTSTAMP:20260101T000000\r\n"
                f"UID:bulk-{i}@example.com\r\n"
                "END:VEVENT\r\n"
            )
            for i in range(15)
        )
        ics_text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + vevents + "END:VCALENDAR\r\n"

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={"family_id": family_id, "ics_text": ics_text},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 15

        sample = body.get("sample_events", [])
        assert isinstance(sample, list)
        assert 0 < len(sample) <= 10
        # Only safe summary fields, never raw ICS payload.
        for item in sample:
            assert "title" in item
            assert "outcome" in item
            assert "ics_text" not in item


# --- subscription preview --------------------------------------------------


class TestSubscribePreviewClassifies:
    def test_rejects_non_http_scheme_without_fetching(self, monkeypatch):
        token, family_id = _seed()
        called = {"hit": False}

        def _should_not_be_called(url, **kwargs):
            called["hit"] = True
            return ""

        _patch_fetch(monkeypatch, _should_not_be_called)
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={"family_id": family_id, "source_url": "file:///etc/passwd"},
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert called["hit"] is False
        assert "/etc/passwd" not in resp.text
        assert "Traceback" not in resp.text

    def test_new_feed_counts_as_would_create_without_inserting(self, monkeypatch):
        token, family_id = _seed()
        _patch_fetch(monkeypatch, lambda u, **kw: _ics("feed-1@example.com"))

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/cal.ics",
                "source_name": "Holidays",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 1
        assert body["would_update"] == 0
        assert body["would_skip"] == 0

        db = TestSession()
        try:
            assert db.query(CalendarEvent).count() == 0
        finally:
            db.close()

    def test_same_feed_url_uid_counts_as_would_update(self, monkeypatch):
        token, family_id = _seed()
        url = "https://feed.example.com/cal.ics"

        db = TestSession()
        try:
            db.add(CalendarEvent(
                family_id=family_id,
                title="Stored",
                starts_at=datetime(2026, 3, 10, 9, 0),
                ical_uid="feed-1@example.com",
                source_type="subscription",
                source_url=url,
                source_name="Holidays",
            ))
            db.commit()
        finally:
            db.close()

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("feed-1@example.com", summary="Renamed"))
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": url,
                "source_name": "Holidays",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 1
        assert body["would_skip"] == 0

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.ical_uid == "feed-1@example.com",
            ).one()
            assert row.title == "Stored"
        finally:
            db.close()

    def test_different_feed_url_uid_counts_as_would_skip(self, monkeypatch):
        token, family_id = _seed()

        db = TestSession()
        try:
            db.add(CalendarEvent(
                family_id=family_id,
                title="Owned by feed A",
                starts_at=datetime(2026, 3, 10, 9, 0),
                ical_uid="dup@example.com",
                source_type="subscription",
                source_url="https://feed-a.example.com/cal.ics",
                source_name="Feed A",
            ))
            db.commit()
        finally:
            db.close()

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("dup@example.com", summary="From B"))
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed-b.example.com/cal.ics",
                "source_name": "Feed B",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 0
        assert body["would_skip"] == 1
        assert body["errors"]
        msg = body["errors"][0]["error"]
        assert "non-subscription" in msg or "different-feed" in msg

    def test_fetch_failure_returns_user_safe_400(self, monkeypatch):
        token, family_id = _seed()

        def _boom(url, **kw):
            raise RuntimeError("internal proxy host unreachable: 10.0.0.5:8080")

        _patch_fetch(monkeypatch, _boom)
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/cal.ics",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert "10.0.0.5" not in resp.text
        assert "Traceback" not in resp.text
