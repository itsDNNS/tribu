"""Notifications that clean up after themselves.

Read notifications go a week after they were read, time-bound reminders
disappear once their moment has passed, everything can be deleted at once,
and an event edit only notifies people who were newly assigned.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core import cache
from app.core.clock import utcnow
from app.core.notification_housekeeping import READ_NOTIFICATION_RETENTION, purge_notifications
from app.core.reminder_text import _KEYS, _TEXTS, clock_time, event_start_text
from app.main import app
from app.models import (
    CalendarEvent,
    Family,
    FamilyBirthday,
    Membership,
    Notification,
    NotificationPreference,
    SystemSetting,
    User,
    UserNavOrder,
)
from app.security import create_access_token
from tests.support import TestSession, add_member, add_pat, auth, capture_pushes, freeze_scheduler

pytestmark = pytest.mark.usefixtures("scheduler_db", "berlin_tz")


@pytest.fixture(autouse=True)
def _uncached_unread_counts(monkeypatch):
    # Unread counts are cached per user id; ids repeat across tests.
    monkeypatch.setattr(cache, "get_or_set", lambda key, ttl, loader: loader())


client = TestClient(app)
# The fixture turns caching off; one test needs the real thing.
_REAL_GET_OR_SET = cache.get_or_set


def _user(db, email: str, family: Family, *, adult: bool = True) -> User:
    member = add_member(
        db, email, scopes=None, family_id=family.id, is_adult=adult, password="p", display_name=email.split("@")[0].title(),
    )
    return db.get(User, member.user_id)


def _family(db, name: str = "Fam") -> Family:
    family = Family(name=name)
    db.add(family)
    db.flush()
    return family


def _headers(user: User) -> dict:
    return auth(create_access_token(user.id, user.email))


def _notify(db, user: User, family: Family, title: str, **fields) -> Notification:
    row = Notification(user_id=user.id, family_id=family.id, type=fields.pop("type", "system"), title=title, **fields)
    db.add(row)
    db.flush()
    return row


# --- read_at ---------------------------------------------------------------


def test_marking_read_records_when():
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        first = _notify(db, anna, family, "One")
        second = _notify(db, anna, family, "Two")
        third = _notify(db, anna, family, "Three")
        db.commit()
        ids = (first.id, second.id, third.id)
        headers = _headers(anna)

    before = utcnow() - timedelta(seconds=1)
    assert client.patch(f"/notifications/{ids[0]}/read", headers=headers).status_code == 200
    with TestSession() as db:
        marked = db.get(Notification, ids[0])
        assert marked.read is True
        assert marked.read_at is not None and marked.read_at >= before
        first_read_at = marked.read_at

    assert client.post("/notifications/read-all", headers=headers).status_code == 200
    with TestSession() as db:
        rows = {row.id: row for row in db.query(Notification).all()}
        assert all(row.read and row.read_at is not None for row in rows.values())
        # Marking all read does not move the time of earlier reads.
        assert rows[ids[0]].read_at == first_read_at

    # Reading again keeps the first time, so the week is not extended.
    assert client.patch(f"/notifications/{ids[0]}/read", headers=headers).status_code == 200
    with TestSession() as db:
        assert db.get(Notification, ids[0]).read_at == first_read_at
    listed = client.get("/notifications", headers=headers).json()
    assert {item["id"] for item in listed} == set(ids)
    assert all(item["read_at"] for item in listed)


# --- what the list and the count show --------------------------------------


def test_list_and_count_hide_expired_and_long_read_before_cleanup():
    now = utcnow()
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        _notify(db, anna, family, "Upcoming", type="event_reminder", expires_at=now + timedelta(hours=1))
        _notify(db, anna, family, "Started", type="event_reminder", expires_at=now - timedelta(minutes=1))
        _notify(db, anna, family, "Plain unread")
        _notify(db, anna, family, "Read yesterday", read=True, read_at=now - timedelta(days=1))
        _notify(db, anna, family, "Read long ago", read=True, read_at=now - READ_NOTIFICATION_RETENTION - timedelta(minutes=1))
        _notify(db, anna, family, "Read, expired", read=True, read_at=now, expires_at=now - timedelta(hours=2))
        db.commit()
        headers = _headers(anna)

    titles = {item["title"] for item in client.get("/notifications", headers=headers).json()}
    assert titles == {"Upcoming", "Plain unread", "Read yesterday"}
    assert client.get("/notifications/unread-count", headers=headers).json() == {"count": 2}


def test_mobile_snapshot_counts_only_shown_notifications():
    now = utcnow()
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        _notify(db, anna, family, "Shown")
        _notify(db, anna, family, "Gone", expires_at=now - timedelta(minutes=5))
        db.commit()
        headers = _headers(anna)
        family_id = family.id

    response = client.get(f"/mobile/daily?family_id={family_id}", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["notifications"]["unread_count"] == 1


# --- delete all ------------------------------------------------------------


def test_delete_all_removes_only_the_callers_notifications():
    with TestSession() as db:
        family = _family(db)
        other_family = _family(db, "Other")
        anna = _user(db, "anna@example.com", family)
        ben = _user(db, "ben@example.com", family)
        cleo = _user(db, "cleo@example.com", other_family)
        # Anna is in a second family too: her notifications there go as well,
        # like the list, which shows them all.
        db.add(Membership(user_id=anna.id, family_id=other_family.id, role="member", is_adult=True))
        _notify(db, anna, family, "Anna 1")
        _notify(db, anna, family, "Anna 2", read=True, read_at=utcnow())
        _notify(db, anna, other_family, "Anna elsewhere")
        _notify(db, ben, family, "Ben")
        _notify(db, cleo, other_family, "Cleo")
        db.commit()
        headers = _headers(anna)

    response = client.delete("/notifications", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "deleted": 3}
    with TestSession() as db:
        assert sorted(row.title for row in db.query(Notification).all()) == ["Ben", "Cleo"]
    assert client.get("/notifications", headers=headers).json() == []
    assert client.get("/notifications/unread-count", headers=headers).json() == {"count": 0}


def test_delete_all_up_to_id_keeps_newer_notifications():
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        seen = _notify(db, anna, family, "Seen")
        _notify(db, anna, family, "Also seen")
        last_seen = _notify(db, anna, family, "Last seen")
        _notify(db, anna, family, "Arrived meanwhile")
        db.commit()
        headers = _headers(anna)
        up_to = last_seen.id
        assert seen.id < up_to

    response = client.delete(f"/notifications?up_to_id={up_to}", headers=headers)
    assert response.json()["deleted"] == 3
    assert [item["title"] for item in client.get("/notifications", headers=headers).json()] == ["Arrived meanwhile"]
    assert client.delete("/notifications?up_to_id=0", headers=headers).status_code == 422


def test_delete_all_without_login_is_refused():
    assert client.delete("/notifications").status_code == 401


@pytest.mark.parametrize(
    ("scopes", "status"),
    [("profile:write", 200), ("profile:read", 403), ("calendar:write", 403), ("*", 200)],
)
def test_delete_all_needs_profile_write_scope(scopes, status):
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        _notify(db, anna, family, "Mine")
        token = add_pat(db, anna.id, scopes)
        db.commit()

    response = client.delete("/notifications", headers=auth(token))
    assert response.status_code == status
    with TestSession() as db:
        assert db.query(Notification).count() == (0 if status == 200 else 1)


# --- cleanup job -----------------------------------------------------------


def test_cleanup_removes_expired_and_week_old_read_notifications():
    now = datetime(2026, 11, 17, 12, 0)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        ben = _user(db, "ben@example.com", family)
        _notify(db, anna, family, "Unread, old", created_at=now - timedelta(days=60))
        _notify(db, anna, family, "Read 6 days ago", read=True, read_at=now - timedelta(days=6))
        _notify(db, anna, family, "Read 8 days ago", read=True, read_at=now - timedelta(days=8))
        _notify(db, anna, family, "Read without time", read=True)
        _notify(db, ben, family, "Expired, unread", expires_at=now - timedelta(seconds=1))
        _notify(db, ben, family, "Expires later", expires_at=now + timedelta(hours=3))
        db.commit()
        anna_id, ben_id = anna.id, ben.id

        deleted, users = purge_notifications(db, now)
        db.commit()
        assert deleted == 2
        assert users == {anna_id, ben_id}
        assert sorted(row.title for row in db.query(Notification).all()) == [
            "Expires later", "Read 6 days ago", "Read without time", "Unread, old",
        ]
        assert purge_notifications(db, now) == (0, set())


def test_cleanup_job_runs_hourly_and_clears_counts(monkeypatch):
    from apscheduler.schedulers.background import BackgroundScheduler
    from app.core import scheduler as scheduler_module

    scheduler = BackgroundScheduler()
    monkeypatch.setattr(scheduler_module, "_scheduler", scheduler)
    invalidated = []
    monkeypatch.setattr(scheduler_module.cache, "invalidate", invalidated.append)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        _notify(db, anna, family, "Old read", read=True, read_at=utcnow() - timedelta(days=10))
        _notify(db, anna, family, "Fresh")
        db.commit()
        anna_id = anna.id

    # Starting the job cleans up once right away.
    scheduler_module.start_notification_cleanup_job()
    job = scheduler.get_job(scheduler_module.NOTIFICATION_CLEANUP_JOB_ID)
    assert job is not None
    assert job.trigger.interval == timedelta(hours=1)
    with TestSession() as db:
        assert [row.title for row in db.query(Notification).all()] == ["Fresh"]
    assert invalidated == [f"tribu:notif_count:{anna_id}"]
    assert READ_NOTIFICATION_RETENTION == timedelta(days=7)


# --- reminder texts and expiry ---------------------------------------------


def test_event_start_text_names_the_time_and_the_date_when_not_today():
    today = date(2026, 11, 17)
    assert event_start_text("de", datetime(2026, 11, 17, 17, 0), today) == "Beginnt um 17:00"
    assert event_start_text("de", datetime(2026, 11, 18, 7, 5), today) == "Beginnt am 18.11. um 07:05"
    assert event_start_text("en", datetime(2026, 11, 17, 17, 0), today) == "Starts at 17:00"
    assert event_start_text("en", datetime(2026, 11, 18, 0, 30), today, "12h") == "Starts Nov 18 at 12:30 AM"
    assert clock_time(datetime(2026, 1, 1, 12, 5), "12h") == "12:05 PM"
    assert clock_time(datetime(2026, 1, 1, 9, 5)) == "09:05"
    for language, texts in _TEXTS.items():
        assert len(texts) == len(_KEYS), language
        at = texts[_KEYS.index("event_starts_at")]
        on = texts[_KEYS.index("event_starts_on")]
        assert "{time}" in at and "{minutes}" not in at, language
        assert "{date}" in on and "{time}" in on, language
        # Every language renders without a leftover placeholder.
        rendered = event_start_text(language, datetime(2026, 11, 18, 17, 0), today)
        assert "{" not in rendered and "17:00" in rendered and "18" in rendered, language


def test_event_reminder_in_app_and_push_name_the_start_and_expire_then(monkeypatch):
    from app.core import scheduler as scheduler_module

    pushes = capture_pushes(monkeypatch)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        db.add(NotificationPreference(user_id=anna.id, reminders_enabled=True, reminder_minutes=60, push_enabled=True))
        db.add(UserNavOrder(user_id=anna.id, nav_order=[], ui_language="de"))
        db.add(SystemSetting(key="time_format", value="12h"))
        # Shortly after midnight tomorrow, so the reminder names the date.
        db.add(CalendarEvent(family_id=family.id, title="Flight", all_day=False, starts_at=datetime(2026, 11, 18, 0, 30)))
        db.commit()

    # 23:45 in Berlin (UTC+1).
    freeze_scheduler(monkeypatch, datetime(2026, 11, 17, 22, 45), datetime(2026, 11, 17, 23, 45))
    scheduler_module._check_notifications()

    with TestSession() as db:
        row = db.query(Notification).one()
        assert row.type == "event_reminder"
        assert row.body == "Beginnt am 18.11. um 12:30 AM"
        assert row.expires_at == datetime(2026, 11, 17, 23, 30)
    assert [push["body"] for push in pushes] == ["Beginnt am 18.11. um 12:30 AM"]


def test_birthday_tomorrow_notice_lasts_until_the_birthday_is_over(monkeypatch):
    from app.core import scheduler as scheduler_module

    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        db.add(NotificationPreference(user_id=anna.id, reminders_enabled=True, reminder_minutes=30, push_enabled=False))
        db.add(FamilyBirthday(family_id=family.id, person_name="Chloe", month=11, day=15))
        db.commit()
        headers = _headers(anna)

    freeze_scheduler(monkeypatch, datetime(2026, 11, 14, 8, 0), datetime(2026, 11, 14, 9, 0))
    scheduler_module._check_notifications()

    with TestSession() as db:
        row = db.query(Notification).one()
        assert row.type == "birthday"
        # The end of 15 November in Berlin, in UTC.
        assert row.expires_at == datetime(2026, 11, 15, 22, 59, 59, 999999)
        row.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    # Once the day is over the notice is gone from the list.
    assert client.get("/notifications", headers=headers).json() == []


def test_snoozed_reminder_for_an_event_that_started_is_dropped(monkeypatch):
    from app.core import scheduler as scheduler_module
    from app.models import ReminderSnooze

    now = datetime(2026, 11, 17, 15, 0)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        started = CalendarEvent(family_id=family.id, title="Started", all_day=False, starts_at=datetime(2026, 11, 17, 15, 30))
        later = CalendarEvent(family_id=family.id, title="Later", all_day=False, starts_at=datetime(2026, 11, 17, 18, 0))
        db.add_all([started, later])
        db.flush()
        for ev in (started, later):
            db.add(ReminderSnooze(
                user_id=anna.id, family_id=family.id, source_type="event", source_id=ev.id,
                notification_type="event_reminder", title=ev.title, body="x", link=None,
                remind_at=now - timedelta(minutes=1),
            ))
        db.commit()

        default_pref = NotificationPreference(user_id=anna.id, reminders_enabled=True, reminder_minutes=30)
        scheduler_module.deliver_snoozed_reminders(
            db, now=now, local_now=now + timedelta(hours=1), get_pref=lambda uid: default_pref,
        )
        db.commit()
        rows = db.query(Notification).all()
        assert [row.title for row in rows] == ["Later"]
        # 18:00 in Berlin is 17:00 UTC.
        assert rows[0].expires_at == datetime(2026, 11, 17, 17, 0)
        assert all(snooze.delivered_at == now for snooze in db.query(ReminderSnooze).all())


# --- duplicate assignment notices ------------------------------------------


def _assignment_titles(user_id: int) -> list[str]:
    with TestSession() as db:
        return [
            row.title
            for row in db.query(Notification).filter(Notification.user_id == user_id, Notification.type == "event_assigned")
        ]


def test_editing_an_event_notifies_only_newly_assigned_members():
    with TestSession() as db:
        family = _family(db)
        dennis = _user(db, "dennis@example.com", family)
        partner = _user(db, "partner@example.com", family)
        chloe = _user(db, "chloe@example.com", family, adult=False)
        grandma = _user(db, "grandma@example.com", family)
        db.commit()
        ids = {"dennis": dennis.id, "partner": partner.id, "chloe": chloe.id, "grandma": grandma.id}
        family_id = family.id
        headers = _headers(partner)

    created = client.post("/calendar/events", headers=headers, json={
        "family_id": family_id, "title": "Chloe Geburtstag", "starts_at": "2026-11-15T00:00:00",
        "all_day": True, "assigned_to": [ids["dennis"], ids["partner"]],
    })
    assert created.status_code == 200, created.text
    event_id = created.json()["id"]
    assert _assignment_titles(ids["dennis"]) == ["Chloe Geburtstag"]
    assert _assignment_titles(ids["partner"]) == []

    # Adding Chloe used to notify Dennis a second time.
    edited = client.patch(f"/calendar/events/{event_id}", headers=headers, json={
        "assigned_to": [ids["dennis"], ids["partner"], ids["chloe"]],
    })
    assert edited.status_code == 200, edited.text
    assert _assignment_titles(ids["dennis"]) == ["Chloe Geburtstag"]
    assert _assignment_titles(ids["chloe"]) == ["Chloe Geburtstag"]

    # Same people in another order, then the whole family: only Grandma is new.
    client.patch(f"/calendar/events/{event_id}", headers=headers, json={
        "assigned_to": [ids["chloe"], ids["partner"], ids["dennis"]],
    })
    client.patch(f"/calendar/events/{event_id}", headers=headers, json={"assigned_to": "all"})
    assert _assignment_titles(ids["dennis"]) == ["Chloe Geburtstag"]
    assert _assignment_titles(ids["chloe"]) == ["Chloe Geburtstag"]
    assert _assignment_titles(ids["grandma"]) == ["Chloe Geburtstag"]

    # Everyone (all) to an explicit list of the same people: nothing new.
    client.patch(f"/calendar/events/{event_id}", headers=headers, json={
        "assigned_to": [ids["dennis"], ids["partner"], ids["chloe"], ids["grandma"]],
    })
    with TestSession() as db:
        assert db.query(Notification).filter(Notification.type == "event_assigned").count() == 3
        # The notice ends with the (all-day) event: midnight after 15 November in Berlin.
        expiries = {row.expires_at for row in db.query(Notification)}
        assert expiries == {datetime(2026, 11, 15, 23, 0)}


def test_assignment_notice_of_a_timed_event_ends_with_the_event():
    with TestSession() as db:
        family = _family(db)
        dennis = _user(db, "dennis@example.com", family)
        partner = _user(db, "partner@example.com", family)
        db.commit()
        dennis_id, family_id = dennis.id, family.id
        headers = _headers(partner)

    response = client.post("/calendar/events", headers=headers, json={
        "family_id": family_id, "title": "Dentist", "starts_at": "2026-11-20T10:00:00",
        "ends_at": "2026-11-20T11:00:00", "all_day": False, "assigned_to": [dennis_id],
    })
    assert response.status_code == 200, response.text
    with TestSession() as db:
        # 11:00 in Berlin is 10:00 UTC.
        assert db.query(Notification).one().expires_at == datetime(2026, 11, 20, 10, 0)


@pytest.mark.parametrize(
    ("ends_at", "expected"),
    [
        # From a calendar feed: the exclusive end, midnight after the last day.
        ("2026-11-18T00:00:00", datetime(2026, 11, 17, 23, 0)),
        # From the editor: the last day itself, so midnight after it.
        ("2026-11-17T15:00:00", datetime(2026, 11, 17, 23, 0)),
    ],
)
def test_assignment_notice_of_a_multi_day_all_day_event_ends_at_its_exclusive_end(ends_at, expected):
    with TestSession() as db:
        family = _family(db)
        dennis = _user(db, "dennis@example.com", family)
        partner = _user(db, "partner@example.com", family)
        db.commit()
        dennis_id, family_id = dennis.id, family.id
        headers = _headers(partner)

    response = client.post("/calendar/events", headers=headers, json={
        "family_id": family_id, "title": "Ferienlager", "starts_at": "2026-11-16T00:00:00",
        "ends_at": ends_at, "all_day": True, "assigned_to": [dennis_id],
    })
    assert response.status_code == 200, response.text
    with TestSession() as db:
        assert db.query(Notification).one().expires_at == expected


# --- ids never repeat --------------------------------------------------------


def test_new_notifications_never_reuse_ids_of_deleted_ones():
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        ids = [_notify(db, anna, family, f"Old {n}").id for n in range(3)]
        db.commit()
        headers = _headers(anna)
        anna_id, family_id = anna.id, family.id

    # Two tabs saw the same list; the first one clears it.
    up_to = max(ids)
    assert client.delete(f"/notifications?up_to_id={up_to}", headers=headers).json()["deleted"] == 3
    with TestSession() as db:
        fresh = Notification(user_id=anna_id, family_id=family_id, type="system", title="Fresh")
        db.add(fresh)
        db.commit()
        fresh_id = fresh.id
    # A deleted id handed out again would be deleted by the second tab and
    # skipped by a live stream that already passed it.
    assert fresh_id > up_to
    assert client.delete(f"/notifications?up_to_id={up_to}", headers=headers).json()["deleted"] == 0
    assert [item["title"] for item in client.get("/notifications", headers=headers).json()] == ["Fresh"]


# --- cached unread count -----------------------------------------------------


class _FakeValkey:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = ttl

    def delete(self, *keys):
        for key in keys:
            self.values.pop(key, None)


def test_cached_unread_count_ends_when_the_next_reminder_expires(monkeypatch):
    from app.modules import notifications_router

    monkeypatch.setattr(cache, "get_or_set", _REAL_GET_OR_SET)
    fake = _FakeValkey()
    monkeypatch.setattr(cache, "_client", fake)
    now = datetime(2026, 11, 17, 12, 0)
    monkeypatch.setattr(notifications_router, "utcnow", lambda: now)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        ben = _user(db, "ben@example.com", family)
        _notify(db, anna, family, "Starts soon", expires_at=now + timedelta(seconds=4, milliseconds=200))
        _notify(db, anna, family, "Later", expires_at=now + timedelta(hours=1))
        _notify(db, anna, family, "Read, expires sooner", read=True, read_at=now, expires_at=now + timedelta(seconds=1))
        _notify(db, ben, family, "Plain")
        db.commit()
        anna_headers, ben_headers = _headers(anna), _headers(ben)
        anna_key, ben_key = f"tribu:notif_count:{anna.id}", f"tribu:notif_count:{ben.id}"

    assert client.get("/notifications/unread-count", headers=anna_headers).json() == {"count": 2}
    # Cached only until "Starts soon" expires (rounded down), not the usual 15 seconds.
    assert fake.ttls[anna_key] == 4
    assert client.get("/notifications/unread-count", headers=ben_headers).json() == {"count": 1}
    assert fake.ttls[ben_key] == notifications_router.UNREAD_COUNT_CACHE_SECONDS

    # Under a second to go: not cached at all.
    with TestSession() as db:
        db.query(Notification).filter(Notification.title == "Starts soon").update(
            {"expires_at": now + timedelta(milliseconds=600)}
        )
        db.commit()
    fake.values.clear()
    fake.ttls.clear()
    assert client.get("/notifications/unread-count", headers=anna_headers).json() == {"count": 2}
    assert anna_key not in fake.values


# --- snoozed reminders of recurring events -----------------------------------


def test_snoozed_reminder_of_a_recurring_event_expires_with_its_occurrence(monkeypatch):
    from app.core import notification_actions
    from app.core import scheduler as scheduler_module
    from app.models import ReminderSnooze

    pushes = capture_pushes(monkeypatch)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        db.add(NotificationPreference(user_id=anna.id, reminders_enabled=True, reminder_minutes=30, push_enabled=True))
        db.add(CalendarEvent(
            family_id=family.id, title="Swimming", all_day=False, recurrence="weekly",
            starts_at=datetime(2026, 11, 10, 16, 0),
        ))
        db.commit()
        anna_id = anna.id

    # 15:45 in Berlin on the 17th: the reminder for the 16:00 occurrence.
    freeze_scheduler(monkeypatch, datetime(2026, 11, 17, 14, 45), datetime(2026, 11, 17, 15, 45))
    scheduler_module._check_notifications()
    assert len(pushes) == 1
    response = client.post("/notifications/actions", json={"token": pushes[0]["action_token"], "action": "snooze"})
    assert response.status_code == 200

    occurrence_start = datetime(2026, 11, 17, 15, 0)  # 16:00 in Berlin, in UTC
    with TestSession() as db:
        snooze = db.query(ReminderSnooze).one()
        assert snooze.expires_at == occurrence_start
        snooze_id = snooze.id

    default_pref = NotificationPreference(user_id=anna_id, reminders_enabled=True, reminder_minutes=30)

    def run(now):
        with TestSession() as db:
            db.query(ReminderSnooze).filter(ReminderSnooze.id == snooze_id).update({"delivered_at": None})
            db.query(Notification).filter(Notification.title == "Swimming", Notification.id > 1).delete()
            scheduler_module.deliver_snoozed_reminders(db, now=now, local_now=now, get_pref=lambda uid: default_pref)
            db.commit()
            return [row.expires_at for row in db.query(Notification).filter(Notification.id > 1)]

    # Snooze running out before the start: delivered, ending at the start.
    with TestSession() as db:
        db.query(ReminderSnooze).update({"remind_at": occurrence_start - timedelta(minutes=5)})
        db.commit()
    assert run(occurrence_start - timedelta(minutes=5)) == [occurrence_start]
    # The usual hour later the occurrence has started: dropped.
    assert run(occurrence_start + timedelta(minutes=45)) == []

    token = notification_actions.create_action_token(
        user_id=anna_id, family_id=1, source_type="event", source_id=1, notification_type="event_reminder",
        title="Swimming", body="x", link=None, expires_at=occurrence_start,
    )
    assert token


def test_delete_all_for_another_account_deletes_nothing():
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        ben = _user(db, "ben@example.com", family)
        _notify(db, ben, family, "Ben's")
        db.commit()
        anna_id, ben_headers = anna.id, _headers(ben)

    # Anna started "delete all", then Ben signed in on the same browser.
    response = client.delete(f"/notifications?up_to_id=99&user_id={anna_id}", headers=ben_headers)
    assert response.json() == {"status": "ok", "deleted": 0}
    assert [item["title"] for item in client.get("/notifications", headers=ben_headers).json()] == ["Ben's"]
    with TestSession() as db:
        ben_id = db.query(User).filter(User.email == "ben@example.com").one().id
    assert client.delete(f"/notifications?user_id={ben_id}", headers=ben_headers).json()["deleted"] == 1


def test_snooze_of_a_recurring_event_without_its_occurrence_ends_a_day_after_snoozing():
    from app.core import scheduler as scheduler_module
    from app.models import ReminderSnooze

    now = datetime(2026, 11, 17, 15, 0)
    with TestSession() as db:
        family = _family(db)
        anna = _user(db, "anna@example.com", family)
        event = CalendarEvent(family_id=family.id, title="Swimming", all_day=False, recurrence="weekly", starts_at=datetime(2026, 11, 3, 16, 0))
        db.add(event)
        db.flush()
        for remind_at in (now - timedelta(minutes=1), now - timedelta(days=2)):
            db.add(ReminderSnooze(
                user_id=anna.id, family_id=family.id, source_type="event", source_id=event.id,
                notification_type="event_reminder", title="Swimming", body="x", link=None, remind_at=remind_at,
            ))
        db.commit()

        default_pref = NotificationPreference(user_id=anna.id, reminders_enabled=True, reminder_minutes=30)
        scheduler_module.deliver_snoozed_reminders(db, now=now, local_now=now, get_pref=lambda uid: default_pref)
        db.commit()
        # Snoozed an hour before it ran out, so it lasts until a day after that.
        assert [row.expires_at for row in db.query(Notification)] == [now - timedelta(minutes=1, hours=1) + timedelta(days=1)]
        assert all(snooze.delivered_at == now for snooze in db.query(ReminderSnooze))
