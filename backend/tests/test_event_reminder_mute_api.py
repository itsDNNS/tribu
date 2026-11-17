"""Muting an event's reminder through the API and from a push button.

Covers PUT/DELETE /calendar/events/{id}/reminder-mute, the state in event
lists, who may mute (children and members without edit rights too, never
another family), the token scope, and the "Don't remind me" push action.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core import notification_actions
from app.main import app
from app.models import CalendarEvent, EventReminderMute, Notification, NotificationPreference, PersonalAccessToken, ReminderSnooze
from app.security import PAT_PREFIX
# reminder_db is a fixture.
from tests.reminder_support import TestSession, add_event, add_family, reminder_db

pytestmark = pytest.mark.usefixtures("reminder_db")

client = TestClient(app)
URL = "/calendar/events/{}/reminder-mute"
DEC_1 = datetime(2026, 12, 1, 9, 0)


@pytest.fixture
def family():
    """Anna, Ben and Cleo (a child) at home, Olga in another family; a
    token for each person and token scope."""
    family_id, (anna, ben, cleo) = add_family("Home")
    olga_family, (olga,) = add_family("Other", (("olga", True),))
    people = {"family_id": family_id, "olga_family": olga_family, "anna": anna, "ben": ben, "cleo": cleo, "olga": olga, "tokens": {}}
    with TestSession() as db:
        for name, user_id, scopes in (
            ("anna", anna, "calendar:read,calendar:write"), ("ben", ben, "calendar:read,calendar:write"),
            ("cleo", cleo, "calendar:read,calendar:write"), ("olga", olga, "calendar:read,calendar:write"),
            ("calendar:read", ben, "calendar:read"), ("profile:write", ben, "profile:write"),
            ("calendar:write", ben, "calendar:write"),
        ):
            plain = f"{PAT_PREFIX}mute-{name}"
            digest = hashlib.sha256(plain.encode()).hexdigest()
            db.add(PersonalAccessToken(user_id=user_id, name=name, token_hash=digest, token_lookup=digest, scopes=scopes))
            people["tokens"][name] = {"Authorization": f"Bearer {plain}"}
        db.commit()
    return people


def _event(family, **fields) -> int:
    return add_event(family["family_id"], **{"starts_at": DEC_1, "created_by_user_id": family["anna"], **fields})


def _put(family, event_id, person="ben", **body):
    return client.put(URL.format(event_id), json=body, headers=family["tokens"][person])


def _delete(family, event_id, occurrence_start=None, person="ben"):
    params = {"occurrence_start": occurrence_start} if occurrence_start else None
    return client.delete(URL.format(event_id), params=params, headers=family["tokens"][person])


def _listed(family, person="ben", ranged=True) -> list[dict]:
    query = "&range_start=2026-11-30T00:00:00&range_end=2026-12-16T00:00:00" if ranged else ""
    resp = client.get(f"/calendar/events?family_id={family['family_id']}{query}", headers=family["tokens"][person])
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


def _states(family, person="ben") -> list:
    return [item["reminder_muted"] for item in _listed(family, person)]


def _mutes() -> set[tuple]:
    with TestSession() as db:
        return {(m.user_id, m.event_id, m.occurrence_start) for m in db.query(EventReminderMute)}


def test_mute_and_unmute_a_single_event(family):
    event_id = _event(family)

    resp = _put(family, event_id)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"event_id": event_id, "occurrence_start": None, "reminder_muted": "series"}
    # A single event is muted as a whole, whatever scope was asked for.
    assert _put(family, event_id, scope="occurrence").json()["reminder_muted"] == "series"
    assert _mutes() == {(family["ben"], event_id, None)}
    assert _states(family) == ["series"]
    assert _listed(family, ranged=False)[0]["reminder_muted"] == "series"
    # Only Ben's own state shows; Anna still gets the reminder.
    assert _states(family, "anna") == [None]

    resp = _delete(family, event_id)
    assert (resp.status_code, resp.json()["reminder_muted"]) == (200, None)
    assert _mutes() == set()
    # Taking part is untouched throughout.
    assert _listed(family)[0]["assigned_to"] is None


def test_mute_one_occurrence_or_the_whole_series(family):
    event_id = _event(family, recurrence="weekly")

    resp = _put(family, event_id, scope="occurrence", occurrence_start="2026-12-08T09:00:00")
    assert (resp.status_code, resp.json()["reminder_muted"]) == (200, "occurrence")
    assert [(item["starts_at"], item["reminder_muted"]) for item in _listed(family)] == [
        ("2026-12-01T09:00:00", None), ("2026-12-08T09:00:00", "occurrence"), ("2026-12-15T09:00:00", None),
    ]
    assert _put(family, event_id, scope="series").json()["reminder_muted"] == "series"
    assert _states(family) == ["series"] * 3
    # Choosing "only this one" afterwards brings the others back.
    _put(family, event_id, scope="occurrence", occurrence_start="2026-12-15T09:00:00")
    assert _states(family) == [None, "occurrence", "occurrence"]
    # Reminding again for one occurrence leaves the other muted one.
    assert _delete(family, event_id, "2026-12-08T09:00:00").json()["reminder_muted"] is None
    assert _states(family) == [None, None, "occurrence"]
    # Without an occurrence every mute of the series goes.
    _put(family, event_id, scope="series")
    _delete(family, event_id)
    assert _mutes() == set()


@pytest.mark.parametrize(
    "body, status",
    [
        ({"scope": "occurrence"}, 400),
        ({"scope": "occurrence", "occurrence_start": "2026-12-09T09:00:00"}, 400),
        ({"scope": "whatever"}, 422),
    ],
    ids=["no occurrence", "not an occurrence", "unknown scope"],
)
def test_an_occurrence_needs_a_real_start(family, body, status):
    resp = _put(family, _event(family, recurrence="weekly"), **body)
    assert resp.status_code == status
    if status == 400:
        assert resp.json()["detail"]["code"] == "EVENT_OCCURRENCE_NOT_FOUND"
    assert _mutes() == set()


def test_an_instant_with_offset_is_read_as_local_time(family, monkeypatch):
    from app.core.clock import app_timezone

    monkeypatch.setenv("TZ", "Europe/Berlin")
    app_timezone.cache_clear()
    try:
        event_id = _event(family, recurrence="daily")
        assert _put(family, event_id, scope="occurrence", occurrence_start="2026-12-02T08:00:00Z").status_code == 200
        assert _mutes() == {(family["ben"], event_id, datetime(2026, 12, 2, 9, 0))}
    finally:
        app_timezone.cache_clear()


def test_a_changed_occurrence_is_muted_on_its_series(family):
    series_id = _event(family, recurrence="weekly", ical_uid="choir@example.com")
    moved_id = _event(family, ical_uid="choir@example.com", recurrence_id=datetime(2026, 12, 8, 9, 0), starts_at=datetime(2026, 12, 9, 17, 0))

    assert _put(family, moved_id, scope="occurrence").status_code == 200
    assert _mutes() == {(family["ben"], series_id, datetime(2026, 12, 8, 9, 0))}
    assert [(item["id"], item["starts_at"], item["reminder_muted"]) for item in _listed(family)] == [
        (series_id, "2026-12-01T09:00:00", None), (moved_id, "2026-12-09T17:00:00", "occurrence"),
        (series_id, "2026-12-15T09:00:00", None),
    ]
    _put(family, moved_id, scope="series")
    assert _states(family) == ["series"] * 3
    # Reminding again from the changed occurrence lifts the series mute too.
    _delete(family, moved_id)
    assert _states(family) == [None] * 3


@pytest.mark.parametrize(
    "person, method, status",
    [
        # Cleo cannot edit events but takes herself off the reminder; Ben did not create it.
        ("cleo", "put", 200), ("cleo", "delete", 200), ("ben", "put", 200),
        ("olga", "put", 403), ("olga", "delete", 403),
        # Reading the calendar is not enough, nor is a profile token; calendar:write is.
        ("calendar:read", "put", 403), ("calendar:read", "delete", 403), ("profile:write", "put", 403),
        ("calendar:write", "put", 200), ("calendar:write", "delete", 200),
    ],
)
def test_who_may_mute(family, person, method, status):
    event_id = _event(family, recurrence="weekly")
    resp = getattr(client, method)(URL.format(event_id), **({"json": {}} if method == "put" else {}), headers=family["tokens"][person])
    assert resp.status_code == status
    if status == 403:
        assert resp.json()["detail"]["code"] == ("NO_FAMILY_ACCESS" if person == "olga" else "INSUFFICIENT_SCOPE")
    if person == "cleo":
        assert client.patch(f"/calendar/events/{event_id}", json={"title": "Mine"}, headers=family["tokens"]["cleo"]).status_code == 403


def test_unknown_events_and_reading_the_state(family):
    assert _put(family, 999999).status_code == 404
    _event(family)
    # The state in the event list needs only calendar:read.
    assert _listed(family, "calendar:read", ranged=False)[0]["reminder_muted"] is None


def test_the_api_documents_it_and_ai_assistants_can_use_it():
    from app.core.mcp_catalog import build_catalog

    spec = client.get("/openapi.json").json()
    assert "`calendar:write`" in spec["paths"]["/calendar/events/{event_id}/reminder-mute"]["put"]["description"]
    assert "reminder_muted" in spec["components"]["schemas"]["CalendarEventResponse"]["properties"]
    catalog = build_catalog(app)
    ops = [op for op in catalog.allowed({"calendar:write"}) if op.path == "/calendar/events/{event_id}/reminder-mute"]
    assert {op.method for op in ops} == {"PUT", "DELETE"}
    assert not [op for op in catalog.allowed({"calendar:read"}) if op.path.endswith("/reminder-mute")]


def test_the_dashboard_does_not_claim_a_reminder_state(family):
    """The summary is cached for the whole family, so it leaves the personal
    state out instead of saying "not muted"; the calendar list has it."""
    soon = (datetime.now() + timedelta(days=2)).replace(hour=9, minute=0, second=0, microsecond=0)
    event_id = _event(family, starts_at=soon)
    _put(family, event_id)

    resp = client.get(f"/dashboard/summary?family_id={family['family_id']}", headers=family["tokens"]["ben"])
    assert resp.status_code == 200, resp.text
    assert [("reminder_muted" in item, item["id"]) for item in resp.json()["next_events"]] == [(False, event_id)]
    assert "reminder_muted" not in client.get("/openapi.json").json()["components"]["schemas"]["DashboardEventResponse"]["properties"]


# ── Push button ──────────────────────────────────────────────────────────


def _push(family, event_id: int, repeats: bool = False, person: str = "ben", fam: int | None = None, **token_fields) -> dict:
    """The buttons of Ben's reminder of ``event_id`` on DEC_1."""
    with TestSession() as db:
        created = db.get(CalendarEvent, event_id).created_at
    link = f"/calendar?event={event_id}&at=2026-12-01T09:00:00" + ("&repeats=1" if repeats else "")
    return notification_actions.reminder_push_actions(
        family[person], fam or family["family_id"], "event", event_id, "event_reminder", "Dentist", "Starts at 09:00",
        link, "de", **{"expires_at": DEC_1, "event_created_at": created, **token_fields},
    )


