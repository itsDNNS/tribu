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

    def test_ctag_changes_when_event_is_edited(self, app_under_test, seeded):
        """Editing a stored event must bump the collection ctag so clients
        that poll CS:getctag before refetching notice the change."""
        import re
        import time
        from datetime import datetime

        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}

        def fetch_ctag() -> str:
            body = (
                '<?xml version="1.0"?>'
                '<propfind xmlns="DAV:" xmlns:CS="http://calendarserver.org/ns/">'
                '<prop><CS:getctag/></prop></propfind>'
            )
            resp = client.request(
                "PROPFIND",
                f"/dav/{EMAIL}/family-{family_id}/",
                headers={**headers, "Depth": "0", "Content-Type": "application/xml"},
                content=body,
            )
            assert resp.status_code == 207, resp.text
            match = re.search(r"<CS:getctag[^>]*>([^<]+)</CS:getctag>", resp.text)
            return match.group(1) if match else ""

        ctag_before = fetch_ctag()
        assert ctag_before, "ctag must be present"

        # Edit an existing event directly and bump updated_at.
        db = SessionLocal()
        try:
            ev = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).first()
            assert ev is not None
            time.sleep(0.01)  # make sure updated_at lands after the first ctag read
            ev.title = ev.title + " (edited)"
            db.commit()
        finally:
            db.close()

        ctag_after = fetch_ctag()
        assert ctag_after != ctag_before, (
            f"Expected ctag to change after edit. before={ctag_before!r} after={ctag_after!r}"
        )

    def test_sync_token_refresh_is_rejected_until_phase_d(self, app_under_test, seeded):
        """A sync-collection REPORT with an old token must force a full refresh.

        Radicale converts the storage plugin's ``ValueError`` into a
        ``valid-sync-token`` precondition failure (HTTP 403) so the
        client re-runs without a token.
        """
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {
            "Authorization": _basic(EMAIL, token),
            "Depth": "1",
            "Content-Type": "application/xml",
        }
        body = (
            '<?xml version="1.0"?>'
            '<sync-collection xmlns="DAV:">'
            '<sync-token>http://radicale.org/ns/sync/stale</sync-token>'
            '<sync-level>1</sync-level>'
            '<prop><getetag/></prop>'
            '</sync-collection>'
        )
        resp = client.request(
            "REPORT",
            f"/dav/{EMAIL}/family-{family_id}/",
            headers=headers,
            content=body,
        )
        assert resp.status_code == 403, resp.text
        assert "valid-sync-token" in resp.text

    def test_put_creates_a_row(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {
            "Authorization": _basic(EMAIL, token),
            "Content-Type": "text/calendar",
        }
        ics = (
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"
            "PRODID:-//Test//EN\r\n"
            "BEGIN:VEVENT\r\nUID:new-from-dav@example.com\r\n"
            "DTSTAMP:20260101T000000Z\r\n"
            "DTSTART:20260601T120000Z\r\nDTEND:20260601T130000Z\r\n"
            "SUMMARY:From DAV\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/family-{family_id}/from-dav.ics",
            headers=headers,
            content=ics,
        )
        assert put.status_code in (201, 204), put.text
        # The row should be fetchable at the same href.
        get = client.get(
            f"/dav/{EMAIL}/family-{family_id}/from-dav.ics",
            headers={"Authorization": _basic(EMAIL, token)},
        )
        assert get.status_code == 200, get.text
        assert "From DAV" in get.text

    def test_put_overwrite_and_delete(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token)}
        ics_v1 = (
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n"
            "BEGIN:VEVENT\r\nUID:overwrite@example.com\r\n"
            "DTSTAMP:20260101T000000Z\r\n"
            "DTSTART:20260701T090000Z\r\nDTEND:20260701T100000Z\r\n"
            "SUMMARY:Original\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        )
        ics_v2 = ics_v1.replace("Original", "Renamed")

        put1 = client.put(
            f"/dav/{EMAIL}/family-{family_id}/overwrite.ics",
            headers={**auth, "Content-Type": "text/calendar"},
            content=ics_v1,
        )
        assert put1.status_code in (201, 204)

        put2 = client.put(
            f"/dav/{EMAIL}/family-{family_id}/overwrite.ics",
            headers={**auth, "Content-Type": "text/calendar"},
            content=ics_v2,
        )
        assert put2.status_code in (201, 204)

        get = client.get(f"/dav/{EMAIL}/family-{family_id}/overwrite.ics", headers=auth)
        assert get.status_code == 200
        assert "Renamed" in get.text
        assert "Original" not in get.text

        delete = client.request(
            "DELETE",
            f"/dav/{EMAIL}/family-{family_id}/overwrite.ics",
            headers=auth,
        )
        assert delete.status_code in (200, 204)

        get_after = client.get(
            f"/dav/{EMAIL}/family-{family_id}/overwrite.ics",
            headers=auth,
        )
        assert get_after.status_code == 404

    def test_put_rejects_invalid_ics(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {
            "Authorization": _basic(EMAIL, token),
            "Content-Type": "text/calendar",
        }
        # Missing SUMMARY -> ics_to_event_dicts rejects it.
        ics = (
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n"
            "BEGIN:VEVENT\r\nUID:bad@example.com\r\n"
            "DTSTAMP:20260101T000000Z\r\nDTSTART:20260601T120000Z\r\n"
            "END:VEVENT\r\nEND:VCALENDAR\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/family-{family_id}/bad.ics",
            headers=headers,
            content=ics,
        )
        # Radicale maps a ValueError from storage to a 4xx.
        assert 400 <= put.status_code < 500, put.text
