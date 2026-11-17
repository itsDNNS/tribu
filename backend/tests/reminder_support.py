"""Shared setup for the event reminder tests: an in-memory database that
the scheduler and the API both use, a family, events, and scheduler runs."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import CalendarEvent, Family, Membership, Notification, NotificationPreference, ReminderSnooze, User
from app.security import hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False)

NOW = datetime(2026, 4, 25, 12, 0, 0)
# Anna and Ben are grown-ups, Cleo is a child.
MEMBERS = (("anna", True), ("ben", True), ("cleo", False))


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def at(monkeypatch, moment: datetime, wall: datetime | None = None) -> None:
    """Sets the scheduler's clock: ``moment`` in UTC, ``wall`` local (the same by default)."""
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: moment)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: wall or moment)


@pytest.fixture
def reminder_db(monkeypatch):
    """The database for the scheduler (its clock at ``NOW``, local time
    equal to UTC) and the API."""
    from app.core import scheduler as scheduler_module
    from app.main import app

    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)
    at(monkeypatch, NOW)

    def _session():
        with TestSession() as db:
            yield db

    app.dependency_overrides[get_db] = _session
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def destinations(monkeypatch):
    """Records what would go to the family's notification destinations."""
    from app.core import scheduler as scheduler_module

    calls: list[dict] = []
    monkeypatch.setattr(scheduler_module, "dispatch_family_notification", lambda **kwargs: calls.append(kwargs))
    return calls


def add_family(name: str = "Busy family", members=MEMBERS) -> tuple[int, list[int]]:
    """A family whose members get reminders 30 minutes ahead, in the app only."""
    with TestSession() as db:
        fam = Family(name=name)
        db.add(fam)
        db.flush()
        ids = []
        for member, adult in members:
            user = User(email=f"{member}@example.com", password_hash=hash_password("p"), display_name=member.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=fam.id, role="admin" if adult else "member", is_adult=adult))
            db.add(NotificationPreference(user_id=user.id, reminders_enabled=True, reminder_minutes=30, push_enabled=False))
            ids.append(user.id)
        db.commit()
        return fam.id, ids


def add_event(family_id: int, **fields) -> int:
    with TestSession() as db:
        row = CalendarEvent(**{
            "family_id": family_id, "title": "Dentist", "starts_at": NOW + timedelta(minutes=20), "all_day": False,
            **fields,
        })
        db.add(row)
        db.commit()
        return row.id


def reminded(event_id: int) -> list[int]:
    """Who has an in-app reminder of the event, once per reminder."""
    with TestSession() as db:
        return sorted(
            uid for (uid,) in db.query(Notification.user_id).filter(
                Notification.type == "event_reminder", Notification.link.like(f"/calendar?event={event_id}&%"),
            )
        )


def run_scheduler() -> None:
    from app.core.scheduler import _check_notifications

    _check_notifications()


def add_snooze(family_id: int, user_id: int, event_id: int, starts_at: datetime = NOW + timedelta(minutes=20)) -> None:
    """A snoozed reminder of the occurrence at ``starts_at``, due a minute ago."""
    with TestSession() as db:
        db.add(ReminderSnooze(
            user_id=user_id, family_id=family_id, source_type="event", source_id=event_id,
            notification_type="event_reminder", title="Dentist", body="Snoozed",
            link=f"/calendar?event={event_id}&at={starts_at.isoformat()}",
            remind_at=NOW - timedelta(minutes=1), expires_at=starts_at,
        ))
        db.commit()