def _press(options: dict, action: str = "mute"):
    return client.post("/notifications/actions", json={"token": options["action_token"], "action": action})


def test_push_button_mutes_a_single_event(family):
    event_id = _event(family)
    options = _push(family, event_id)
    assert (options["actions"], options["action_labels"]["mute"]) == (("snooze", "mute"), "Nicht mehr erinnern")
    assert "action_urls" not in options

    resp = _press(options)
    assert (resp.status_code, resp.json()["reminder_muted"]) == (200, "series")
    # Only Ben, only this event.
    assert _mutes() == {(family["ben"], event_id, None)}


def test_push_button_for_a_series_opens_the_choice_instead(family):
    event_id = _event(family, recurrence="weekly")
    options = _push(family, event_id, repeats=True)
    assert options["actions"] == ("snooze", "mute")
    assert options["action_urls"] == {"mute": f"/calendar?event={event_id}&at=2026-12-01T09:00:00&repeats=1&mute=choose"}

    # The token itself cannot mute anything of a series.
    resp = _press(options)
    assert (resp.status_code, resp.json()["detail"]["code"]) == (400, "ACTION_NOT_ALLOWED")
    assert _press(options, "snooze").status_code == 200
    assert _mutes() == set()


def test_a_single_event_turned_series_mutes_only_the_reminded_occurrence(family):
    event_id = _event(family)
    options = _push(family, event_id)
    with TestSession() as db:
        db.get(CalendarEvent, event_id).recurrence = "weekly"
        db.commit()

    assert _press(options).json()["reminder_muted"] == "occurrence"
    assert _mutes() == {(family["ben"], event_id, DEC_1)}


