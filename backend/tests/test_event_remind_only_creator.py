"""Events that remind only the person who created them.

Drives ``app.core.scheduler._check_notifications`` against an in-memory
SQLite database, like ``test_notification_reliability``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    CalendarEvent,
    Family,
    Membership,
    Notification,
    NotificationPreference,
    ReminderSnooze,
    User,
)
from app.security import hash_password


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine, autoflush=False)

NOW = datetime(2026, 4, 25, 12, 0, 0)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    Base.metadata.create_all(bind=engine)
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)
    monkeypatch.setattr(scheduler_module, "utcnow", lambda: NOW)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: NOW)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def destinations(monkeypatch):
    """Records what would go to the family's notification destinations."""
    from app.core import scheduler as scheduler_module

    calls: list[dict] = []
    monkeypatch.setattr(scheduler_module, "dispatch_family_notification", lambda **kwargs: calls.append(kwargs))
    return calls


@pytest.fixture
def family():
    """A family of three adults with reminders on; returns (family_id, [user ids])."""
    db = TestSession()
    try:
        fam = Family(name="Busy family")
        db.add(fam)
        db.flush()
        ids = []
        for name in ("anna", "ben", "cleo"):
            user = User(email=f"{name}@example.com", password_hash=hash_password("p"), display_name=name.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=fam.id, role="admin", is_adult=True))
            db.add(NotificationPreference(user_id=user.id, reminders_enabled=True, reminder_minutes=30, push_enabled=False))
            ids.append(user.id)
        db.commit()
        return fam.id, ids
    finally:
        db.close()


def _add_event(family_id: int, **fields) -> int:
    db = TestSession()
    try:
        values = {
            "family_id": family_id,
            "title": "Dentist",
            "starts_at": NOW + timedelta(minutes=20),
            "all_day": False,
        }
        values.update(fields)
        ev = CalendarEvent(**values)
        db.add(ev)
        db.commit()
        return ev.id
    finally:
        db.close()


def _reminded(event_id: int) -> list[int]:
    db = TestSession()
    try:
        return sorted(
            uid
            for (uid,) in db.query(Notification.user_id).filter(
                Notification.type == "event_reminder",
                Notification.link.like(f"/calendar?event={event_id}&%"),
            )
        )
    finally:
        db.close()


def _run():
    from app.core.scheduler import _check_notifications

    _check_notifications()


def test_everyone_is_reminded_by_default(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0])

    _run()

    assert _reminded(event_id) == sorted(users)
    assert [call["source_id"] for call in destinations] == [event_id]


def test_only_the_creator_is_reminded(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[1], remind_only_creator=True)

    _run()

    assert _reminded(event_id) == [users[1]]
    # Destinations are household channels, so they stay quiet.
    assert destinations == []


def test_only_the_creator_is_reminded_for_every_occurrence_of_a_series(family, destinations, monkeypatch):
    family_id, users = family
    event_id = _add_event(
        family_id,
        created_by_user_id=users[2],
        remind_only_creator=True,
        recurrence="daily",
        starts_at=NOW - timedelta(days=3) + timedelta(minutes=20),
    )

    _run()
    assert _reminded(event_id) == [users[2]]

    # The next day's occurrence as well.
    from app.core import scheduler as scheduler_module

    tomorrow = NOW + timedelta(days=1)
    monkeypatch.setattr(scheduler_module, "utcnow", lambda: tomorrow)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: tomorrow)
    _run()

    assert _reminded(event_id) == [users[2], users[2]]
    assert destinations == []


def test_flag_on_one_event_leaves_other_events_alone(family, destinations):
    family_id, users = family
    quiet = _add_event(family_id, created_by_user_id=users[0], remind_only_creator=True, title="Private")
    shared = _add_event(family_id, created_by_user_id=users[0], title="Shared")

    _run()

    assert _reminded(quiet) == [users[0]]
    assert _reminded(shared) == sorted(users)
    assert [call["source_id"] for call in destinations] == [shared]


def test_everyone_is_reminded_when_the_creator_is_gone(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=None, remind_only_creator=True)

    _run()

    assert _reminded(event_id) == sorted(users)
    assert [call["source_id"] for call in destinations] == [event_id]


def test_everyone_is_reminded_when_the_creator_left_the_family(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0], remind_only_creator=True)
    db = TestSession()
    try:
        db.query(Membership).filter(Membership.user_id == users[0]).delete()
        db.commit()
    finally:
        db.close()

    _run()

    assert _reminded(event_id) == sorted(users[1:])
    assert [call["source_id"] for call in destinations] == [event_id]


