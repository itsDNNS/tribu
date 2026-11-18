"""Events that remind only the person who created them.

Drives ``app.core.scheduler._check_notifications`` against an in-memory
SQLite database, like ``test_notification_reliability``.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.models import Membership, Notification, ReminderSnooze
from tests.reminder_support import NOW, add_event, add_family, add_snooze, reminded, run_scheduler
from tests.support import TestSession, freeze_scheduler

pytestmark = pytest.mark.usefixtures("reminder_db")


@pytest.fixture
def family():
    return add_family()


def test_everyone_is_reminded_by_default(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[0])

    run_scheduler()

    assert reminded(event_id) == sorted(users)
    assert [call["source_id"] for call in destinations] == [event_id]


def test_only_the_creator_is_reminded(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[1], remind_only_creator=True)

    run_scheduler()

    assert reminded(event_id) == [users[1]]
    # Destinations are household channels, so they stay quiet.
    assert destinations == []


def test_only_the_creator_is_reminded_for_every_occurrence_of_a_series(family, destinations, monkeypatch):
    family_id, users = family
    event_id = add_event(
        family_id,
        created_by_user_id=users[2],
        remind_only_creator=True,
        recurrence="daily",
        starts_at=NOW - timedelta(days=3) + timedelta(minutes=20),
    )

    run_scheduler()
    assert reminded(event_id) == [users[2]]

    # The next day's occurrence as well.
    freeze_scheduler(monkeypatch, NOW + timedelta(days=1))
    run_scheduler()

    assert reminded(event_id) == [users[2], users[2]]
    assert destinations == []


def test_flag_on_one_event_leaves_other_events_alone(family, destinations):
    family_id, users = family
    quiet = add_event(family_id, created_by_user_id=users[0], remind_only_creator=True, title="Private")
    shared = add_event(family_id, created_by_user_id=users[0], title="Shared")

    run_scheduler()

    assert reminded(quiet) == [users[0]]
    assert reminded(shared) == sorted(users)
    assert [call["source_id"] for call in destinations] == [shared]


def test_everyone_is_reminded_when_the_creator_is_gone(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=None, remind_only_creator=True)

    run_scheduler()

    assert reminded(event_id) == sorted(users)
    assert [call["source_id"] for call in destinations] == [event_id]


def test_everyone_is_reminded_when_the_creator_left_the_family(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[0], remind_only_creator=True)
    db = TestSession()
    try:
        db.query(Membership).filter(Membership.user_id == users[0]).delete()
        db.commit()
    finally:
        db.close()

    run_scheduler()

    assert reminded(event_id) == sorted(users[1:])
    assert [call["source_id"] for call in destinations] == [event_id]


def test_changed_occurrence_follows_its_series(family, destinations):
    """A row replacing one occurrence (from CalDAV or a feed) reminds the
    series' creator only, even if someone else wrote that row."""
    family_id, users = family
    series_start = NOW - timedelta(days=7) + timedelta(hours=3)
    add_event(
        family_id,
        title="Choir",
        created_by_user_id=users[0],
        remind_only_creator=True,
        recurrence="weekly",
        starts_at=series_start,
        ical_uid="choir@example.com",
    )
    moved_id = add_event(
        family_id,
        title="Choir (moved)",
        created_by_user_id=users[1],
        remind_only_creator=False,
        ical_uid="choir@example.com",
        recurrence_id=series_start + timedelta(days=7),
        starts_at=NOW + timedelta(minutes=20),
    )

    run_scheduler()

    assert reminded(moved_id) == [users[0]]
    assert destinations == []


def test_snoozed_reminder_of_someone_else_is_dropped(family, destinations):
    """Snoozed before the creator switched the event to remind only them."""
    family_id, users = family
    event_id = add_event(
        family_id,
        created_by_user_id=users[0],
        remind_only_creator=True,
        starts_at=NOW + timedelta(hours=2),
    )
    add_snooze(family_id, users[0], event_id)
    add_snooze(family_id, users[1], event_id)

    run_scheduler()

    assert reminded(event_id) == [users[0]]
    db = TestSession()
    try:
        assert all(s.delivered_at is not None for s in db.query(ReminderSnooze))
    finally:
        db.close()


def test_snoozed_reminders_reach_everyone_without_the_flag(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[0], starts_at=NOW + timedelta(hours=2))
    add_snooze(family_id, users[0], event_id)
    add_snooze(family_id, users[1], event_id)

    run_scheduler()

    assert reminded(event_id) == sorted(users[:2])


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
    add_event(family_id, created_by_user_id=users[0], remind_only_creator=True, title="Private")
    add_event(family_id, created_by_user_id=users[0], title="Shared")

    run_scheduler()

    assert sent == ["Shared"]
    db = TestSession()
    try:
        assert db.query(NotificationDestinationDelivery).count() == 1
    finally:
        db.close()