def _replace(event_id: int, created_at: datetime) -> None:
    """Deletes the event; a new one gets its id, as SQLite hands it out again."""
    with TestSession() as db:
        family_id = db.get(CalendarEvent, event_id).family_id
        db.delete(db.get(CalendarEvent, event_id))
        db.commit()
    assert add_event(family_id, title="Parents' evening", created_at=created_at) == event_id


@pytest.mark.parametrize(
    "case",
    ["another family's token", "olga in her own family", "no event identity", "new event, same id", "new event, same second"],
)
def test_a_mute_button_only_reaches_its_own_event(family, case):
    event_id = _event(family, created_at=datetime(2026, 11, 20, 8, 0, 0, 100))
    if case == "another family's token":
        options, status = _push(family, event_id, person="olga"), 401
    elif case == "olga in her own family":
        options, status = _push(family, event_id, person="olga", fam=family["olga_family"]), 404
    elif case == "no event identity":
        options, status = _push(family, event_id, event_created_at=None), 404
    else:
        options, status = _push(family, event_id), 404
        _replace(event_id, datetime(2026, 11, 20, 8, 0, 0, 900) if case.endswith("second") else datetime(2026, 11, 21))

    resp = _press(options)
    assert resp.status_code == status
    if status == 404:
        assert resp.json()["detail"]["code"] == "ACTION_GONE"
    assert _mutes() == set()