def test_changed_occurrence_follows_its_series(family, destinations):
    """A row replacing one occurrence (from CalDAV or a feed) reminds the
    series' creator only, even if someone else wrote that row."""
    family_id, users = family
    series_start = NOW - timedelta(days=7) + timedelta(hours=3)
    _add_event(
        family_id,
        title="Choir",
        created_by_user_id=users[0],
        remind_only_creator=True,
        recurrence="weekly",
        starts_at=series_start,
        ical_uid="choir@example.com",
    )
    moved_id = _add_event(
        family_id,
        title="Choir (moved)",
        created_by_user_id=users[1],
        remind_only_creator=False,
        ical_uid="choir@example.com",
        recurrence_id=series_start + timedelta(days=7),
        starts_at=NOW + timedelta(minutes=20),
    )

    _run()

    assert _reminded(moved_id) == [users[0]]
    assert destinations == []


def _snooze(family_id: int, user_id: int, event_id: int) -> None:
    db = TestSession()
    try:
        db.add(ReminderSnooze(
            user_id=user_id,
            family_id=family_id,
            source_type="event",
            source_id=event_id,
            notification_type="event_reminder",
            title="Dentist",
            body="Snoozed",
            link=f"/calendar?event={event_id}&at={(NOW + timedelta(minutes=20)).isoformat()}",
            remind_at=NOW - timedelta(minutes=1),
            expires_at=NOW + timedelta(minutes=20),
        ))
        db.commit()
    finally:
        db.close()


def test_snoozed_reminder_of_someone_else_is_dropped(family, destinations):
    """Snoozed before the creator switched the event to remind only them."""
    family_id, users = family
    event_id = _add_event(
        family_id,
        created_by_user_id=users[0],
        remind_only_creator=True,
        starts_at=NOW + timedelta(hours=2),
    )
    _snooze(family_id, users[0], event_id)
    _snooze(family_id, users[1], event_id)

    _run()

    assert _reminded(event_id) == [users[0]]
    db = TestSession()
    try:
        assert all(s.delivered_at is not None for s in db.query(ReminderSnooze))
    finally:
        db.close()


def test_snoozed_reminders_reach_everyone_without_the_flag(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0], starts_at=NOW + timedelta(hours=2))
    _snooze(family_id, users[0], event_id)
    _snooze(family_id, users[1], event_id)

    _run()

    assert _reminded(event_id) == sorted(users[:2])


def test_assignment_notices_are_not_affected(family):
    """Event assignment notices are a separate category and still reach
    the members assigned, whoever is reminded."""
    family_id, users = family
    from app.models import CalendarEvent as Model
    from app.modules.calendar_router import _create_assignment_notifications

    db = TestSession()
    try:
        ev = Model(
            family_id=family_id,
            title="Parents' evening",
            starts_at=NOW + timedelta(days=2),
            all_day=False,
            created_by_user_id=users[0],
            remind_only_creator=True,
            assigned_to=[users[1], users[2]],
        )
        db.add(ev)
        db.flush()
        _create_assignment_notifications(db, ev, users[0])
        db.commit()
        assigned = sorted(uid for (uid,) in db.query(Notification.user_id).filter(Notification.type == "event_assigned"))
    finally:
        db.close()

    assert assigned == [users[1], users[2]]


def test_real_destination_dispatch_skips_a_creator_only_event(family, monkeypatch):
    """With an actual household destination set up, a creator-only event
    sends nothing to it, while a normal event does."""
    family_id, users = family
    from app.core import notification_destinations as destinations_module
    from app.models import NotificationDestination, NotificationDestinationDelivery

    monkeypatch.setattr(destinations_module, "SessionLocal", TestSession)
    sent: list[str] = []
    monkeypatch.setattr(destinations_module, "_send_with_apprise", lambda url, payload: sent.append(payload["title"]) or True)
    db = TestSession()
    try:
        db.add(NotificationDestination(
            family_id=family_id,
            name="Family chat",
            target_url_secret=destinations_module.protect_target_url("ntfys://ntfy.sh/tribu-test"),
            events=["calendar.reminder"],
            active=True,
            respect_quiet_hours=False,
        ))
        db.commit()
    finally:
        db.close()
    _add_event(family_id, created_by_user_id=users[0], remind_only_creator=True, title="Private")
    _add_event(family_id, created_by_user_id=users[0], title="Shared")

    _run()

    assert sent == ["Shared"]
    db = TestSession()
    try:
        assert db.query(NotificationDestinationDelivery).count() == 1
    finally:
        db.close()
