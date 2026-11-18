"""Who may set "remind only me" on an event, and which writes keep it.

Covers the REST API (create, read, update, changed occurrences), ICS
import and CalDAV writes.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import CalendarEvent, Contact, Family, Membership, PersonalAccessToken, User
from tests.support import add_member, auth, dav_basic, delete_production_rows


SCOPES = "calendar:read,calendar:write,contacts:read,contacts:write"


@pytest.fixture(scope="module")
def client(dav_app):
    return TestClient(dav_app)


@pytest.fixture
def family(client):
    """Two adults, Anna (creates events) and Ben; yields ids and tokens."""
    people = {}
    family_id = None
    with SessionLocal() as db:
        for name in ("anna", "ben"):
            email = f"{name}-remind@example.com"
            member = add_member(db, email, scopes=SCOPES, family_id=family_id, family_name="Remind family", display_name=name.title())
            family_id = member.family_id
            people[name] = {"id": member.user_id, "token": member.token, "email": email}
        db.commit()
    yield {"family_id": family_id, **people}
    delete_production_rows(CalendarEvent, Contact, PersonalAccessToken, Membership, User, Family)


def _auth(person: dict) -> dict:
    return auth(person["token"])


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
    return {"Authorization": dav_basic(person["email"], person["token"]), "Content-Type": "text/calendar"}


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


def _calendar_rows(family_id: int) -> list[CalendarEvent]:
    db = SessionLocal()
    try:
        return db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).order_by(CalendarEvent.id).all()
    finally:
        db.close()


def test_a_phone_editing_an_event_made_in_tribu_updates_it_in_place(client, family):
    """Events made in Tribu are served at tribu-event-<id>.ics. A phone
    that GETs one and PUTs it back changes that event; it must not create
    a copy that belongs to the phone's user and reminds everyone."""
    anna, ben = family["anna"], family["ben"]
    event = _create(client, family, title="Dentist", remind_only_creator=True)
    path = f"/dav/{ben['email']}/cal-{family['family_id']}/tribu-event-{event['id']}.ics"
    headers = _basic(ben)

    got = client.get(path, headers={"Authorization": headers["Authorization"]})
    assert got.status_code == 200, got.text
    assert "SUMMARY:Dentist" in got.text
    edited = got.text.replace("SUMMARY:Dentist", "SUMMARY:Dentist (moved)")
    put = client.put(path, headers=headers, content=edited)
    assert put.status_code in (201, 204), put.text

    rows = _calendar_rows(family["family_id"])
    assert [(r.id, r.title, r.created_by_user_id, r.remind_only_creator) for r in rows] == [
        (event["id"], "Dentist (moved)", anna["id"], True),
    ]
    # Still served at the same URL, and a second round trip stays in place.
    again = client.get(path, headers={"Authorization": headers["Authorization"]})
    assert again.status_code == 200, again.text
    put = client.put(path, headers=headers, content=again.text.replace("Dentist (moved)", "Dentist (later)"))
    assert put.status_code in (201, 204), put.text
    assert [(r.id, r.title) for r in _calendar_rows(family["family_id"])] == [(event["id"], "Dentist (later)")]

    deleted = client.request("DELETE", path, headers={"Authorization": headers["Authorization"]})
    assert deleted.status_code in (200, 204), deleted.text
    assert _calendar_rows(family["family_id"]) == []


def test_a_phone_editing_a_contact_made_in_tribu_updates_it_in_place(client, family):
    db = SessionLocal()
    try:
        contact = Contact(family_id=family["family_id"], full_name="Oma Erika", phone="+49 30 1234")
        db.add(contact)
        db.commit()
        contact_id = contact.id
    finally:
        db.close()
    ben = family["ben"]
    path = f"/dav/{ben['email']}/book-{family['family_id']}/tribu-contact-{contact_id}.vcf"
    auth = {"Authorization": _basic(ben)["Authorization"]}

    got = client.get(path, headers=auth)
    assert got.status_code == 200, got.text
    put = client.put(path, headers={**auth, "Content-Type": "text/vcard"}, content=got.text.replace("Oma Erika", "Oma Erika B."))
    assert put.status_code in (201, 204), put.text

    db = SessionLocal()
    try:
        rows = db.query(Contact).filter(Contact.family_id == family["family_id"]).all()
        assert [(r.id, r.full_name) for r in rows] == [(contact_id, "Oma Erika B.")]
    finally:
        db.close()


