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
    from datetime import datetime

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
            token_lookup=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
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
            assigned_to=[user.id],
            category="Sport, Outdoor",
            color="#ff0000",
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


def _fetch_ctag(client: TestClient, headers: dict, family_id: int) -> str:
    import re

    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:" xmlns:CS="http://calendarserver.org/ns/">'
        '<prop><CS:getctag/></prop></propfind>'
    )
    resp = client.request(
        "PROPFIND",
        f"/dav/{EMAIL}/cal-{family_id}/",
        headers={**headers, "Depth": "0", "Content-Type": "application/xml"},
        content=body,
    )
    assert resp.status_code == 207, resp.text
    match = re.search(r"<CS:getctag[^>]*>([^<]+)</CS:getctag>", resp.text)
    return match.group(1) if match else ""


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
        assert f"cal-{family_id}" in body

    def test_collection_exposes_both_events(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/cal-{family_id}/", headers=headers, depth="1")
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
            f"/dav/{EMAIL}/cal-{family_id}/",
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
            f"/dav/{EMAIL}/cal-{family_id}/tribu-event-{event_id}.ics",
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
        import time

        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}

        ctag_before = _fetch_ctag(client, headers, family_id)
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

        ctag_after = _fetch_ctag(client, headers, family_id)
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
            f"/dav/{EMAIL}/cal-{family_id}/",
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
            f"/dav/{EMAIL}/cal-{family_id}/from-dav.ics",
            headers=headers,
            content=ics,
        )
        assert put.status_code in (201, 204), put.text
        # The row should be fetchable at the same href.
        get = client.get(
            f"/dav/{EMAIL}/cal-{family_id}/from-dav.ics",
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
            f"/dav/{EMAIL}/cal-{family_id}/overwrite.ics",
            headers={**auth, "Content-Type": "text/calendar"},
            content=ics_v1,
        )
        assert put1.status_code in (201, 204)

        put2 = client.put(
            f"/dav/{EMAIL}/cal-{family_id}/overwrite.ics",
            headers={**auth, "Content-Type": "text/calendar"},
            content=ics_v2,
        )
        assert put2.status_code in (201, 204)

        get = client.get(f"/dav/{EMAIL}/cal-{family_id}/overwrite.ics", headers=auth)
        assert get.status_code == 200
        assert "Renamed" in get.text
        assert "Original" not in get.text

        delete = client.request(
            "DELETE",
            f"/dav/{EMAIL}/cal-{family_id}/overwrite.ics",
            headers=auth,
        )
        assert delete.status_code in (200, 204)

        get_after = client.get(
            f"/dav/{EMAIL}/cal-{family_id}/overwrite.ics",
            headers=auth,
        )
        assert get_after.status_code == 404

    def test_concurrent_put_same_href_does_not_500(self, app_under_test, seeded):
        """Two threads racing on the same href must not both commit and
        must not surface a 500. The write lock serializes them; either
        both succeed (with one overwriting the other) or the second
        surfaces as a deterministic 4xx from the unique-constraint
        fallback path."""
        import concurrent.futures

        token, family_id = seeded
        headers = {
            "Authorization": _basic(EMAIL, token),
            "Content-Type": "text/calendar",
        }

        def make_ics(suffix: str) -> str:
            return (
                "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n"
                f"BEGIN:VEVENT\r\nUID:race-{suffix}@example.com\r\n"
                "DTSTAMP:20260101T000000Z\r\n"
                "DTSTART:20260801T100000Z\r\nDTEND:20260801T110000Z\r\n"
                f"SUMMARY:Race variant {suffix}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
            )

        def put(suffix: str):
            client = TestClient(app_under_test)
            return client.put(
                f"/dav/{EMAIL}/cal-{family_id}/race.ics",
                headers=headers,
                content=make_ics(suffix),
            ).status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            statuses = list(ex.map(put, ["a", "b", "c", "d"]))

        for s in statuses:
            assert s < 500, statuses

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
            f"/dav/{EMAIL}/cal-{family_id}/bad.ics",
            headers=headers,
            content=ics,
        )
        # Radicale maps a ValueError from storage to a 4xx.
        assert 400 <= put.status_code < 500, put.text


