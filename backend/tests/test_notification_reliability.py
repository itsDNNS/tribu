"""Reliability tests for the reminder scheduler (issue #169).

Drives ``app.core.scheduler._check_notifications`` against an shared SQLite
database with a monkeypatched ``send_push_for_user`` so we can
assert how the scheduler treats trigger keys, retries, and push results.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

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
    NotificationSentLog,
    PushSubscription,
    Task,
    User,
)
from app.security import hash_password


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    Base.metadata.create_all(bind=engine)
    # Make ``SessionLocal()`` inside the scheduler hand out the in-memory
    # test session so we don't need to spin up the real engine.
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)
    yield
    Base.metadata.drop_all(bind=engine)


def _seed_user(db, email: str = "rel@example.com") -> tuple[User, Family]:
    user = User(email=email, password_hash=hash_password("p"), display_name="Rel")
    fam = Family(name="Rel-Family")
    db.add_all([user, fam])
    db.flush()
    db.add(Membership(user_id=user.id, family_id=fam.id, role="admin", is_adult=True))
    db.flush()
    return user, fam


def _set_pref(db, user_id: int, *, push_enabled: bool = False, push_categories: dict | None = None) -> None:
    pref = NotificationPreference(
        user_id=user_id,
        reminders_enabled=True,
        reminder_minutes=30,
        push_enabled=push_enabled,
        push_categories=push_categories,
    )
    db.add(pref)
    db.flush()


def _freeze_now(monkeypatch, now: datetime) -> None:
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: now)


def test_event_reminder_idempotent_across_runs(monkeypatch):
    """Two scheduler runs for the same event reminder must produce one
    Notification row and one log row, not duplicates."""
    db = TestSession()
    try:
        user, fam = _seed_user(db, "evt@example.com")
        _set_pref(db, user.id, push_enabled=False)
        now = datetime(2026, 4, 25, 12, 0, 0, tzinfo=timezone.utc).replace(tzinfo=None)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Standup",
            starts_at=now + timedelta(minutes=15),
            all_day=False,
        )
        db.add(ev)
        db.commit()
        user_id, ev_id = user.id, ev.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)

    from app.core.scheduler import _check_notifications

    _check_notifications()
    _check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1, f"expected 1 Notification, got {len(notifs)}"
        assert len(logs) == 1, f"expected 1 sent-log row, got {len(logs)}"

        log = logs[0]
        assert log.trigger_key is not None
        assert log.trigger_key.startswith(f"event:{ev_id}:")
        assert log.status == "delivered"
        # The second scheduler run is a no-op once the in-app-only
        # reminder is delivered.
        assert log.delivery_attempts == 1
        assert log.delivered_at is not None
    finally:
        db.close()


def test_same_day_legacy_log_is_adopted_without_duplicate_notification(monkeypatch):
    """After upgrading to trigger keys, a same-day legacy sent log means
    the pre-upgrade scheduler already created the in-app notification."""
    db = TestSession()
    try:
        user, fam = _seed_user(db, "legacy@example.com")
        _set_pref(db, user.id, push_enabled=False)
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Legacy Standup",
            starts_at=now + timedelta(minutes=15),
            all_day=False,
        )
        db.add(ev)
        db.flush()
        db.add(Notification(
            user_id=user.id,
            family_id=fam.id,
            type="event_reminder",
            title=ev.title,
            body="Starts in 15 minutes",
            link="calendar",
        ))
        db.add(NotificationSentLog(
            source_type="event",
            source_id=ev.id,
            user_id=user.id,
            sent_at=now,
            trigger_key=None,
        ))
        db.commit()
        user_id, ev_id = user.id, ev.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)
    from app.core.scheduler import _check_notifications

    _check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1
        assert len(logs) == 1
        assert logs[0].trigger_key.startswith(f"event:{ev_id}:")
        assert logs[0].status == "delivered"
    finally:
        db.close()



def test_changing_event_starts_at_changes_trigger_key():
    """Rescheduling an event must produce a different trigger key so the
    user is alerted again at the new time."""
    from app.core.scheduler import _event_trigger_key

    base_id = 7
    t1 = datetime(2026, 4, 25, 9, 0, 0)
    t2 = datetime(2026, 4, 25, 11, 0, 0)
    assert _event_trigger_key(base_id, t1) != _event_trigger_key(base_id, t2)


def test_changing_task_due_date_changes_trigger_key():
    from app.core.scheduler import _task_trigger_key

    base_id = 11
    d1 = datetime(2026, 4, 25, 9, 0, 0)
    d2 = datetime(2026, 4, 26, 9, 0, 0)
    assert _task_trigger_key(base_id, d1) != _task_trigger_key(base_id, d2)


def test_transient_push_failure_keeps_one_notification_and_retries(monkeypatch):
    """If push fails on every endpoint the in-app notification is still
    created (only once), the log is marked failed, attempts increment, and
    the next run can retry without duplicating the notification."""
    db = TestSession()
    try:
        user, fam = _seed_user(db, "push@example.com")
        _set_pref(db, user.id, push_enabled=True)
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Therapy",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
        user_id, ev_id = user.id, ev.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)

    from app.core import push as push_module
    from app.core import scheduler as scheduler_module

    call_count = {"n": 0}

    def fake_push_fail(db, uid, title, body, url=None):
        call_count["n"] += 1
        return push_module.PushResult(
            attempted=1, succeeded=0, failed=1, removed=0, errors=["boom"]
        )

    def fake_push_ok(db, uid, title, body, url=None):
        call_count["n"] += 1
        return push_module.PushResult(attempted=1, succeeded=1)

    # First run: push fails for every endpoint.
    monkeypatch.setattr(scheduler_module, "send_push_for_user", fake_push_fail)
    scheduler_module._check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1
        assert len(logs) == 1
        log = logs[0]
        assert log.status == "failed"
        assert log.delivery_attempts == 1
        assert log.last_error and "boom" in log.last_error
        assert log.delivered_at is None
        assert log.trigger_key.startswith(f"event:{ev_id}:")
    finally:
        db.close()

    # Second run: push succeeds. Notification count must remain 1, log
    # must be reused and flipped to delivered.
    monkeypatch.setattr(scheduler_module, "send_push_for_user", fake_push_ok)
    scheduler_module._check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1, "retry must not create a second in-app Notification"
        assert len(logs) == 1
        log = logs[0]
        assert log.status == "delivered"
        assert log.delivery_attempts == 2
        assert log.delivered_at is not None
    finally:
        db.close()

    # Third run after delivery: must be a no-op (no more push calls).
    third_baseline = call_count["n"]
    scheduler_module._check_notifications()
    assert call_count["n"] == third_baseline, "delivered logs must not retry push"


def test_disabled_push_category_keeps_in_app_reminder_and_skips_push(monkeypatch):
    db = TestSession()
    try:
        user, fam = _seed_user(db, "category-off@example.com")
        _set_pref(db, user.id, push_enabled=True, push_categories={"calendar_reminders": False})
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Quiet appointment",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)

    from app.core import scheduler as scheduler_module

    calls = {"n": 0}

    def fake_push(db, uid, title, body, url=None):
        calls["n"] += 1
        raise AssertionError("disabled category must not attempt browser push")

    monkeypatch.setattr(scheduler_module, "send_push_for_user", fake_push)
    scheduler_module._check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1
        assert notifs[0].type == "event_reminder"
        assert len(logs) == 1
        assert logs[0].status == "delivered"
        assert logs[0].last_error == "push_skipped:category_disabled:calendar_reminders"
        assert calls["n"] == 0
    finally:
        db.close()


def test_enabled_push_category_sends_push(monkeypatch):
    db = TestSession()
    try:
        user, fam = _seed_user(db, "category-on@example.com")
        _set_pref(db, user.id, push_enabled=True, push_categories={"calendar_reminders": True})
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Push appointment",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)

    from app.core import push as push_module
    from app.core import scheduler as scheduler_module

    calls = {"n": 0}

    def fake_push(db, uid, title, body, url=None):
        calls["n"] += 1
        return push_module.PushResult(attempted=1, succeeded=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", fake_push)
    scheduler_module._check_notifications()

    db = TestSession()
    try:
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(logs) == 1
        assert logs[0].status == "delivered"
        assert logs[0].last_error is None
        assert calls["n"] == 1
    finally:
        db.close()


def test_recurring_event_occurrence_creates_one_reminder(monkeypatch):
    """Recurring events are virtual occurrences, but each occurrence still
    needs a deterministic reminder key and idempotent delivery."""
    db = TestSession()
    try:
        user, fam = _seed_user(db, "recur@example.com")
        _set_pref(db, user.id, push_enabled=False)
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Daily meds",
            starts_at=now - timedelta(days=3) + timedelta(minutes=20),
            all_day=False,
            recurrence="daily",
        )
        db.add(ev)
        db.commit()
        user_id, ev_id = user.id, ev.id
        expected_occurrence = now + timedelta(minutes=20)
    finally:
        db.close()

    _freeze_now(monkeypatch, now)
    from app.core.scheduler import _check_notifications, _event_trigger_key

    _check_notifications()
    _check_notifications()

    db = TestSession()
    try:
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(notifs) == 1
        assert len(logs) == 1
        assert logs[0].trigger_key == _event_trigger_key(ev_id, expected_occurrence)
        assert logs[0].status == "delivered"
    finally:
        db.close()


def test_removed_only_push_result_is_not_retried(monkeypatch):
    db = TestSession()
    try:
        user, fam = _seed_user(db, "gone-retry@example.com")
        _set_pref(db, user.id, push_enabled=True)
        now = datetime(2026, 4, 25, 12, 0, 0)
        ev = CalendarEvent(
            family_id=fam.id,
            title="Gone endpoint",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)
    from app.core import push as push_module
    from app.core import scheduler as scheduler_module

    calls = {"n": 0}

    def fake_removed_only(db, uid, title, body, url=None):
        calls["n"] += 1
        return push_module.PushResult(attempted=1, succeeded=0, failed=0, removed=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", fake_removed_only)
    scheduler_module._check_notifications()
    scheduler_module._check_notifications()

    db = TestSession()
    try:
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        assert len(logs) == 1
        assert logs[0].status == "delivered"
        assert logs[0].last_error == "push_removed_subscriptions:1"
        assert calls["n"] == 1
    finally:
        db.close()



def test_push_410_removes_subscription(monkeypatch):
    """A 410 Gone response from the web-push endpoint must remove the
    subscription and be reflected in the PushResult.removed counter."""
    from app.core import push as push_module

    db = TestSession()
    try:
        user, _ = _seed_user(db, "gone@example.com")
        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://example.invalid/sub-1",
            p256dh="p",
            auth="a",
        )
        db.add(sub)
        db.commit()
        user_id = user.id
    finally:
        db.close()

    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "ops@example.com")

    class _FakeResponse:
        status_code = 410

    class _FakeWebPushException(Exception):
        def __init__(self, msg, response=None):
            super().__init__(msg)
            self.response = response

    def _fake_webpush(*_, **__):
        raise _FakeWebPushException("gone", response=_FakeResponse())

    fake_module = type(
        "fake_pywebpush",
        (),
        {"webpush": staticmethod(_fake_webpush), "WebPushException": _FakeWebPushException},
    )
    import sys

    monkeypatch.setitem(sys.modules, "pywebpush", fake_module)

    db = TestSession()
    try:
        result = push_module.send_push_for_user(db, user_id, "t", "b", "/x")
        db.commit()
    finally:
        db.close()

    assert result.attempted == 1
    assert result.removed == 1
    assert result.failed == 0
    assert result.succeeded == 0

    db = TestSession()
    try:
        remaining = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).count()
        assert remaining == 0, "410 Gone subscription should be deleted"
    finally:
        db.close()


def test_birthday_uses_target_date_in_trigger_key():
    """Birthday trigger keys must include the target date so each year's
    occurrence is treated as a new reminder."""
    from app.core.scheduler import _birthday_trigger_key

    bd_id = 3
    d1 = datetime(2026, 4, 26).date()
    d2 = datetime(2027, 4, 26).date()
    assert _birthday_trigger_key(bd_id, d1) != _birthday_trigger_key(bd_id, d2)
    assert "birthday:3:2026-04-26" == _birthday_trigger_key(bd_id, d1)


def test_task_due_creates_one_log_then_does_not_duplicate(monkeypatch):
    """Overdue task reminder also obeys idempotency."""
    db = TestSession()
    try:
        user, fam = _seed_user(db, "task@example.com")
        _set_pref(db, user.id, push_enabled=False)
        now = datetime(2026, 4, 25, 12, 0, 0)
        task = Task(
            family_id=fam.id,
            title="Pay bill",
            status="open",
            due_date=now - timedelta(hours=2),
        )
        db.add(task)
        db.commit()
        user_id, task_id = user.id, task.id
    finally:
        db.close()

    _freeze_now(monkeypatch, now)
    from app.core.scheduler import _check_notifications

    _check_notifications()
    _check_notifications()

    db = TestSession()
    try:
        logs = db.query(NotificationSentLog).filter(NotificationSentLog.user_id == user_id).all()
        notifs = db.query(Notification).filter(Notification.user_id == user_id).all()
        assert len(notifs) == 1
        assert len(logs) == 1
        assert logs[0].trigger_key.startswith(f"task:{task_id}:")
        assert logs[0].status == "delivered"
    finally:
        db.close()


def test_event_assignment_push_respects_category_preference(monkeypatch):
    db = TestSession()
    calls = []

    def fake_push(db, uid, title, body, url=None):
        calls.append({"uid": uid, "title": title, "body": body, "url": url})

    from app.modules import calendar_router

    monkeypatch.setattr(calendar_router, "send_push_for_user", fake_push)
    try:
        actor, fam = _seed_user(db, "assign-actor@example.com")
        assigned = User(email="assign-target@example.com", password_hash=hash_password("p"), display_name="Target")
        db.add(assigned)
        db.flush()
        db.add(Membership(user_id=assigned.id, family_id=fam.id, role="member", is_adult=False))
        _set_pref(
            db,
            assigned.id,
            push_enabled=True,
            push_categories={"event_assignments": True},
        )
        event = CalendarEvent(
            family_id=fam.id,
            title="Dentist",
            starts_at=datetime(2026, 4, 25, 12, 0, 0),
            assigned_to=[assigned.id],
        )
        db.add(event)
        db.flush()

        calendar_router._create_assignment_notifications(db, event, actor.id)
        db.flush()

        assert db.query(Notification).filter(Notification.user_id == assigned.id).count() == 1
        assert calls == [{
            "uid": assigned.id,
            "title": "Dentist",
            "body": "You were assigned to an event.",
            "url": f"/calendar?event={event.id}",
        }]
    finally:
        db.close()


def test_event_assignment_disabled_category_keeps_in_app_without_push(monkeypatch):
    db = TestSession()
    calls = []

    def fake_push(db, uid, title, body, url=None):
        calls.append(uid)

    from app.modules import calendar_router

    monkeypatch.setattr(calendar_router, "send_push_for_user", fake_push)
    try:
        actor, fam = _seed_user(db, "assign-off-actor@example.com")
        assigned = User(email="assign-off-target@example.com", password_hash=hash_password("p"), display_name="Target")
        db.add(assigned)
        db.flush()
        db.add(Membership(user_id=assigned.id, family_id=fam.id, role="member", is_adult=False))
        _set_pref(
            db,
            assigned.id,
            push_enabled=True,
            push_categories={"event_assignments": False},
        )
        event = CalendarEvent(
            family_id=fam.id,
            title="Training",
            starts_at=datetime(2026, 4, 25, 12, 0, 0),
            assigned_to=[assigned.id],
        )
        db.add(event)
        db.flush()

        calendar_router._create_assignment_notifications(db, event, actor.id)
        db.flush()

        assert db.query(Notification).filter(Notification.user_id == assigned.id).count() == 1
        assert calls == []
    finally:
        db.close()
