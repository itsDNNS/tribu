"""Actions in reminder notifications (Tribu 2.0, N-2) and reminder texts in
the recipient's language (#535)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import notification_actions
from app.core.push import PushResult, _fcm_message
from app.database import Base, get_db
from app.main import app
from app.models import (
    CalendarEvent,
    Family,
    HouseholdActivity,
    Membership,
    Notification,
    NotificationPreference,
    ReminderSnooze,
    Task,
    User,
    UserNavOrder,
)
from app.security import create_access_token, hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Berlin")
    from app.core.clock import app_timezone
    from app.core import scheduler as scheduler_module

    app_timezone.cache_clear()
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    app_timezone.cache_clear()
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _seed(db, *, language: str | None = None, adult: bool = True) -> tuple[User, Family]:
    user = User(email="act@example.com", password_hash=hash_password("p"), display_name="Anna")
    family = Family(name="Act-Family")
    db.add_all([user, family])
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin" if adult else "member", is_adult=adult))
    db.add(NotificationPreference(user_id=user.id, reminders_enabled=True, reminder_minutes=30, push_enabled=True))
    if language:
        db.add(UserNavOrder(user_id=user.id, nav_order=[], ui_language=language))
    db.flush()
    return user, family


def _freeze(monkeypatch, *, audit_now: datetime, wall_now: datetime) -> None:
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: audit_now)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: wall_now)


def _capture_pushes(monkeypatch) -> list:
    from app.core import scheduler as scheduler_module

    calls = []

    def send(db, uid, title, body, link, **options):
        calls.append({"title": title, "body": body, "link": link, **options})
        return PushResult(attempted=1, succeeded=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", send)
    return calls


def _overdue_task_push(monkeypatch, *, language: str | None = None, adult: bool = True) -> tuple[dict, int]:
    with TestSession() as db:
        user, family = _seed(db, language=language, adult=adult)
        task = Task(family_id=family.id, title="Take out the bins", status="open", due_date=datetime(2026, 9, 17, 8, 0), created_by_user_id=user.id)
        db.add(task)
        db.commit()
        task_id = task.id
    _freeze(monkeypatch, audit_now=datetime(2026, 9, 17, 10, 0), wall_now=datetime(2026, 9, 17, 12, 0))
    calls = _capture_pushes(monkeypatch)
    from app.core import scheduler as scheduler_module

    scheduler_module._check_notifications()
    assert len(calls) == 1
    return calls[0], task_id


def test_overdue_task_reminders_offer_done_and_snooze_in_the_readers_language(monkeypatch):
    push, _ = _overdue_task_push(monkeypatch, language="de")
    assert push["body"] == "Aufgabe ist überfällig"
    assert push["actions"] == ("done", "snooze")
    assert push["action_labels"] == {"done": "Erledigt", "snooze": "In 1 Std. erinnern"}
    with TestSession() as db:
        assert db.query(Notification).one().body == "Aufgabe ist überfällig"


def test_done_completes_the_task_from_the_lock_screen(monkeypatch):
    push, task_id = _overdue_task_push(monkeypatch)
    response = client.post("/notifications/actions", json={"token": push["action_token"], "action": "done"})
    assert response.status_code == 200, response.json()
    with TestSession() as db:
        assert db.get(Task, task_id).status == "done"
        assert db.query(HouseholdActivity).filter(HouseholdActivity.action == "completed").count() == 1
    # Pressing again changes nothing.
    again = client.post("/notifications/actions", json={"token": push["action_token"], "action": "done"})
    assert again.status_code == 200


def test_snooze_reminds_again_an_hour_later_once(monkeypatch):
    push, task_id = _overdue_task_push(monkeypatch)
    response = client.post("/notifications/actions", json={"token": push["action_token"], "action": "snooze"})
    assert response.status_code == 200, response.json()
    with TestSession() as db:
        snooze = db.query(ReminderSnooze).one()
        assert snooze.source_type == "task" and snooze.source_id == task_id
        assert snooze.title == "Take out the bins"
        remind_at = snooze.remind_at

    from app.core import scheduler as scheduler_module

    calls = _capture_pushes(monkeypatch)
    _freeze(monkeypatch, audit_now=remind_at - timedelta(minutes=1), wall_now=remind_at + timedelta(hours=2))
    scheduler_module.deliver_snoozed_reminders(
        TestSession(), now=remind_at - timedelta(minutes=1), local_now=remind_at, get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=True),
    )
    assert calls == []

    with TestSession() as db:
        scheduler_module.deliver_snoozed_reminders(
            db, now=remind_at + timedelta(minutes=1), local_now=remind_at, get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=True),
        )
        db.commit()
        scheduler_module.deliver_snoozed_reminders(
            db, now=remind_at + timedelta(minutes=2), local_now=remind_at, get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=True),
        )
        db.commit()
    assert len(calls) == 1
    assert calls[0]["title"] == "Take out the bins"
    assert calls[0]["actions"] == ("done", "snooze")
    with TestSession() as db:
        assert db.query(Notification).count() == 2
        assert db.query(ReminderSnooze).one().delivered_at is not None


def test_a_snooze_for_a_finished_task_stays_quiet(monkeypatch):
    push, task_id = _overdue_task_push(monkeypatch)
    client.post("/notifications/actions", json={"token": push["action_token"], "action": "snooze"})
    client.post("/notifications/actions", json={"token": push["action_token"], "action": "done"})
    from app.core import scheduler as scheduler_module

    calls = _capture_pushes(monkeypatch)
    with TestSession() as db:
        remind_at = db.query(ReminderSnooze).one().remind_at
        scheduler_module.deliver_snoozed_reminders(
            db, now=remind_at + timedelta(minutes=1), local_now=remind_at, get_pref=lambda uid: NotificationPreference(user_id=uid, reminders_enabled=True, push_enabled=True),
        )
        db.commit()
        assert db.query(ReminderSnooze).one().delivered_at is not None
    assert calls == []


def test_children_cannot_complete_other_peoples_tasks_by_button(monkeypatch):
    push, task_id = _overdue_task_push(monkeypatch, adult=False)
    response = client.post("/notifications/actions", json={"token": push["action_token"], "action": "done"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ACTION_NOT_ALLOWED"


def test_action_tokens_are_scoped_and_no_session(monkeypatch):
    push, _ = _overdue_task_push(monkeypatch)
    token = push["action_token"]
    # Not an access token ...
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    # ... and an access token is not an action token.
    with TestSession() as db:
        user = db.query(User).one()
        access = create_access_token(user.id, user.email)
    denied = client.post("/notifications/actions", json={"token": access, "action": "done"})
    assert denied.status_code == 401
    unknown = client.post("/notifications/actions", json={"token": token, "action": "delete"})
    assert unknown.status_code == 400


def test_event_reminders_only_snooze(monkeypatch):
    with TestSession() as db:
        user, family = _seed(db)
        event_row = CalendarEvent(family_id=family.id, title="Swimming", all_day=False, starts_at=datetime(2026, 9, 17, 16, 0))
        db.add(event_row)
        db.commit()
    token = notification_actions.create_action_token(
        user_id=1, family_id=1, source_type="event", source_id=1, notification_type="event_reminder",
        title="Swimming", body="Starts at 16:00", link="/calendar?event=1",
    )
    response = client.post("/notifications/actions", json={"token": token, "action": "done"})
    assert response.status_code == 400
    assert client.post("/notifications/actions", json={"token": token, "action": "snooze"}).status_code == 200


def test_fcm_devices_that_draw_buttons_get_the_reminder_as_data():
    plain = _fcm_message("device", "Bins", "Overdue", "/tasks?id=1")
    assert plain["notification"] == {"title": "Bins", "body": "Overdue"}

    with_buttons = _fcm_message("device", "Bins", "Overdue", "/tasks?id=1", ("done", "snooze"), "tok")
    assert "notification" not in with_buttons
    assert with_buttons["data"] == {
        "url": "/tasks?id=1", "title": "Bins", "body": "Overdue", "actions": "done,snooze", "action_token": "tok",
    }
    assert with_buttons["apns"]["payload"]["aps"]["category"] == "tribu_done_snooze"


def test_web_push_carries_labelled_buttons(monkeypatch):
    from app.core import push as push_module
    from app.models import PushSubscription

    sent = []

    class FakeWebPush:
        @staticmethod
        def webpush(**kwargs):
            sent.append(json.loads(kwargs["data"]))

    monkeypatch.setattr(push_module, "get_vapid_public_key", lambda: "pub")
    monkeypatch.setattr(push_module, "get_vapid_private_key", lambda: "priv")
    monkeypatch.setattr(push_module, "get_vapid_claim_subject", lambda: "mailto:a@b.c")
    import sys
    import types

    fake = types.ModuleType("pywebpush")
    fake.webpush = FakeWebPush.webpush
    fake.WebPushException = Exception
    monkeypatch.setitem(sys.modules, "pywebpush", fake)

    with TestSession() as db:
        user, _ = _seed(db)
        db.add(PushSubscription(user_id=user.id, endpoint="https://push.example/1", p256dh="k", auth="a", platform="web"))
        db.commit()
        push_module.send_push_for_user(
            db, user.id, "Bins", "Overdue", "/tasks?id=1",
            actions=("done", "snooze"), action_token="tok", action_labels={"done": "Done", "snooze": "Later"},
        )
    assert sent == [{
        "title": "Bins", "body": "Overdue", "url": "/tasks?id=1",
        "actions": [{"action": "done", "title": "Done"}, {"action": "snooze", "title": "Later"}],
        "action_token": "tok",
    }]
