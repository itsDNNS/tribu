"""The Sunday evening heads-up with the coming week's duties (discussion #586)."""

from __future__ import annotations

from datetime import date, datetime, time

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.push import PushResult
from app.database import Base
from app.models import (
    Duty,
    DutyException,
    DutySlot,
    Family,
    Membership,
    Notification,
    NotificationPreference,
    User,
    UserNavOrder,
)
from app.security import hash_password

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
    yield
    app_timezone.cache_clear()
    Base.metadata.drop_all(bind=engine)


def _person(db, family, name, *, adult=True, language=None, push_categories=None):
    user = User(email=f"{name}@example.com", password_hash=hash_password("p"), display_name=name)
    db.add(user)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="member", is_adult=adult))
    db.add(NotificationPreference(
        user_id=user.id, reminders_enabled=True, reminder_minutes=30, push_enabled=True,
        push_categories=push_categories,
    ))
    if language:
        db.add(UserNavOrder(user_id=user.id, nav_order=[], ui_language=language))
    db.flush()
    return user


def _seed(*, anna_categories=None) -> dict:
    """Pick up the kids Mon–Fri next week: Anna Mon/Tue, Ben Wed–Fri; Friday Dec 18 skipped."""
    with TestSession() as db:
        family = Family(name="Home")
        db.add(family)
        db.flush()
        anna = _person(db, family, "anna", language="de", push_categories=anna_categories)
        ben = _person(db, family, "ben")
        kid = _person(db, family, "kid", adult=False)
        duty = Duty(family_id=family.id, title="Pick up the kids", due_time=time(15, 30), created_by_user_id=anna.id)
        duty.slots = [DutySlot(weekday=day, assigned_to_user_id=anna.id if day < 2 else ben.id) for day in range(5)]
        duty.exceptions = [DutyException(date=date(2026, 12, 18), skipped=True)]
        db.add(duty)
        db.commit()
        return {"anna": anna.id, "ben": ben.id, "kid": kid.id}


def _run(monkeypatch, wall_now: datetime) -> list:
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: wall_now)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: wall_now)
    calls = []

    def send(db, uid, title, body, link, **options):
        calls.append({"uid": uid, "title": title, "body": body, "link": link})
        return PushResult(attempted=1, succeeded=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", send)
    scheduler_module._check_notifications()
    return calls


SUNDAY_EVENING = datetime(2026, 12, 13, 18, 5)


def test_sunday_evening_tells_each_grown_up_their_share(monkeypatch):
    people = _seed()
    calls = _run(monkeypatch, SUNDAY_EVENING)

    by_user = {call["uid"]: call for call in calls}
    assert set(by_user) == {people["anna"], people["ben"]}, "children get no heads-up"
    assert by_user[people["anna"]]["title"] == "Dienste nächste Woche"
    assert by_user[people["anna"]]["body"] == "Für dich: 2 von 4"
    assert by_user[people["ben"]]["body"] == "For you: 2 of 4"
    assert by_user[people["ben"]]["link"] == "/duties"
    with TestSession() as db:
        assert {n.type for n in db.query(Notification)} == {"duty_week"}

    assert _run(monkeypatch, datetime(2026, 12, 13, 19, 5)) == [], "once per week"


def test_no_heads_up_on_other_days_or_earlier_on_sunday(monkeypatch):
    _seed()
    assert _run(monkeypatch, datetime(2026, 12, 13, 17, 55)) == []
    assert _run(monkeypatch, datetime(2026, 12, 12, 18, 5)) == []


def test_the_push_category_turns_it_off(monkeypatch):
    people = _seed(anna_categories={"weekly_duties": False})
    calls = _run(monkeypatch, SUNDAY_EVENING)
    assert {call["uid"] for call in calls} == {people["ben"]}


def test_monday_morning_catches_up_after_quiet_hours(monkeypatch):
    people = _seed()
    with TestSession() as db:
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == people["anna"]).one()
        pref.quiet_start, pref.quiet_end = "18:00", "08:00"
        db.commit()

    sunday = _run(monkeypatch, SUNDAY_EVENING)
    assert {call["uid"] for call in sunday} == {people["ben"]}
    monday = _run(monkeypatch, datetime(2026, 12, 14, 8, 5))
    assert [(call["uid"], call["body"]) for call in monday] == [(people["anna"], "Für dich: 2 von 4")]
    assert _run(monkeypatch, datetime(2026, 12, 14, 12, 5)) == []


def test_alternating_weeks_count_in_the_heads_up(monkeypatch):
    people = _seed()
    with TestSession() as db:
        duty = db.query(Duty).one()
        duty.alternate_from = date(2026, 12, 7)  # so next week (Dec 14) is week B
        for slot in duty.slots:
            slot.alternate_assigned_to_user_id = people["ben"]
        db.commit()

    by_user = {call["uid"]: call["body"] for call in _run(monkeypatch, SUNDAY_EVENING)}
    assert by_user == {people["ben"]: "For you: 4 of 4"}, "Anna has nothing next week, so she hears nothing"


def test_a_grown_up_in_two_families_hears_from_each_with_duties(monkeypatch):
    people = _seed()
    with TestSession() as db:
        quiet = Family(name="No duties")
        busy = Family(name="Grandparents")
        db.add_all([quiet, busy])
        db.flush()
        db.add(Membership(user_id=people["ben"], family_id=quiet.id, role="member", is_adult=True))
        db.add(Membership(user_id=people["ben"], family_id=busy.id, role="member", is_adult=True))
        garden = Duty(family_id=busy.id, title="Water the garden")
        garden.slots = [DutySlot(weekday=5, assigned_to_user_id=people["ben"])]
        db.add(garden)
        db.commit()
        busy_id = busy.id

    bens = [call for call in _run(monkeypatch, SUNDAY_EVENING) if call["uid"] == people["ben"]]
    assert sorted(call["body"] for call in bens) == ["For you: 1 of 1", "For you: 2 of 4"]
    with TestSession() as db:
        families = {n.family_id for n in db.query(Notification).filter(Notification.user_id == people["ben"])}
        assert busy_id in families and len(families) == 2
