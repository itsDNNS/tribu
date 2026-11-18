"""Actions in reminder notifications (Tribu 2.0, N-2) and reminder texts in
the recipient's language (#535)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core import notification_actions
from app.core.push import _fcm_message
from app.main import app
from app.models import CalendarEvent, HouseholdActivity, Notification, NotificationPreference, ReminderSnooze, Task, User
from app.security import create_access_token
from tests.notification_support import add_reader
from tests.support import TestSession, auth, capture_pushes, freeze_scheduler

pytestmark = pytest.mark.usefixtures("scheduler_db", "berlin_tz")

client = TestClient(app)


def _overdue_task_push(monkeypatch, *, language: str | None = None, adult: bool = True) -> tuple[dict, int]:
    with TestSession() as db:
        user, family = add_reader(db, language=language, adult=adult)
        task = Task(family_id=family.id, title="Take out the bins", status="open", due_date=datetime(2026, 9, 17, 8, 0), created_by_user_id=user.id)
        db.add(task)
        db.commit()
        task_id = task.id
    freeze_scheduler(monkeypatch, datetime(2026, 9, 17, 10, 0), datetime(2026, 9, 17, 12, 0))
    calls = capture_pushes(monkeypatch)
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

    calls = capture_pushes(monkeypatch)
    freeze_scheduler(monkeypatch, remind_at - timedelta(minutes=1), remind_at + timedelta(hours=2))
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

    calls = capture_pushes(monkeypatch)
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
    assert client.get("/auth/me", headers=auth(token)).status_code == 401
    # ... and an access token is not an action token.
    with TestSession() as db:
        user = db.query(User).one()
        access = create_access_token(user.id, user.email)
    denied = client.post("/notifications/actions", json={"token": access, "action": "done"})
    assert denied.status_code == 401
    unknown = client.post("/notifications/actions", json={"token": token, "action": "delete"})
    assert unknown.status_code == 400


def test_event_reminders_cannot_be_marked_done(monkeypatch):
    with TestSession() as db:
        user, family = add_reader(db)
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
        user, _ = add_reader(db)
        db.add(PushSubscription(user_id=user.id, endpoint="https://push.example/1", p256dh="k", auth="a", platform="web"))
        db.commit()
        push_module.send_push_for_user(
            db, user.id, "Bins", "Overdue", "/tasks?id=1",
            actions=("done", "snooze"), action_token="tok", action_labels={"done": "Done", "snooze": "Later"},
        )
        # A button that opens Tribu ("Don't remind me" of a series) carries its link.
        push_module.send_push_for_user(
            db, user.id, "Swim", "Starts at 9", "/calendar?event=1",
            actions=("snooze", "mute"), action_token="tok", action_labels={"snooze": "Later", "mute": "Mute"},
            action_urls={"mute": "/calendar?event=1&mute=choose"},
        )
    assert sent == [
        {
            "title": "Bins", "body": "Overdue", "url": "/tasks?id=1",
            "actions": [{"action": "done", "title": "Done"}, {"action": "snooze", "title": "Later"}],
            "action_token": "tok",
        },
        {
            "title": "Swim", "body": "Starts at 9", "url": "/calendar?event=1",
            "actions": [{"action": "snooze", "title": "Later"}, {"action": "mute", "title": "Mute"}],
            "action_token": "tok", "action_urls": {"mute": "/calendar?event=1&mute=choose"},
        },
    ]


def test_apps_only_get_the_buttons_they_know(monkeypatch):
    """iOS needs a registered category for each set of buttons, so newer
    ones ("mute") stay in the browser."""
    from app.core import push as push_module
    from app.models import PushSubscription

    sent_fcm = []
    monkeypatch.setattr(push_module, "is_fcm_configured", lambda: True)
    monkeypatch.setattr(push_module, "_send_fcm_push", lambda token, title, body, url, **kwargs: sent_fcm.append(kwargs) or (True, None, False))
    with TestSession() as db:
        user, _ = add_reader(db)
        db.add(PushSubscription(user_id=user.id, endpoint="fcm-token", p256dh="", auth="", platform="fcm", supports_actions=True))
        db.commit()
        push_module.send_push_for_user(db, user.id, "Swim", "", "/calendar", actions=("snooze", "mute"), action_token="tok")
    assert sent_fcm[0]["actions"] == ("snooze",)
