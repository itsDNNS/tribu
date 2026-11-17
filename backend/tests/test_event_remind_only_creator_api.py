"""Who may set "remind only me" on an event, and which writes keep it.

Covers the REST API (create, read, update, changed occurrences), ICS
import and CalDAV writes.
"""

from __future__ import annotations

import base64
import hashlib
import os
import tempfile
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.models import CalendarEvent, Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


SCOPES = "calendar:read,calendar:write"


@pytest.fixture(scope="module")
def client():
    with tempfile.TemporaryDirectory(prefix="tribu-remind-only-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        from app.main import app

        Base.metadata.create_all(bind=engine)
        try:
            yield TestClient(app)
        finally:
            Base.metadata.drop_all(bind=engine)
            os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture
def family(client):
    """Two adults, Anna (creates events) and Ben; yields ids and tokens."""
    db = SessionLocal()
    try:
        fam = Family(name="Remind family")
        db.add(fam)
        db.flush()
        people = {}
        for name in ("anna", "ben"):
            user = User(email=f"{name}-remind@example.com", password_hash=hash_password("p"), display_name=name.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=fam.id, role="admin", is_adult=True))
            plain = f"{PAT_PREFIX}remind-{name}"
            digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
            db.add(PersonalAccessToken(user_id=user.id, name=f"{name}-pat", token_hash=digest, token_lookup=digest, scopes=SCOPES))
            people[name] = {"id": user.id, "token": plain, "email": user.email}
        db.commit()
        yield {"family_id": fam.id, **people}
    finally:
        db.close()
        db = SessionLocal()
        try:
            db.query(CalendarEvent).delete()
            db.query(PersonalAccessToken).delete()
            db.query(Membership).delete()
            db.query(User).delete()
            db.query(Family).delete()
            db.commit()
        finally:
            db.close()


def _auth(person: dict) -> dict:
    return {"Authorization": f"Bearer {person['token']}"}


def _create(client, family, person="anna", **fields) -> dict:
    payload = {"family_id": family["family_id"], "title": "Dentist", "starts_at": "2026-12-01T09:00:00", **fields}
    resp = client.post("/calendar/events", json=payload, headers=_auth(family[person]))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _row(event_id: int) -> CalendarEvent:
    db = SessionLocal()
    try:
        return db.query(CalendarEvent).filter(CalendarEvent.id == event_id).one()
    finally:
        db.close()


def test_new_events_remind_everyone_by_default(client, family):
    event = _create(client, family)
    assert event["remind_only_creator"] is False
    assert _row(event["id"]).remind_only_creator is False


def test_creator_sets_it_and_everyone_can_read_it(client, family):
    event = _create(client, family, remind_only_creator=True)
    assert event["remind_only_creator"] is True
    assert event["created_by_user_id"] == family["anna"]["id"]

    for person in ("anna", "ben"):
        listed = client.get(f"/calendar/events?family_id={family['family_id']}", headers=_auth(family[person]))
        assert listed.status_code == 200, listed.text
        assert listed.json()["items"][0]["remind_only_creator"] is True
        ranged = client.get(
            f"/calendar/events?family_id={family['family_id']}"
            "&range_start=2026-11-01T00:00:00&range_end=2027-01-01T00:00:00",
            headers=_auth(family[person]),
        )
        assert ranged.json()["items"][0]["remind_only_creator"] is True


def test_someone_else_cannot_change_it(client, family):
    event = _create(client, family, remind_only_creator=True)

    denied = client.patch(f"/calendar/events/{event['id']}", json={"remind_only_creator": False}, headers=_auth(family["ben"]))
    assert denied.status_code == 403, denied.text
    assert denied.json()["detail"]["code"] == "EVENT_REMINDER_CREATOR_ONLY"
    assert _row(event["id"]).remind_only_creator is True

    # Nothing else of the edit is saved either.
    denied = client.patch(
        f"/calendar/events/{event['id']}",
        json={"title": "Changed", "remind_only_creator": False},
        headers=_auth(family["ben"]),
    )
    assert denied.status_code == 403
    assert _row(event["id"]).title == "Dentist"

    other = _create(client, family)
    denied = client.patch(f"/calendar/events/{other['id']}", json={"remind_only_creator": True}, headers=_auth(family["ben"]))
    assert denied.status_code == 403
    assert _row(other["id"]).remind_only_creator is False