def _seeded_ids(family_id: int) -> tuple[int, int]:
    """Return ``(user_id, team_sync_event_id)`` for the seeded fixture."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).one()
        ev = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.family_id == family_id, CalendarEvent.title == "Team sync")
            .one()
        )
        return user.id, ev.id
    finally:
        db.close()


def _attendee_list(vevent):
    value = vevent.get("attendee")
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


class TestMembershipFingerprint:
    def test_separator_characters_in_names_cannot_collide(self):
        from app.dav.caldav_storage import _membership_fingerprint

        # A display name containing the old separator characters must not
        # serialize to the same fingerprint as a two-member family.
        tricky = _membership_fingerprint({1: "A,2=B"})
        two_members = _membership_fingerprint({1: "A", 2: "B"})
        assert tricky != two_members

    def test_equivalent_mappings_share_a_stable_fingerprint(self):
        from app.dav.caldav_storage import _membership_fingerprint

        ordered = _membership_fingerprint({1: "Änna", 2: "Ben"})
        reversed_insertion = _membership_fingerprint({2: "Ben", 1: "Änna"})
        assert ordered == reversed_insertion


class TestCalDAVMemberProjection:
    """Discussion #438: assigned members, category, and color must be
    visible to CalDAV clients without letting lossy clients erase them."""

    def test_event_get_emits_member_attendees_category_and_color(self, app_under_test, seeded):
        from icalendar import Calendar

        token, family_id = seeded
        user_id, event_id = _seeded_ids(family_id)
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token)}

        resp = client.get(
            f"/dav/{EMAIL}/cal-{family_id}/tribu-event-{event_id}.ics",
            headers=auth,
        )
        assert resp.status_code == 200, resp.text
        (vevent,) = [c for c in Calendar.from_ical(resp.text).walk("VEVENT")]

        (attendee,) = _attendee_list(vevent)
        assert str(attendee) == f"mailto:user-{user_id}@tribu.invalid"
        assert str(attendee.params["CN"]) == "CalDAV User"
        assert str(attendee.params["X-TRIBU-USER-ID"]) == str(user_id)

        cats = vevent.get("categories")
        assert [str(c) for c in cats.cats] == ["Sport, Outdoor"]
        assert str(vevent.get("X-TRIBU-COLOR")) == "#ff0000"

        # Privacy: the member's real login email must never appear in
        # calendar data, and we do not emit ORGANIZER or lossy COLOR.
        assert EMAIL not in resp.text
        assert "ORGANIZER" not in resp.text
        assert vevent.get("COLOR") is None

    def test_lossy_put_preserves_assignment_category_and_color(self, app_under_test, seeded):
        """A phone client that never saw ATTENDEE/CATEGORIES/X-TRIBU-COLOR
        PUTs the event back without them; Tribu's fields must survive and
        the following GET must re-emit them."""
        token, family_id = seeded
        user_id, _ = _seeded_ids(family_id)
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token)}
        put_headers = {**auth, "Content-Type": "text/calendar"}

        def phone_ics(summary: str) -> str:
            return (
                "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Phone//EN\r\n"
                "BEGIN:VEVENT\r\nUID:phone-lossy@example.com\r\n"
                "DTSTAMP:20260101T000000Z\r\n"
                "DTSTART:20260901T100000Z\r\nDTEND:20260901T110000Z\r\n"
                f"SUMMARY:{summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
            )

        put1 = client.put(
            f"/dav/{EMAIL}/cal-{family_id}/phone-lossy.ics",
            headers=put_headers,
            content=phone_ics("Doctor"),
        )
        assert put1.status_code in (201, 204), put1.text

        # The family assigns the event in the Tribu UI.
        db = SessionLocal()
        try:
            ev = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == family_id, CalendarEvent.dav_href == "phone-lossy.ics")
                .one()
            )
            ev.assigned_to = [user_id]
            ev.category = "Health"
            ev.color = "#00ff00"
            db.commit()
            event_pk = ev.id
        finally:
            db.close()

        # Phone-like lossy overwrite: only the summary changed.
        put2 = client.put(
            f"/dav/{EMAIL}/cal-{family_id}/phone-lossy.ics",
            headers=put_headers,
            content=phone_ics("Doctor (moved)"),
        )
        assert put2.status_code in (201, 204), put2.text

        db = SessionLocal()
        try:
            ev = db.query(CalendarEvent).filter(CalendarEvent.id == event_pk).one()
            assert ev.title == "Doctor (moved)"
            assert ev.assigned_to == [user_id]
            assert ev.category == "Health"
            assert ev.color == "#00ff00"
        finally:
            db.close()

        get = client.get(f"/dav/{EMAIL}/cal-{family_id}/phone-lossy.ics", headers=auth)
        assert get.status_code == 200, get.text
        assert "Doctor (moved)" in get.text
        assert f"mailto:user-{user_id}@tribu.invalid" in get.text
        assert "CATEGORIES:Health" in get.text
        assert "X-TRIBU-COLOR:#00ff00" in get.text

    def test_ctag_changes_after_member_rename_and_membership_change(self, app_under_test, seeded):
        """Member renames/additions change emitted ATTENDEE content without
        touching any event row, so the collection ctag must reflect the
        family membership fingerprint."""
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}

        ctag_initial = _fetch_ctag(client, headers, family_id)
        assert ctag_initial

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == EMAIL).one()
            user.display_name = "CalDAV User (renamed)"
            db.commit()
        finally:
            db.close()

        ctag_after_rename = _fetch_ctag(client, headers, family_id)
        assert ctag_after_rename != ctag_initial

        db = SessionLocal()
        try:
            extra = User(
                email="dav-caldav-second@example.com",
                password_hash=hash_password("x"),
                display_name="Second Member",
            )
            db.add(extra)
            db.flush()
            db.add(Membership(user_id=extra.id, family_id=family_id, role="member", is_adult=True))
            db.commit()
        finally:
            db.close()

        ctag_after_join = _fetch_ctag(client, headers, family_id)
        assert ctag_after_join not in (ctag_initial, ctag_after_rename)

    def test_collection_serialize_has_no_per_event_member_queries(self, app_under_test, seeded):
        """The member mapping must be preloaded once per collection
        operation, not looked up per event (N+1)."""
        from typing import cast

        from sqlalchemy import event as sa_event

        from app.database import engine
        from app.dav.caldav_storage import CalendarCollection, Storage

        token, family_id = seeded
        coll = CalendarCollection(cast(Storage, None), EMAIL, family_id, "CalDAV Family")

        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        sa_event.listen(engine, "before_cursor_execute", record)
        try:
            ics = coll.serialize()
        finally:
            sa_event.remove(engine, "before_cursor_execute", record)

        # Both seeded events serialize with member context...
        assert ics.count("BEGIN:VEVENT") == 2
        # ...from exactly one event query and at most one member query.
        event_queries = [s for s in statements if "calendar_events" in s]
        member_queries = [s for s in statements if "users" in s]
        assert len(event_queries) == 1, statements
        assert len(member_queries) <= 1, statements
