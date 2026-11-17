"""Keeps the notification list short and current.

Read notifications are removed a week after they were read. Time-bound
reminders carry ``expires_at`` (the start of the event they announce, the
end of the birthday they point to); from then on they are hidden and
removed, read or not, because their text is no longer true.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import Notification

READ_NOTIFICATION_RETENTION = timedelta(days=7)


def _stale(moment: datetime):
    return or_(
        Notification.expires_at <= moment,
        and_(
            Notification.read.is_(True),
            Notification.read_at.isnot(None),
            Notification.read_at <= moment - READ_NOTIFICATION_RETENTION,
        ),
    )


def still_shown(now: datetime | None = None):
    """Filter clause for notifications that are neither expired nor read
    long ago, so lists agree with the cleanup before it has run."""
    moment = now or utcnow()
    return and_(
        or_(Notification.expires_at.is_(None), Notification.expires_at > moment),
        or_(
            Notification.read.is_(False),
            Notification.read_at.is_(None),
            Notification.read_at > moment - READ_NOTIFICATION_RETENTION,
        ),
    )


def purge_notifications(db: Session, now: datetime | None = None) -> tuple[int, set[int]]:
    """Deletes expired notifications and those read more than a week ago.

    Returns how many rows went and whose unread counts may have changed.
    Does not commit.
    """
    stale = _stale(now or utcnow())
    users = {uid for (uid,) in db.query(Notification.user_id).filter(stale).distinct()}
    if not users:
        return 0, users
    deleted = db.query(Notification).filter(stale).delete(synchronize_session=False)
    return deleted, users
