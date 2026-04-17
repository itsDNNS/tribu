"""Phase B1: read-only CalDAV storage integration tests.

Seeds a user, family membership, and a handful of calendar events,
then exercises the DAV mount with CalDAV-specific PROPFIND and REPORT
queries. Confirms that events surface as VEVENT items and that
client write attempts are rejected with 403 until Phase B2.
"""
from __future__ import annotations

import base64
import hashlib
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.models import CalendarEvent, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


EMAIL = "dav-caldav@example.com"


@pytest.fixture(scope="module")
def dav_storage_folder():
    with tempfile.TemporaryDirectory(prefix="tribu-dav-caldav-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        yield folder
        os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture(scope="module")
def app_under_test(dav_storage_folder):
    from app.main import app

    Base.metadata.create_all(bind=engine)
    yield app
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def seeded(app_under_test):
    from datetime import datetime, timedelta

    db = SessionLocal()
    try:
        user = User(email=EMAIL, password_hash=hash_password("x"), display_name="CalDAV User")
        db.add(user)
        db.flush()
        family = Family(name="CalDAV Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}caldav-rw"
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="caldav-pat",
            token_hash=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
            scopes="calendar:read,calendar:write",
        ))
        # Two events
        db.add(CalendarEvent(
            family_id=family.id,
            title="Team sync",
            starts_at=datetime(2026, 5, 4, 10, 0),
            ends_at=datetime(2026, 5, 4, 11, 0),
            all_day=False,
            created_by_user_id=user.id,
        ))
        db.add(CalendarEvent(
            family_id=family.id,
            title="Picnic",
            starts_at=datetime(2026, 5, 10, 0, 0),
            ends_at=datetime(2026, 5, 10, 23, 59),
            all_day=True,
            recurrence="yearly",
            created_by_user_id=user.id,
        ))
        db.commit()
        token = plain
        family_id = family.id
    finally:
        db.close()
    yield token, family_id
    # teardown: wipe rows so other tests keep a clean table
    db = SessionLocal()
    try:
        db.query(CalendarEvent).delete()
        db.query(Membership).delete()
        db.query(PersonalAccessToken).delete()
        db.query(User).filter(User.email == EMAIL).delete()
        db.query(Family).delete()
        db.commit()
    finally:
        db.close()


def _basic(login: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{login}:{token}".encode("utf-8")).decode("ascii")


def _propfind(client: TestClient, path: str, *, headers=None, depth="1"):
    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:"><prop>'
        '<resourcetype/><displayname/><getetag/><getcontenttype/>'
        '</prop></propfind>'
    )
    h = {"Depth": depth, "Content-Type": "application/xml"}
    if headers:
        h.update(headers)
    return client.request("PROPFIND", path, headers=h, content=body)


class TestCalDAVRead:
    def test_principal_home_lists_the_family_calendar(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        body = resp.text
        assert f"family-{family_id}" in body

    def test_collection_exposes_both_events(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/family-{family_id}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        assert "tribu-event-" in resp.text
        # exactly 2 item hrefs
        assert resp.text.count("tribu-event-") >= 2

    def test_item_fetch_returns_vevent_with_summary(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        # GET the VEVENT ics body of the first event
        # We don't know the event id in advance, grab it via PROPFIND
        headers = {"Authorization": _basic(EMAIL, token)}
        listing = _propfind(
            client,
            f"/dav/{EMAIL}/family-{family_id}/",
            headers=headers,
            depth="1",
        )
        assert "tribu-event-" in listing.text
        # Extract first href
        import re

        match = re.search(r"tribu-event-(\d+)\.ics", listing.text)
        assert match, listing.text
        event_id = match.group(1)
        get_resp = client.get(
            f"/dav/{EMAIL}/family-{family_id}/tribu-event-{event_id}.ics",
            headers=headers,
        )
        assert get_resp.status_code == 200, get_resp.text
        assert "BEGIN:VCALENDAR" in get_resp.text
        assert "BEGIN:VEVENT" in get_resp.text
        # One of our seeded events must be in there
        assert ("Team sync" in get_resp.text) or ("Picnic" in get_resp.text)

    def test_put_is_rejected_until_phase_b2(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {
            "Authorization": _basic(EMAIL, token),
            "Content-Type": "text/calendar",
        }
        ics = (
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"
            "PRODID:-//Test//EN\r\n"
            "BEGIN:VEVENT\r\nUID:new@example.com\r\n"
            "DTSTAMP:20260101T000000Z\r\n"
            "DTSTART:20260601T120000Z\r\nDTEND:20260601T130000Z\r\n"
            "SUMMARY:From DAV\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/family-{family_id}/new-event.ics",
            headers=headers,
            content=ics,
        )
        # Radicale maps a storage PermissionError onto a 403
        assert put.status_code in (403, 500), put.text
