"""Members taking themselves off an event's reminders.

Drives ``app.core.scheduler._check_notifications`` against an in-memory
SQLite database, like ``test_event_remind_only_creator``.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.event_reminders import (
    MUTE_OCCURRENCE,
    MUTE_SERIES,
    ReminderMuteError,
    clear_reminder_mute,
    reminder_mute_state,
    set_reminder_mute,
)
from app.database import Base
from app.models import (
    CalendarEvent,
    EventReminderMute,
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
    _at(monkeypatch, NOW)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)
    yield
    Base.metadata.drop_all(bind=engine)


def _at(monkeypatch, moment: datetime) -> None:
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: moment)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: moment)


@pytest.fixture
def destinations(monkeypatch):
    """Records what would go to the family's notification destinations."""
    from app.core import scheduler as scheduler_module

    calls: list[dict] = []
    monkeypatch.setattr(scheduler_module, "dispatch_family_notification", lambda **kwargs: calls.append(kwargs))
    return calls


@pytest.fixture
def family():
    """Anna and Ben (adults) and Cleo (a child); returns (family_id, [ids])."""
    db = TestSession()
    try:
        fam = Family(name="Busy family")
        db.add(fam)
        db.flush()
        ids = []
        for name, adult in (("anna", True), ("ben", True), ("cleo", False)):
            user = User(email=f"{name}@example.com", password_hash=hash_password("p"), display_name=name.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=fam.id, role="admin" if adult else "member", is_adult=adult))
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


def _mute(user_id: int, event_id: int, scope: str = MUTE_SERIES, occurrence_start: datetime | None = None) -> str:
    db = TestSession()
    try:
        state = set_reminder_mute(db, user_id, db.get(CalendarEvent, event_id), scope, occurrence_start)
        db.commit()
        return state
    finally:
        db.close()


def _unmute(user_id: int, event_id: int, occurrence_start: datetime | None = None) -> None:
    db = TestSession()
    try:
        clear_reminder_mute(db, user_id, db.get(CalendarEvent, event_id), occurrence_start)
        db.commit()
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


def test_a_muted_single_event_reminds_everyone_else(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0])
    assert _mute(users[1], event_id) == MUTE_SERIES

    _run()

    assert _reminded(event_id) == [users[0], users[2]]
    # The household channel still goes out, without Ben as a recipient.
    assert [call["source_id"] for call in destinations] == [event_id]
    assert {user.user_id for user in destinations[0]["eligible_users"]} == {users[0], users[2]}


def test_the_reminder_link_names_the_occurrence(family, destinations):
    family_id, _ = family
    single = _add_event(family_id)
    series = _add_event(family_id, title="Meds", recurrence="daily", starts_at=NOW - timedelta(days=2) + timedelta(minutes=10))

    _run()

    db = TestSession()
    try:
        links = {link for (link,) in db.query(Notification.link)}
    finally:
        db.close()
    assert links == {
        f"/calendar?event={single}&at=2026-04-25T12:20:00",
        f"/calendar?event={series}&at=2026-04-25T12:10:00&repeats=1",
    }


def test_a_muted_series_stays_quiet_for_every_occurrence(family, destinations, monkeypatch):
    family_id, users = family
    event_id = _add_event(family_id, recurrence="daily", starts_at=NOW - timedelta(days=3) + timedelta(minutes=20))
    _mute(users[0], event_id, MUTE_SERIES)

    _run()
    _at(monkeypatch, NOW + timedelta(days=1))
    _run()

    assert _reminded(event_id) == sorted([users[1], users[1], users[2], users[2]])


def test_a_muted_occurrence_leaves_the_next_one(family, destinations, monkeypatch):
    family_id, users = family
    event_id = _add_event(family_id, recurrence="daily", starts_at=NOW - timedelta(days=3) + timedelta(minutes=20))
    assert _mute(users[0], event_id, MUTE_OCCURRENCE, NOW + timedelta(minutes=20)) == MUTE_OCCURRENCE

    _run()
    assert _reminded(event_id) == [users[1], users[2]]

    _at(monkeypatch, NOW + timedelta(days=1))
    _run()
    assert _reminded(event_id) == sorted([users[0], users[1], users[1], users[2], users[2]])


def test_an_occurrence_mute_lifts_the_series_mute_and_the_other_way_round(family):
    family_id, users = family
    event_id = _add_event(family_id, recurrence="weekly", starts_at=NOW + timedelta(minutes=20))
    today = NOW + timedelta(minutes=20)
    next_week = today + timedelta(days=7)

    _mute(users[0], event_id, MUTE_SERIES)
    _mute(users[0], event_id, MUTE_OCCURRENCE, today)
    db = TestSession()
    try:
        ev = db.get(CalendarEvent, event_id)
        assert reminder_mute_state(db, users[0], ev, today) == MUTE_OCCURRENCE
        assert reminder_mute_state(db, users[0], ev, next_week) is None
    finally:
        db.close()

    _mute(users[0], event_id, MUTE_SERIES)
    db = TestSession()
    try:
        ev = db.get(CalendarEvent, event_id)
        assert reminder_mute_state(db, users[0], ev, next_week) == MUTE_SERIES
    finally:
        db.close()