def test_a_changed_occurrence_from_a_reimport_keeps_the_series_owner(client, family):
    """Anna imports a series and has only herself reminded. Ben re-imports
    the feed, which now changes one occurrence. That occurrence is part of
    Anna's event: the API shows Anna and the setting for it, and Ben can
    still edit its title."""
    anna, ben = family["anna"], family["ben"]
    series = (
        "BEGIN:VEVENT\r\nUID:club-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
        "DTSTART:20261202T180000\r\nDTEND:20261202T190000\r\nRRULE:FREQ=WEEKLY\r\n"
        "SUMMARY:Club\r\nEND:VEVENT\r\n"
    )
    changed = (
        "BEGIN:VEVENT\r\nUID:club-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
        "RECURRENCE-ID:20261209T180000\r\n"
        "DTSTART:20261210T180000\r\nDTEND:20261210T190000\r\n"
        "SUMMARY:Club (moved)\r\nEND:VEVENT\r\n"
    )
    wrap = lambda *parts: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Club//EN\r\n" + "".join(parts) + "END:VCALENDAR\r\n"
    payload = {"family_id": family["family_id"], "ics_text": wrap(series), "source_name": "Club"}
    assert client.post("/calendar/events/import-ics", json=payload, headers=_auth(anna)).status_code == 200
    series_id = _calendar_rows(family["family_id"])[0].id
    on = client.patch(f"/calendar/events/{series_id}", json={"remind_only_creator": True}, headers=_auth(anna))
    assert on.status_code == 200, on.text

    payload["ics_text"] = wrap(series, changed)
    assert client.post("/calendar/events/import-ics", json=payload, headers=_auth(ben)).status_code == 200
    changed_row = next(r for r in _calendar_rows(family["family_id"]) if r.recurrence_id is not None)
    assert (changed_row.created_by_user_id, changed_row.remind_only_creator) == (anna["id"], True)

    for query in ("", "&range_start=2026-12-01T00:00:00&range_end=2026-12-31T00:00:00"):
        listed = client.get(f"/calendar/events?family_id={family['family_id']}{query}", headers=_auth(ben))
        moved = [item for item in listed.json()["items"] if item["title"] == "Club (moved)"]
        assert moved and all(
            (item["created_by_user_id"], item["remind_only_creator"]) == (anna["id"], True) for item in moved
        ), moved

    edited = client.patch(f"/calendar/events/{changed_row.id}", json={"title": "Club (hall B)"}, headers=_auth(ben))
    assert edited.status_code == 200, edited.text
    assert (edited.json()["created_by_user_id"], edited.json()["remind_only_creator"]) == (anna["id"], True)


def test_responses_show_the_series_owner_for_rows_stored_before(client, family):
    """A changed occurrence stored with someone else as creator (as older
    imports and DAV writes did) is shown with the series' creator and
    setting, so the dialog offers the toggle only to the series' creator."""
    series_id, changed_id = _series_with_changed_occurrence(family)
    on = client.patch(f"/calendar/events/{series_id}", json={"remind_only_creator": True}, headers=_auth(family["anna"]))
    assert on.status_code == 200, on.text
    db = SessionLocal()
    try:
        db.query(CalendarEvent).filter(CalendarEvent.id == changed_id).update({"remind_only_creator": False})
        db.commit()
    finally:
        db.close()

    listed = client.get(f"/calendar/events?family_id={family['family_id']}", headers=_auth(family["ben"]))
    changed = next(item for item in listed.json()["items"] if item["id"] == changed_id)
    assert (changed["created_by_user_id"], changed["remind_only_creator"]) == (family["anna"]["id"], True)


INVITATION = (
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mail//EN\r\n"
    "BEGIN:VEVENT\r\nUID:invite-remind@example.com\r\nDTSTAMP:20260101T000000Z\r\n"
    "RECURRENCE-ID:20261209T180000\r\n"
    "DTSTART:20261210T180000\r\nDTEND:20261210T190000\r\n"
    "SUMMARY:{title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
)


def _snapshot(family_id: int) -> list[tuple]:
    return [
        (r.id, r.title, r.ical_uid, r.recurrence_id, r.dav_href, r.created_by_user_id, r.remind_only_creator, r.updated_at)
        for r in _calendar_rows(family_id)
    ]


def test_a_put_through_tribu_href_never_touches_a_lone_changed_occurrence(client, family):
    """An imported invitation to one occurrence has no series row and is
    served at tribu-event-<id>.ics. Writing it back there is refused, the
    same way a UID conflict is, and nothing is deleted or changed."""
    anna, ben = family["anna"], family["ben"]
    imported = client.post(
        "/calendar/events/import-ics",
        json={"family_id": family["family_id"], "ics_text": INVITATION.format(title="Invitation"), "source_name": "Mail"},
        headers=_auth(anna),
    )
    assert imported.status_code == 200, imported.text
    [row] = _calendar_rows(family["family_id"])
    assert row.recurrence_id is not None and row.dav_href is None
    before = _snapshot(family["family_id"])
    auth = {"Authorization": _basic(ben)["Authorization"]}
    path = f"/dav/{ben['email']}/cal-{family['family_id']}/tribu-event-{row.id}.ics"

    got = client.get(path, headers=auth)
    assert got.status_code == 200, got.text
    refused = client.put(path, headers=_basic(ben), content=got.text.replace("SUMMARY:Invitation", "SUMMARY:Changed"))

    # Refused like the UID guard refused it before Tribu hrefs were
    # resolved on PUT: a bad request, with nothing written.
    assert refused.status_code == 400, refused.text
    assert _snapshot(family["family_id"]) == before
    assert client.get(path, headers=auth).text == got.text


def test_occurrence_cleanup_never_removes_the_row_being_written(client, family):
    """The cleanup of omitted changed occurrences skips the row the PUT
    writes, even when that row is itself a changed occurrence."""
    from app.dav.caldav_storage import CalendarCollection

    db = SessionLocal()
    try:
        row = CalendarEvent(
            family_id=family["family_id"], title="Invitation", starts_at=datetime(2026, 12, 10, 18, 0), all_day=False,
            ical_uid="lone-remind@example.com", recurrence_id=datetime(2026, 12, 9, 18, 0),
        )
        db.add(row)
        db.commit()
        collection = CalendarCollection(None, family["anna"]["email"], family["family_id"], "Remind family")
        collection._store_changed_occurrences(db, row, [])
        db.commit()
        row_id = row.id
    finally:
        db.close()

    assert [r.id for r in _calendar_rows(family["family_id"])] == [row_id]
