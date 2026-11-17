"""Muting an event's reminder through the API and from a push button.

Covers PUT/DELETE /calendar/events/{id}/reminder-mute, the state in event
lists, who may mute (children and members without edit rights too, never
another family), the token scopes, and the "Don't remind me" push action.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import notification_actions
from app.core.push import _fcm_message
from app.database import Base, get_db
from app.main import app
from app.models import (
    CalendarEvent,
    EventReminderMute,
    Family,
    Membership,
    PersonalAccessToken,
    PushSubscription,
    User,
)
from app.security import PAT_PREFIX, hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False)

ALL_SCOPES = "calendar:read,calendar:write,profile:read,profile:write"


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


client = TestClient(app)


def _pat(db, user_id: int, name: str, scopes: str) -> str:
    plain = f"{PAT_PREFIX}mute-{name}"
    digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    db.add(PersonalAccessToken(user_id=user_id, name=name, token_hash=digest, token_lookup=digest, scopes=scopes))
    return plain


@pytest.fixture
def family():
    """Anna (adult, creates events), Ben (adult), Cleo (child) and Olga from
    another family; yields ids, a full token each and limited tokens."""
    with TestSession() as db:
        home = Family(name="Home")
        other = Family(name="Other")
        db.add_all([home, other])
        db.flush()
        people = {"family_id": home.id}
        for name, fam, adult in (("anna", home, True), ("ben", home, True), ("cleo", home, False), ("olga", other, True)):
            user = User(email=f"{name}-mute@example.com", password_hash=hash_password("p"), display_name=name.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=fam.id, role="admin" if adult else "member", is_adult=adult))
            people[name] = {"id": user.id, "token": _pat(db, user.id, name, ALL_SCOPES)}
        people["read_only"] = _pat(db, people["ben"]["id"], "ben-read", "calendar:read")
        people["profile_only"] = _pat(db, people["ben"]["id"], "ben-profile", "profile:write")
        people["read_profile"] = _pat(db, people["ben"]["id"], "ben-read-profile", "calendar:read,profile:write")
        db.commit()
        yield people


def _auth(token) -> dict:
    return {"Authorization": f"Bearer {token['token'] if isinstance(token, dict) else token}"}


def _event(family, **fields) -> int:
    with TestSession() as db:
        values = {
            "family_id": family["family_id"], "title": "Dentist", "starts_at": datetime(2026, 12, 1, 9, 0),
            "all_day": False, "created_by_user_id": family["anna"]["id"], **fields,
        }
        row = CalendarEvent(**values)
        db.add(row)
        db.commit()
        return row.id


def _put(family, person, event_id, **body):
    return client.put(f"/calendar/events/{event_id}/reminder-mute", json=body, headers=_auth(family[person]))


def _delete(family, person, event_id, occurrence_start=None):
    params = {"occurrence_start": occurrence_start} if occurrence_start else None
    return client.delete(f"/calendar/events/{event_id}/reminder-mute", params=params, headers=_auth(family[person]))


def _ranged(family, person) -> list[dict]:
    resp = client.get(
        f"/calendar/events?family_id={family['family_id']}"
        "&range_start=2026-11-30T00:00:00&range_end=2026-12-16T00:00:00",
        headers=_auth(family[person]),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


def _mutes() -> set[tuple]:
    with TestSession() as db:
        return {(m.user_id, m.event_id, m.occurrence_start) for m in db.query(EventReminderMute)}


def test_mute_and_unmute_a_single_event(family):
    event_id = _event(family)

    resp = _put(family, "ben", event_id)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"event_id": event_id, "occurrence_start": None, "reminder_muted": "series"}
    # A single event is muted as a whole, whatever scope was asked for.
    assert _put(family, "ben", event_id, scope="occurrence").json()["reminder_muted"] == "series"
    assert _mutes() == {(family["ben"]["id"], event_id, None)}

    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == ["series"]
    # Only Ben's own state shows; Anna still gets the reminder.
    assert [item["reminder_muted"] for item in _ranged(family, "anna")] == [None]
    unranged = client.get(f"/calendar/events?family_id={family['family_id']}", headers=_auth(family["ben"]))
    assert unranged.json()["items"][0]["reminder_muted"] == "series"

    resp = _delete(family, "ben", event_id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["reminder_muted"] is None
    assert _mutes() == set()
    # Taking part is untouched throughout.
    assert _ranged(family, "ben")[0]["assigned_to"] is None


def test_mute_one_occurrence_or_the_whole_series(family):
    event_id = _event(family, recurrence="weekly")

    resp = _put(family, "ben", event_id, scope="occurrence", occurrence_start="2026-12-08T09:00:00")
    assert resp.status_code == 200, resp.text
    assert resp.json()["reminder_muted"] == "occurrence"
    assert [(item["starts_at"], item["reminder_muted"]) for item in _ranged(family, "ben")] == [
        ("2026-12-01T09:00:00", None),
        ("2026-12-08T09:00:00", "occurrence"),
        ("2026-12-15T09:00:00", None),
    ]

    assert _put(family, "ben", event_id, scope="series").json()["reminder_muted"] == "series"
    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == ["series"] * 3

    # Choosing "only this one" afterwards brings the others back.
    _put(family, "ben", event_id, scope="occurrence", occurrence_start="2026-12-15T09:00:00")
    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == [None, "occurrence", "occurrence"]

    # Reminding again for one occurrence leaves the other muted one.
    resp = _delete(family, "ben", event_id, "2026-12-08T09:00:00")
    assert resp.json()["reminder_muted"] is None
    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == [None, None, "occurrence"]

    # Without an occurrence every mute of the series goes.
    _put(family, "ben", event_id, scope="series")
    _delete(family, "ben", event_id)
    assert _mutes() == set()


def test_an_occurrence_needs_a_real_start(family):
    event_id = _event(family, recurrence="weekly")

    missing = _put(family, "ben", event_id, scope="occurrence")
    assert missing.status_code == 400
    assert missing.json()["detail"]["code"] == "EVENT_OCCURRENCE_NOT_FOUND"
    wrong = _put(family, "ben", event_id, scope="occurrence", occurrence_start="2026-12-09T09:00:00")
    assert wrong.status_code == 400
    assert _put(family, "ben", event_id, scope="whatever").status_code == 422
    assert _mutes() == set()


def test_an_instant_with_offset_is_read_as_local_time(family, monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Berlin")
    from app.core.clock import app_timezone

    app_timezone.cache_clear()
    try:
        event_id = _event(family, recurrence="daily")
        resp = _put(family, "ben", event_id, scope="occurrence", occurrence_start="2026-12-02T08:00:00Z")
        assert resp.status_code == 200, resp.text
        assert _mutes() == {(family["ben"]["id"], event_id, datetime(2026, 12, 2, 9, 0))}
    finally:
        app_timezone.cache_clear()


def test_a_changed_occurrence_is_muted_on_its_series(family):
    series_id = _event(family, recurrence="weekly", ical_uid="choir@example.com")
    moved_id = _event(
        family, title="Dentist (moved)", ical_uid="choir@example.com",
        recurrence_id=datetime(2026, 12, 8, 9, 0), starts_at=datetime(2026, 12, 9, 17, 0),
    )

    resp = _put(family, "ben", moved_id, scope="occurrence")
    assert resp.status_code == 200, resp.text
    assert _mutes() == {(family["ben"]["id"], series_id, datetime(2026, 12, 8, 9, 0))}
    states = {(item["id"], item["starts_at"]): item["reminder_muted"] for item in _ranged(family, "ben")}
    assert states == {
        (series_id, "2026-12-01T09:00:00"): None,
        (moved_id, "2026-12-09T17:00:00"): "occurrence",
        (series_id, "2026-12-15T09:00:00"): None,
    }

    _put(family, "ben", moved_id, scope="series")
    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == ["series"] * 3
    # Reminding again from the changed occurrence lifts the series mute too.
    _delete(family, "ben", moved_id)
    assert [item["reminder_muted"] for item in _ranged(family, "ben")] == [None] * 3
    assert _mutes() == set()


def test_children_and_members_without_edit_rights_can_mute(family):
    event_id = _event(family, recurrence="weekly")
    # Cleo cannot edit events ...
    denied = client.patch(f"/calendar/events/{event_id}", json={"title": "Mine"}, headers=_auth(family["cleo"]))
    assert denied.status_code == 403
    # ... but can take herself off the reminder.
    resp = _put(family, "cleo", event_id, scope="series")
    assert resp.status_code == 200, resp.text
    assert _delete(family, "cleo", event_id).status_code == 200
    # So can Ben, who did not create the event.
    assert _put(family, "ben", event_id, scope="series").status_code == 200


def test_another_family_cannot_mute_or_see_it(family):
    event_id = _event(family)

    put = _put(family, "olga", event_id)
    assert put.status_code == 403
    assert put.json()["detail"]["code"] == "NO_FAMILY_ACCESS"
    assert _delete(family, "olga", event_id).status_code == 403
    assert _put(family, "ben", 999999).status_code == 404
    assert _mutes() == set()


def test_token_scopes(family):
    event_id = _event(family)
    url = f"/calendar/events/{event_id}/reminder-mute"

    # Reading the event is not enough to change a notification setting ...
    read_only = client.put(url, json={}, headers=_auth(family["read_only"]))
    assert read_only.status_code == 403
    assert read_only.json()["detail"]["code"] == "INSUFFICIENT_SCOPE"
    # ... and a notification setting alone does not reveal the calendar.
    assert client.put(url, json={}, headers=_auth(family["profile_only"])).status_code == 403
    assert client.delete(url, headers=_auth(family["read_only"])).status_code == 403

    assert client.put(url, json={}, headers=_auth(family["read_profile"])).status_code == 200
    assert client.delete(url, headers=_auth(family["read_profile"])).status_code == 200
    # The mute state in the event list needs only calendar:read.
    listed = client.get(f"/calendar/events?family_id={family['family_id']}", headers=_auth(family["read_only"]))
    assert listed.status_code == 200


def test_openapi_documents_the_endpoints(family):
    spec = client.get("/openapi.json").json()
    path = spec["paths"]["/calendar/events/{event_id}/reminder-mute"]
    assert {"put", "delete"} <= set(path)
    assert "calendar:read" in path["put"]["description"] and "profile:write" in path["put"]["description"]
    assert "reminder_muted" in spec["components"]["schemas"]["CalendarEventResponse"]["properties"]


# ── Push button ──────────────────────────────────────────────────────────


def _token(family, event_id: int, link: str, end: datetime | None = None, person: str = "ben") -> str:
    return notification_actions.create_action_token(
        user_id=family[person]["id"], family_id=family["family_id"], source_type="event", source_id=event_id,
        notification_type="event_reminder", title="Dentist", body="Starts at 09:00", link=link, expires_at=end,
    )


def test_push_button_mutes_a_single_event(family):
    event_id = _event(family)
    link = f"/calendar?event={event_id}&at=2026-12-01T09:00:00"
    options = notification_actions.reminder_push_actions(
        family["ben"]["id"], family["family_id"], "event", event_id, "event_reminder", "Dentist", "Starts at 09:00",
        link, "de", expires_at=datetime(2026, 12, 1, 9, 0),
    )
    assert options["actions"] == ("snooze", "mute")
    assert options["action_labels"]["mute"] == "Nicht mehr erinnern"
    assert "action_urls" not in options

    resp = client.post("/notifications/actions", json={"token": options["action_token"], "action": "mute"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["reminder_muted"] == "series"
    # Only Ben, only this event.
    assert _mutes() == {(family["ben"]["id"], event_id, None)}


def test_push_button_for_a_series_opens_the_choice_instead(family):
    event_id = _event(family, recurrence="weekly")
    link = f"/calendar?event={event_id}&at=2026-12-08T09:00:00&repeats=1"
    options = notification_actions.reminder_push_actions(
        family["ben"]["id"], family["family_id"], "event", event_id, "event_reminder", "Dentist", "Starts at 09:00",
        link, "en", expires_at=datetime(2026, 12, 8, 9, 0),
    )
    assert options["actions"] == ("snooze", "mute")
    assert options["action_urls"] == {"mute": f"{link}&mute=choose"}

    # The token itself cannot mute anything of a series.
    resp = client.post("/notifications/actions", json={"token": options["action_token"], "action": "mute"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ACTION_NOT_ALLOWED"
    assert client.post("/notifications/actions", json={"token": options["action_token"], "action": "snooze"}).status_code == 200
    assert _mutes() == set()


def test_a_single_event_turned_series_mutes_only_the_reminded_occurrence(family):
    event_id = _event(family)
    token = _token(family, event_id, f"/calendar?event={event_id}&at=2026-12-01T09:00:00", end=datetime(2026, 12, 1, 9, 0))
    with TestSession() as db:
        db.get(CalendarEvent, event_id).recurrence = "weekly"
        db.commit()

    resp = client.post("/notifications/actions", json={"token": token, "action": "mute"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["reminder_muted"] == "occurrence"
    assert _mutes() == {(family["ben"]["id"], event_id, datetime(2026, 12, 1, 9, 0))}


def test_push_mute_stays_in_the_tokens_family_and_event(family):
    event_id = _event(family)
    # Olga's token names her family; Anna's event is not there.
    token = _token(family, event_id, f"/calendar?event={event_id}&at=2026-12-01T09:00:00", person="olga")
    with TestSession() as db:
        olga = db.get(User, family["olga"]["id"])
        olga_family = db.query(Membership).filter(Membership.user_id == olga.id).one().family_id
    forged = notification_actions.create_action_token(
        user_id=family["olga"]["id"], family_id=olga_family, source_type="event", source_id=event_id,
        notification_type="event_reminder", title="Dentist", body="", link=f"/calendar?event={event_id}&at=2026-12-01T09:00:00",
    )
    assert client.post("/notifications/actions", json={"token": token, "action": "mute"}).status_code == 401
    gone = client.post("/notifications/actions", json={"token": forged, "action": "mute"})
    assert gone.status_code == 404
    assert gone.json()["detail"]["code"] == "ACTION_GONE"
    assert _mutes() == set()


def test_apps_only_get_the_buttons_they_know(family, monkeypatch):
    from app.core import push as push_module

    sent_fcm = []
    monkeypatch.setattr(push_module, "is_fcm_configured", lambda: True)
    monkeypatch.setattr(
        push_module, "_send_fcm_push",
        lambda token, title, body, url, **kwargs: sent_fcm.append(kwargs) or (True, None, False),
    )
    with TestSession() as db:
        db.add(PushSubscription(user_id=family["ben"]["id"], endpoint="fcm-token", p256dh="", auth="", platform="fcm", supports_actions=True))
        db.commit()
        push_module.send_push_for_user(
            db, family["ben"]["id"], "Dentist", "Starts at 09:00", "/calendar?event=1",
            actions=("snooze", "mute"), action_token="tok", action_labels={"snooze": "Later", "mute": "Mute"},
        )
    assert sent_fcm[0]["actions"] == ("snooze",)
    # So iOS keeps the category it has registered.
    assert _fcm_message("t", "Dentist", "", "/calendar", ("snooze",), "tok")["apns"]["payload"]["aps"]["category"] == "tribu_snooze"


def test_web_push_carries_the_link_of_an_opening_button(family, monkeypatch):
    import sys
    import types

    from app.core import push as push_module

    sent = []
    fake = types.ModuleType("pywebpush")
    fake.webpush = lambda **kwargs: sent.append(json.loads(kwargs["data"]))
    fake.WebPushException = Exception
    monkeypatch.setitem(sys.modules, "pywebpush", fake)
    monkeypatch.setattr(push_module, "get_vapid_public_key", lambda: "pub")
    monkeypatch.setattr(push_module, "get_vapid_private_key", lambda: "priv")
    monkeypatch.setattr(push_module, "get_vapid_claim_subject", lambda: "mailto:a@b.c")
    with TestSession() as db:
        db.add(PushSubscription(user_id=family["ben"]["id"], endpoint="https://push.example/1", p256dh="k", auth="a", platform="web"))
        db.commit()
        push_module.send_push_for_user(
            db, family["ben"]["id"], "Dentist", "Starts at 09:00", "/calendar?event=1&at=x&repeats=1",
            actions=("snooze", "mute"), action_token="tok", action_labels={"snooze": "Later", "mute": "Mute"},
            action_urls={"mute": "/calendar?event=1&at=x&repeats=1&mute=choose"},
        )
    assert sent[0]["actions"] == [{"action": "snooze", "title": "Later"}, {"action": "mute", "title": "Mute"}]
    assert sent[0]["action_urls"] == {"mute": "/calendar?event=1&at=x&repeats=1&mute=choose"}