def test_an_occurrence_must_belong_to_the_series(family):
    family_id, users = family
    event_id = _add_event(family_id, recurrence="weekly", starts_at=NOW + timedelta(minutes=20))

    with pytest.raises(ReminderMuteError):
        _mute(users[0], event_id, MUTE_OCCURRENCE, NOW + timedelta(days=1, minutes=20))
    with pytest.raises(ReminderMuteError):
        _mute(users[0], event_id, MUTE_OCCURRENCE, None)


def test_unmuting_reminds_again(family, destinations):
    family_id, users = family
    single = _add_event(family_id, title="Single")
    series = _add_event(family_id, title="Series", recurrence="daily", starts_at=NOW - timedelta(days=1) + timedelta(minutes=20))
    _mute(users[0], single)
    _mute(users[0], series, MUTE_SERIES)
    _mute(users[1], series, MUTE_OCCURRENCE, NOW + timedelta(minutes=20))

    _unmute(users[0], single)
    _unmute(users[0], series)
    # The occurrence reminds again, which also lifts a series mute.
    _unmute(users[1], series, NOW + timedelta(minutes=20))

    _run()

    assert _reminded(single) == sorted(users)
    assert _reminded(series) == sorted(users)
    db = TestSession()
    try:
        assert db.query(EventReminderMute).count() == 0
    finally:
        db.close()


def test_a_changed_occurrence_follows_its_series_mute(family, destinations):
    family_id, users = family
    series_start = NOW - timedelta(days=7) + timedelta(hours=3)
    series_id = _add_event(
        family_id, title="Choir", recurrence="weekly", starts_at=series_start, ical_uid="choir@example.com",
    )
    moved_id = _add_event(
        family_id,
        title="Choir (moved)",
        ical_uid="choir@example.com",
        recurrence_id=series_start + timedelta(days=7),
        starts_at=NOW + timedelta(minutes=20),
    )
    _mute(users[0], series_id, MUTE_SERIES)

    _run()

    assert _reminded(moved_id) == [users[1], users[2]]
    db = TestSession()
    try:
        # Stored on the series row.
        assert [(m.event_id, m.occurrence_start) for m in db.query(EventReminderMute)] == [(series_id, None)]
    finally:
        db.close()


def test_a_changed_occurrence_is_muted_by_its_original_start(family, destinations):
    """Muted before a phone moved it, still muted after."""
    family_id, users = family
    series_start = NOW - timedelta(days=7) + timedelta(hours=3)
    original = series_start + timedelta(days=7)
    series_id = _add_event(
        family_id, title="Choir", recurrence="weekly", starts_at=series_start, ical_uid="choir@example.com",
    )
    # Ben mutes the occurrence while it is still a regular one.
    _mute(users[1], series_id, MUTE_OCCURRENCE, original)
    moved_id = _add_event(
        family_id,
        title="Choir (moved)",
        ical_uid="choir@example.com",
        recurrence_id=original,
        starts_at=NOW + timedelta(minutes=20),
    )
    # Anna mutes the changed row itself; it is one occurrence already.
    assert _mute(users[0], moved_id, MUTE_OCCURRENCE) == MUTE_OCCURRENCE

    _run()

    assert _reminded(moved_id) == [users[2]]
    db = TestSession()
    try:
        assert {(m.user_id, m.event_id, m.occurrence_start) for m in db.query(EventReminderMute)} == {
            (users[0], series_id, original),
            (users[1], series_id, original),
        }
    finally:
        db.close()


def test_a_series_changing_all_following_occurrences_keeps_their_original_starts(family, destinations):
    """A row continuing the series an hour later (RANGE=THISANDFUTURE) names
    its occurrences by where they were before."""
    family_id, users = family
    series_start = NOW - timedelta(days=14) + timedelta(minutes=20) - timedelta(hours=1)
    split_original = NOW - timedelta(days=7) + timedelta(minutes=20) - timedelta(hours=1)
    series_id = _add_event(
        family_id, title="Swim", recurrence="weekly", starts_at=series_start, ical_uid="swim@example.com",
    )
    split_id = _add_event(
        family_id,
        title="Swim (later)",
        recurrence="weekly",
        ical_uid="swim@example.com",
        recurrence_id=split_original,
        starts_at=split_original + timedelta(hours=1),
    )
    # Today's occurrence of the later row (12:20) was at 11:20 before the change.
    assert _mute(users[0], split_id, MUTE_OCCURRENCE, NOW + timedelta(minutes=20)) == MUTE_OCCURRENCE

    _run()

    assert _reminded(split_id) == [users[1], users[2]]
    db = TestSession()
    try:
        mute = db.query(EventReminderMute).one()
        assert (mute.event_id, mute.occurrence_start) == (series_id, NOW + timedelta(minutes=20) - timedelta(hours=1))
    finally:
        db.close()


