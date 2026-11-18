"""Shared data for the event reminder tests: a family, events, snoozes and
scheduler runs. The ``reminder_db`` and ``destinations`` fixtures are in
``conftest.py``."""

from __future__ import annotations

from datetime import datetime, timedelta

from app.models import CalendarEvent, Family, Notification, NotificationPreference, ReminderSnooze
from tests.support import TestSession, add_member

NOW = datetime(2026, 4, 25, 12, 0, 0)
# Anna and Ben are grown-ups, Cleo is a child.
MEMBERS = (("anna", True), ("ben", True), ("cleo", False))


def add_family(name: str = "Busy family", members=MEMBERS) -> tuple[int, list[int]]:
    """A family whose members get reminders 30 minutes ahead, in the app only."""
    with TestSession() as db:
        fam = Family(name=name)
        db.add(fam)
        db.flush()
        ids = []
        for member, adult in members:
            user_id = add_member(
                db, f"{member}@example.com", scopes=None, family_id=fam.id, is_adult=adult,
                password="p", display_name=member.title(),
            ).user_id
            db.add(NotificationPreference(user_id=user_id, reminders_enabled=True, reminder_minutes=30, push_enabled=False))
            ids.append(user_id)
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