def test_someone_else_can_edit_the_event_without_touching_it(client, family):
    event = _create(client, family, remind_only_creator=True)

    # Leaving it out or sending the current value back is fine.
    for payload in ({"title": "Dentist (moved)"}, {"location": "Main street", "remind_only_creator": True}, {"remind_only_creator": None}):
        resp = client.patch(f"/calendar/events/{event['id']}", json=payload, headers=_auth(family["ben"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["remind_only_creator"] is True

    row = _row(event["id"])
    assert row.title == "Dentist (moved)"
    assert row.location == "Main street"
    assert row.remind_only_creator is True


def test_creator_can_switch_it_both_ways(client, family):
    event = _create(client, family)

    on = client.patch(f"/calendar/events/{event['id']}", json={"remind_only_creator": True}, headers=_auth(family["anna"]))
    assert on.status_code == 200, on.text
    assert on.json()["remind_only_creator"] is True

    off = client.patch(f"/calendar/events/{event['id']}", json={"remind_only_creator": False}, headers=_auth(family["anna"]))
    assert off.status_code == 200, off.text
    assert off.json()["remind_only_creator"] is False


def test_nobody_can_change_it_once_the_creator_is_gone(client, family):
    event = _create(client, family, remind_only_creator=True)
    db = SessionLocal()
    try:
        db.query(CalendarEvent).filter(CalendarEvent.id == event["id"]).update({"created_by_user_id": None})
        db.commit()
    finally:
        db.close()

    resp = client.patch(f"/calendar/events/{event['id']}", json={"remind_only_creator": False}, headers=_auth(family["ben"]))
    assert resp.status_code == 403


def test_a_duplicate_belongs_to_whoever_creates_it(client, family):
    """Duplicating is a create, so Ben's copy can remind only Ben."""
    _create(client, family, remind_only_creator=True)
    copy = _create(client, family, person="ben", remind_only_creator=True)
    assert copy["created_by_user_id"] == family["ben"]["id"]
    assert copy["remind_only_creator"] is True


def test_openapi_describes_the_field(client):
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    for name in ("CalendarEventCreate", "CalendarEventUpdate", "CalendarEventResponse"):
        field = schemas[name]["properties"]["remind_only_creator"]
        assert "creator" in field["description"]


# ── Changed occurrences ───────────────────────────────────────────


def _series_with_changed_occurrence(family) -> tuple[int, int]:
    """Anna's weekly series with one occurrence changed by Ben over CalDAV."""
    db = SessionLocal()
    try:
        series = CalendarEvent(
            family_id=family["family_id"], title="Choir", starts_at=datetime(2026, 12, 2, 18, 0), all_day=False,
            recurrence="weekly", ical_uid="choir-remind@example.com", dav_href="choir.ics",
            created_by_user_id=family["anna"]["id"],
        )
        changed = CalendarEvent(
            family_id=family["family_id"], title="Choir (moved)", starts_at=datetime(2026, 12, 10, 18, 0), all_day=False,
            ical_uid="choir-remind@example.com", recurrence_id=datetime(2026, 12, 9, 18, 0),
            created_by_user_id=family["ben"]["id"],
        )
        db.add_all([series, changed])
        db.commit()
        return series.id, changed.id
    finally:
        db.close()


def test_the_setting_of_a_changed_occurrence_is_the_series_setting(client, family):
    series_id, changed_id = _series_with_changed_occurrence(family)

    # Ben wrote the changed occurrence, but the series is Anna's.
    denied = client.patch(f"/calendar/events/{changed_id}", json={"remind_only_creator": True}, headers=_auth(family["ben"]))
    assert denied.status_code == 403

    on = client.patch(f"/calendar/events/{changed_id}", json={"remind_only_creator": True}, headers=_auth(family["anna"]))
    assert on.status_code == 200, on.text
    assert on.json()["remind_only_creator"] is True
    assert _row(series_id).remind_only_creator is True
    assert _row(changed_id).remind_only_creator is True

    off = client.patch(f"/calendar/events/{series_id}", json={"remind_only_creator": False}, headers=_auth(family["anna"]))
    assert off.status_code == 200, off.text
    assert _row(changed_id).remind_only_creator is False


# ── ICS import ────────────────────────────────────────────────────


def _ics(summary: str) -> str:
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n"
        "BEGIN:VEVENT\r\nUID:school-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
        "DTSTART:20261203T080000\r\nDTEND:20261203T090000\r\n"
        f"SUMMARY:{summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )


def test_ics_import_reminds_everyone_and_a_reimport_keeps_the_setting(client, family):
    payload = {"family_id": family["family_id"], "ics_text": _ics("School trip"), "source_name": "School"}
    imported = client.post("/calendar/events/import-ics", json=payload, headers=_auth(family["anna"]))
    assert imported.status_code == 200, imported.text
    db = SessionLocal()
    try:
        row = db.query(CalendarEvent).filter(CalendarEvent.ical_uid == "school-remind@example.com").one()
        event_id = row.id
        assert row.remind_only_creator is False
    finally:
        db.close()

    on = client.patch(f"/calendar/events/{event_id}", json={"remind_only_creator": True}, headers=_auth(family["anna"]))
    assert on.status_code == 200, on.text

    payload["ics_text"] = _ics("School trip (new time)")
    again = client.post("/calendar/events/import-ics", json=payload, headers=_auth(family["anna"]))
    assert again.status_code == 200, again.text
    assert again.json()["updated"] == 1
    row = _row(event_id)
    assert row.title == "School trip (new time)"
    assert row.remind_only_creator is True


# ── CalDAV ────────────────────────────────────────────────────────


def _basic(person: dict) -> dict:
    raw = f"{person['email']}:{person['token']}".encode("utf-8")
    return {"Authorization": "Basic " + base64.b64encode(raw).decode("ascii"), "Content-Type": "text/calendar"}


def _dav_event(summary: str, *changed: str) -> str:
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Phone//EN\r\n"
        "BEGIN:VEVENT\r\nUID:gym-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
        "DTSTART:20261202T070000\r\nDTEND:20261202T080000\r\nRRULE:FREQ=WEEKLY\r\n"
        f"SUMMARY:{summary}\r\nEND:VEVENT\r\n" + "".join(changed) + "END:VCALENDAR\r\n"
    )


CHANGED_GYM = (
    "BEGIN:VEVENT\r\nUID:gym-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
    "RECURRENCE-ID:20261209T070000\r\n"
    "DTSTART:20261209T090000\r\nDTEND:20261209T100000\r\n"
    "SUMMARY:Gym (later)\r\nEND:VEVENT\r\n"
)


def test_dav_writes_never_reset_the_setting(client, family):
    anna, ben = family["anna"], family["ben"]
    path = f"/dav/{anna['email']}/cal-{family['family_id']}/gym.ics"
    created = client.put(path, headers=_basic(anna), content=_dav_event("Gym"))
    assert created.status_code in (201, 204), created.text
    db = SessionLocal()
    try:
        row = db.query(CalendarEvent).filter(CalendarEvent.dav_href == "gym.ics").one()
        series_id = row.id
        assert row.remind_only_creator is False
        assert row.created_by_user_id == anna["id"]
    finally:
        db.close()

    on = client.patch(f"/calendar/events/{series_id}", json={"remind_only_creator": True}, headers=_auth(anna))
    assert on.status_code == 200, on.text

    # Ben's phone writes the event back, knowing nothing of the setting,
    # and changes one occurrence.
    ben_path = f"/dav/{ben['email']}/cal-{family['family_id']}/gym.ics"
    rewritten = client.put(ben_path, headers=_basic(ben), content=_dav_event("Gym (renamed)", CHANGED_GYM))
    assert rewritten.status_code in (201, 204), rewritten.text

    db = SessionLocal()
    try:
        rows = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.ical_uid == "gym-remind@example.com")
            .order_by(CalendarEvent.id)
            .all()
        )
        assert [(r.title, r.remind_only_creator, r.created_by_user_id) for r in rows] == [
            ("Gym (renamed)", True, anna["id"]),
            # The changed occurrence is still part of Anna's series.
            ("Gym (later)", True, anna["id"]),
        ]
    finally:
        db.close()

    # A DAV client cannot set it: Tribu ignores unknown properties.
    sneaky = _dav_event("Gym (renamed)").replace("SUMMARY:", "X-TRIBU-REMIND-ONLY-CREATOR:FALSE\r\nSUMMARY:")
    assert client.put(ben_path, headers=_basic(ben), content=sneaky).status_code in (201, 204)
    assert _row(series_id).remind_only_creator is True