def test_children_can_mute_too(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0])
    _mute(users[2], event_id)

    _run()

    assert _reminded(event_id) == [users[0], users[1]]


def test_household_destination_stays_quiet_when_everyone_muted(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id)
    for uid in users:
        _mute(uid, event_id)

    _run()

    assert _reminded(event_id) == []
    # Nobody counts as a recipient, so the household channel stays quiet
    # (dispatch_family_notification skips reminders without recipients).
    assert all(not call["eligible_users"] for call in destinations)


def test_real_destination_dispatch_skips_an_event_everyone_muted(family, monkeypatch):
    family_id, users = family
    from app.core import notification_destinations as destinations_module
    from app.models import NotificationDestination

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
    quiet = _add_event(family_id, title="Quiet")
    partly = _add_event(family_id, title="Partly")
    for uid in users:
        _mute(uid, quiet)
    _mute(users[0], partly)

    _run()

    assert sent == ["Partly"]


def test_the_creator_of_a_creator_only_event_can_mute_it(family, destinations):
    family_id, users = family
    event_id = _add_event(family_id, created_by_user_id=users[0], remind_only_creator=True)
    _mute(users[0], event_id)

    _run()

    assert _reminded(event_id) == []
    assert destinations == []


def _snooze(family_id: int, user_id: int, event_id: int, starts_at: datetime) -> None:
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
            link=f"/calendar?event={event_id}&at={starts_at.isoformat()}",
            remind_at=NOW - timedelta(minutes=1),
            expires_at=starts_at,
        ))
        db.commit()
    finally:
        db.close()


def _snoozed_notifications() -> list[tuple[int, str]]:
    db = TestSession()
    try:
        return sorted(
            (uid, link) for uid, link in db.query(Notification.user_id, Notification.link).filter(Notification.body == "Snoozed")
        )
    finally:
        db.close()


def test_snoozed_reminders_of_muted_occurrences_are_dropped(family, destinations):
    family_id, users = family
    later = NOW + timedelta(hours=2)
    single = _add_event(family_id, title="Single", starts_at=later)
    series = _add_event(family_id, title="Series", recurrence="daily", starts_at=later - timedelta(days=2))
    for uid in users:
        _snooze(family_id, uid, single, later)
        _snooze(family_id, uid, series, later)
    _mute(users[0], single)
    _mute(users[0], series, MUTE_SERIES)
    _mute(users[1], series, MUTE_OCCURRENCE, later)
    # Cleo's mute of tomorrow does not touch her snooze for today.
    _mute(users[2], series, MUTE_OCCURRENCE, later + timedelta(days=1))

    _run()

    delivered = _snoozed_notifications()
    assert [uid for uid, _ in delivered] == sorted([users[1], users[2], users[2]])
    db = TestSession()
    try:
        # Dropped ones are done with, not kept for later.
        assert db.query(ReminderSnooze).filter(ReminderSnooze.delivered_at.is_(None)).count() == 0
    finally:
        db.close()


def test_a_snooze_comes_back_when_the_mute_is_undone_in_time(family, destinations):
    family_id, users = family
    later = NOW + timedelta(hours=2)
    event_id = _add_event(family_id, starts_at=later)
    _snooze(family_id, users[0], event_id, later)
    _mute(users[0], event_id)
    _unmute(users[0], event_id)

    _run()

    assert [uid for uid, _ in _snoozed_notifications()] == [users[0]]


def test_mutes_go_with_the_event_and_the_user(family):
    family_id, users = family
    event_id = _add_event(family_id)
    other = _add_event(family_id)
    _mute(users[0], event_id)
    _mute(users[1], other)

    db = TestSession()
    try:
        db.delete(db.get(CalendarEvent, event_id))
        db.delete(db.get(User, users[1]))
        db.commit()
        assert db.query(EventReminderMute).count() == 0
    finally:
        db.close()


def test_muting_twice_keeps_one_row(family):
    family_id, users = family
    event_id = _add_event(family_id, recurrence="daily")
    _mute(users[0], event_id)
    _mute(users[0], event_id)
    _mute(users[0], event_id, MUTE_OCCURRENCE, NOW + timedelta(minutes=20))
    _mute(users[0], event_id, MUTE_OCCURRENCE, NOW + timedelta(minutes=20))

    db = TestSession()
    try:
        assert db.query(EventReminderMute).count() == 1
    finally:
        db.close()
