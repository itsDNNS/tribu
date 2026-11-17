"""Members taking themselves off an event's reminders, as the scheduler
sees it (see ``reminder_support`` for the database and the family)."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.core.event_reminders import (
    MUTE_OCCURRENCE,
    MUTE_SERIES,
    ReminderMuteError,
    clear_reminder_mute,
    reminder_mute_states,
    set_reminder_mute,
)
from app.models import CalendarEvent, EventReminderMute, Notification, NotificationPreference, ReminderSnooze, User
# reminder_db and destinations are fixtures.
from tests.reminder_support import (
    NOW,
    TestSession,
    add_event,
    add_family,
    add_snooze,
    at,
    destinations,
    reminded,
    reminder_db,
    run_scheduler,
)

pytestmark = pytest.mark.usefixtures("reminder_db")

SOON = NOW + timedelta(minutes=20)


@pytest.fixture
def family():
    return add_family()


def _mute(user_id: int, event_id: int, scope: str = MUTE_SERIES, occurrence_start: datetime | None = None) -> str:
    with TestSession() as db:
        state = set_reminder_mute(db, user_id, db.get(CalendarEvent, event_id), scope, occurrence_start)
        db.commit()
        return state


def _unmute(user_id: int, event_id: int, occurrence_start: datetime | None = None) -> None:
    with TestSession() as db:
        clear_reminder_mute(db, user_id, db.get(CalendarEvent, event_id), occurrence_start)
        db.commit()


def _mutes() -> set[tuple]:
    with TestSession() as db:
        return {(m.user_id, m.event_id, m.occurrence_start) for m in db.query(EventReminderMute)}


def _state(user_id: int, event_id: int, starts_at: datetime) -> str | None:
    with TestSession() as db:
        return reminder_mute_states(db, user_id, [db.get(CalendarEvent, event_id)], [{"id": event_id, "starts_at": starts_at}])[0]


@pytest.mark.parametrize("muter", [1, 2], ids=["adult", "child without edit rights"])
def test_a_muted_single_event_reminds_everyone_else(family, destinations, muter):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[0])
    assert _mute(users[muter], event_id) == MUTE_SERIES

    run_scheduler()

    others = [uid for uid in users if uid != users[muter]]
    assert reminded(event_id) == others
    # The household channel still goes out, without them as a recipient.
    assert [call["source_id"] for call in destinations] == [event_id]
    assert {user.user_id for user in destinations[0]["eligible_users"]} == set(others)


def test_the_reminder_link_names_the_family_and_the_occurrence(family, destinations):
    family_id, _ = family
    single = add_event(family_id)
    series = add_event(family_id, title="Meds", recurrence="daily", starts_at=NOW - timedelta(days=2) + timedelta(minutes=10))

    run_scheduler()

    with TestSession() as db:
        links = {link for (link,) in db.query(Notification.link)}
    assert links == {
        f"/calendar?event={single}&family={family_id}&at=2026-04-25T12:20:00",
        f"/calendar?event={series}&family={family_id}&at=2026-04-25T12:10:00&repeats=1",
    }


@pytest.mark.parametrize(
    "scope, start, today, tomorrow",
    [
        (MUTE_SERIES, None, [1, 2], [1, 2]),
        (MUTE_OCCURRENCE, SOON, [1, 2], [0, 1, 2]),
    ],
    ids=["series: every occurrence", "occurrence: only that one"],
)
def test_muting_a_series_or_one_occurrence(family, destinations, monkeypatch, scope, start, today, tomorrow):
    family_id, users = family
    event_id = add_event(family_id, recurrence="daily", starts_at=SOON - timedelta(days=3))
    _mute(users[0], event_id, scope, start)

    run_scheduler()
    assert reminded(event_id) == [users[i] for i in today]
    at(monkeypatch, NOW + timedelta(days=1))
    run_scheduler()
    assert reminded(event_id) == sorted([users[i] for i in today + tomorrow])


def test_the_state_of_an_occurrence_is_the_last_choice(family):
    """An occurrence mute lifts a series mute, and the other way round."""
    family_id, users = family
    event_id = add_event(family_id, recurrence="weekly", starts_at=SOON)
    next_week = SOON + timedelta(days=7)

    _mute(users[0], event_id, MUTE_SERIES)
    _mute(users[0], event_id, MUTE_OCCURRENCE, SOON)
    assert (_state(users[0], event_id, SOON), _state(users[0], event_id, next_week)) == (MUTE_OCCURRENCE, None)
    _mute(users[0], event_id, MUTE_SERIES)
    assert _state(users[0], event_id, next_week) == MUTE_SERIES


@pytest.mark.parametrize("start", [None, SOON + timedelta(days=1)], ids=["missing", "not an occurrence"])
def test_an_occurrence_must_belong_to_the_series(family, start):
    family_id, users = family
    event_id = add_event(family_id, recurrence="weekly", starts_at=SOON)

    with pytest.raises(ReminderMuteError):
        _mute(users[0], event_id, MUTE_OCCURRENCE, start)


def test_unmuting_reminds_again(family, destinations):
    family_id, users = family
    single = add_event(family_id, title="Single")
    series = add_event(family_id, title="Series", recurrence="daily", starts_at=SOON - timedelta(days=1))
    _mute(users[0], single)
    _mute(users[0], series, MUTE_SERIES)
    _mute(users[1], series, MUTE_OCCURRENCE, SOON)

    _unmute(users[0], single)
    _unmute(users[0], series)
    # The occurrence reminds again, which also lifts a series mute.
    _unmute(users[1], series, SOON)

    run_scheduler()
    assert reminded(single) == sorted(users)
    assert reminded(series) == sorted(users)
    assert _mutes() == set()


SERIES_START = NOW - timedelta(days=7) + timedelta(hours=3)
ORIGINAL = SERIES_START + timedelta(days=7)


@pytest.mark.parametrize(
    "on_moved, scope, start, before_move, stored",
    [
        (False, MUTE_SERIES, None, False, None),
        # Muted while it was a regular occurrence, still muted after the move.
        (False, MUTE_OCCURRENCE, ORIGINAL, True, ORIGINAL),
        # The changed row itself is one occurrence already.
        (True, MUTE_OCCURRENCE, None, False, ORIGINAL),
    ],
    ids=["whole series", "occurrence before the move", "the changed occurrence"],
)
def test_a_changed_occurrence_follows_its_series(family, destinations, on_moved, scope, start, before_move, stored):
    """A weekly series whose occurrence of today a phone moved to SOON."""
    family_id, users = family
    series_id = add_event(family_id, title="Choir", recurrence="weekly", starts_at=SERIES_START, ical_uid="choir@example.com")
    if before_move:
        _mute(users[0], series_id, scope, start)
    moved_id = add_event(family_id, title="Choir (moved)", ical_uid="choir@example.com", recurrence_id=ORIGINAL, starts_at=SOON)
    if not before_move:
        _mute(users[0], moved_id if on_moved else series_id, scope, start)

    run_scheduler()

    assert reminded(moved_id) == users[1:]
    assert _mutes() == {(users[0], series_id, stored)}


def test_a_series_changing_all_following_occurrences_keeps_their_original_starts(family, destinations):
    """A row continuing the series an hour later (RANGE=THISANDFUTURE) names
    its occurrences by where they were before."""
    family_id, users = family
    split_original = SOON - timedelta(days=7, hours=1)
    series_id = add_event(family_id, recurrence="weekly", starts_at=split_original - timedelta(days=7), ical_uid="swim@example.com")
    split_id = add_event(
        family_id, recurrence="weekly", ical_uid="swim@example.com",
        recurrence_id=split_original, starts_at=split_original + timedelta(hours=1),
    )
    assert _mute(users[0], split_id, MUTE_OCCURRENCE, SOON) == MUTE_OCCURRENCE

    run_scheduler()

    assert reminded(split_id) == users[1:]
    assert _mutes() == {(users[0], series_id, SOON - timedelta(hours=1))}


@pytest.mark.parametrize(
    "muters, sent",
    [((0, 1, 2), []), ((0,), ["Dentist"])],
    ids=["everyone muted: quiet", "someone muted: sent"],
)
def test_the_household_destination(family, monkeypatch, muters, sent):
    """With a real destination set up, it stays quiet only once nobody is
    left to remind (it skips reminders without recipients)."""
    family_id, users = family
    from app.core import notification_destinations as destinations_module
    from app.models import NotificationDestination

    monkeypatch.setattr(destinations_module, "SessionLocal", TestSession)
    delivered: list[str] = []
    monkeypatch.setattr(destinations_module, "_send_with_apprise", lambda url, payload: delivered.append(payload["title"]) or True)
    with TestSession() as db:
        db.add(NotificationDestination(
            family_id=family_id, name="Family chat", events=["calendar.reminder"], active=True, respect_quiet_hours=False,
            target_url_secret=destinations_module.protect_target_url("ntfys://ntfy.sh/tribu-test"),
        ))
        db.commit()
    event_id = add_event(family_id)
    for i in muters:
        _mute(users[i], event_id)

    run_scheduler()

    assert delivered == sent


def test_the_creator_of_a_creator_only_event_can_mute_it(family, destinations):
    family_id, users = family
    event_id = add_event(family_id, created_by_user_id=users[0], remind_only_creator=True)
    _mute(users[0], event_id)

    run_scheduler()

    assert reminded(event_id) == []
    assert destinations == []


def _snoozed() -> list[int]:
    """Who got a snoozed reminder."""
    with TestSession() as db:
        return sorted(uid for (uid,) in db.query(Notification.user_id).filter(Notification.body == "Snoozed"))


def test_snoozed_reminders_of_muted_occurrences_are_dropped(family, destinations):
    family_id, users = family
    later = NOW + timedelta(hours=2)
    single = add_event(family_id, title="Single", starts_at=later)
    series = add_event(family_id, title="Series", recurrence="daily", starts_at=later - timedelta(days=2))
    for uid in users:
        add_snooze(family_id, uid, single, later)
        add_snooze(family_id, uid, series, later)
    _mute(users[0], single)
    _mute(users[0], series, MUTE_SERIES)
    _mute(users[1], series, MUTE_OCCURRENCE, later)
    # Cleo's mute of tomorrow does not touch her snooze for today.
    _mute(users[2], series, MUTE_OCCURRENCE, later + timedelta(days=1))

    run_scheduler()

    assert _snoozed() == [users[1], users[2], users[2]]
    with TestSession() as db:
        # Dropped ones are done with, not kept for later.
        assert db.query(ReminderSnooze).filter(ReminderSnooze.delivered_at.is_(None)).count() == 0


def test_a_snooze_comes_back_when_the_mute_is_undone_in_time(family, destinations):
    family_id, users = family
    later = NOW + timedelta(hours=2)
    event_id = add_event(family_id, starts_at=later)
    add_snooze(family_id, users[0], event_id, later)
    _mute(users[0], event_id)
    _unmute(users[0], event_id)

    run_scheduler()

    assert _snoozed() == [users[0]]


def test_mutes_go_with_the_event_and_the_user_and_are_kept_once(family):
    family_id, users = family
    event_id = add_event(family_id, recurrence="daily")
    other = add_event(family_id)
    for _ in range(2):
        _mute(users[0], event_id)
        _mute(users[0], event_id, MUTE_OCCURRENCE, SOON)
    assert len(_mutes()) == 1
    _mute(users[1], other)

    with TestSession() as db:
        db.delete(db.get(CalendarEvent, event_id))
        db.delete(db.get(User, users[1]))
        db.commit()
    assert _mutes() == set()


# ── Snoozed from a push button, muted afterwards (review findings) ───────


@pytest.fixture
def snooze_by_push(family, destinations, monkeypatch):
    """Runs the scheduler for Anna (push, two hours ahead), snoozes her
    reminder from its button and returns a function that delivers the
    snoozes at a given time and tells whether hers came back."""
    from app.core import notification_actions
    from app.core import scheduler as scheduler_module
    from app.core.push import PushResult

    with TestSession() as db:
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == family[1][0]).one()
        pref.push_enabled, pref.reminder_minutes = True, 120
        db.commit()
    pushes: list[dict] = []
    monkeypatch.setattr(
        scheduler_module, "send_push_for_user",
        lambda db, uid, title, body, link=None, **options: pushes.append({"user_id": uid, **options})
        or PushResult(attempted=1, succeeded=1),
    )

    def snooze(audit_now: datetime) -> None:
        monkeypatch.setattr(notification_actions, "utcnow", lambda: audit_now)
        run_scheduler()
        token = next(push["action_token"] for push in pushes if push["user_id"] == family[1][0])
        with TestSession() as db:
            notification_actions.apply_action(db, token, "snooze")

    def comes_back(at_time: datetime) -> bool:
        with TestSession() as db:
            before = db.query(Notification).filter(Notification.user_id == family[1][0]).count()
            scheduler_module.deliver_snoozed_reminders(
                db, now=at_time, local_now=at_time,
                get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=False),
            )
            db.commit()
            return db.query(Notification).filter(Notification.user_id == family[1][0]).count() > before

    return snooze, comes_back


def test_a_snooze_stays_muted_after_its_occurrence_moved_again(family, snooze_by_push):
    """A series continued an hour later (09:00 became 10:00), snoozed, then
    moved once more (11:00): muting that occurrence still silences the snooze."""
    snooze, comes_back = snooze_by_push
    family_id, users = family
    split_original = NOW - timedelta(days=7) + timedelta(minutes=30)
    add_event(family_id, recurrence="weekly", starts_at=split_original - timedelta(days=7), ical_uid="swim@example.com")
    split_id = add_event(
        family_id, recurrence="weekly", ical_uid="swim@example.com",
        recurrence_id=split_original, starts_at=split_original + timedelta(hours=1),
    )
    snooze(NOW)
    with TestSession() as db:
        db.get(CalendarEvent, split_id).starts_at = split_original + timedelta(hours=2)
        db.commit()
    _mute(users[0], split_id, MUTE_OCCURRENCE, NOW + timedelta(minutes=150))

    assert not comes_back(NOW + timedelta(minutes=61))


def test_a_snooze_of_an_occurrence_in_the_spring_forward_gap_stays_muted(family, snooze_by_push, monkeypatch):
    """02:30 on the night Berlin skips to 03:00 does not survive a round trip
    through UTC (it comes back as 03:30); the snooze keeps 02:30 itself."""
    from app.core import scheduler as scheduler_module
    from app.core.clock import app_timezone, local_wall_to_utc_naive

    snooze, comes_back = snooze_by_push
    monkeypatch.setenv("TZ", "Europe/Berlin")
    app_timezone.cache_clear()
    try:
        audit_now = datetime(2027, 3, 27, 23, 40)
        monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", local_wall_to_utc_naive)
        at(monkeypatch, audit_now, wall=datetime(2027, 3, 28, 0, 40))
        family_id, users = family
        gap = datetime(2027, 3, 28, 2, 30)
        event_id = add_event(family_id, recurrence="daily", starts_at=gap - timedelta(days=5))
        snooze(audit_now)
        _mute(users[0], event_id, MUTE_OCCURRENCE, gap)

        assert not comes_back(audit_now + timedelta(hours=1, minutes=1))
    finally:
        app_timezone.cache_clear()