@pytest.mark.parametrize("replaced", [False, True], ids=["same event", "new event with its id"])
def test_a_snoozed_reminder_belongs_to_its_event(family, monkeypatch, replaced):
    """The snooze comes back, and its button mutes, only for the event it was
    made for, never for a new event that got its id."""
    from app.core import scheduler as scheduler_module
    from app.core.push import PushResult

    event_id = _event(family)
    assert _press(_push(family, event_id), "snooze").status_code == 200
    if replaced:
        _replace(event_id, datetime(2026, 11, 21))
    sent: list[dict] = []
    monkeypatch.setattr(
        scheduler_module, "send_push_for_user",
        lambda db, uid, title, body, link=None, **options: sent.append(options) or PushResult(attempted=1, succeeded=1),
    )
    with TestSession() as db:
        due = db.query(ReminderSnooze).one().remind_at + timedelta(minutes=1)
        scheduler_module.deliver_snoozed_reminders(
            db, now=due, local_now=due,
            get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=True),
        )
        db.commit()
        assert db.query(Notification).count() == (0 if replaced else 1)
        assert db.query(ReminderSnooze).one().delivered_at is not None

    if replaced:
        assert sent == []
    else:
        assert _press(sent[0]).status_code == 200
        assert _mutes() == {(family["ben"], event_id, None)}
