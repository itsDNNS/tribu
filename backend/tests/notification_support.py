"""Shared seed for the reminder action tests (notification buttons, meal
reminders)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Family, NotificationPreference, User, UserNavOrder
from tests.support import add_member


def add_reader(db: Session, *, language: str | None = None, adult: bool = True) -> tuple[User, Family]:
    """Anna, alone in her family, with reminders 30 minutes ahead and push
    on; ``language`` sets her UI language. Flushes but does not commit."""
    member = add_member(
        db, "act@example.com", scopes=None, family_name="Act-Family", is_adult=adult, password="p", display_name="Anna",
    )
    db.add(NotificationPreference(user_id=member.user_id, reminders_enabled=True, reminder_minutes=30, push_enabled=True))
    if language:
        db.add(UserNavOrder(user_id=member.user_id, nav_order=[], ui_language=language))
    db.flush()
    return db.get(User, member.user_id), db.get(Family, member.family_id)
