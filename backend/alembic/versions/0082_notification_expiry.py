"""Read and expiry times for notifications.

- ``notifications.read_at``: when the notification was marked read. Read
  notifications are removed a week later.
- ``notifications.expires_at``: when a time-bound reminder stops being true,
  for example the start of the event it announces. Expired notifications
  are hidden and removed, read or not.
- ``reminder_snoozes.expires_at``: the same for a snoozed reminder, so a
  snooze that runs out after the event started is dropped.
- On SQLite, ``notifications`` gets AUTOINCREMENT so ids never repeat after
  the newest rows were deleted. The live stream and "delete all up to this
  id" rely on that; PostgreSQL sequences never reuse ids anyway.

Existing read notifications get ``read_at`` set to the time of the upgrade,
so they disappear a week after it instead of all at once. Existing
time-bound reminders get a generous expiry from their creation time, since
the exact event or birthday they announced is not stored with them.

Timestamps are naive UTC throughout Tribu. ``notifications.created_at`` used
to come only from the database clock (``now()``), which PostgreSQL stores in
the session time zone; the backfill converts from that zone, so a server
whose sessions do not run in UTC still gets correct expiry times.

Revision ID: 0082_notification_expiry
Revises: 0081_shopping_photo_thumbnails
"""

from datetime import timedelta, timezone
from typing import Sequence, Union
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa

from app.core.clock import utcnow


revision: str = "0082_notification_expiry"
down_revision: Union[str, None] = "0081_shopping_photo_thumbnails"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Latest point at which an older reminder of each type can still be true,
# counted from when it was created. Event reminders go out at most an hour
# (the longest choice in the settings) before the start; "birthday tomorrow"
# and meal reminders are about the next day; gift reminders and the duty
# preview are about the coming week.
_LEGACY_LIFETIMES = {
    "event_reminder": timedelta(days=1),
    "birthday": timedelta(days=2),
    "meal_reminder": timedelta(days=2),
    "gift_reminder": timedelta(days=8),
    "duty_week": timedelta(days=8),
}
_BATCH = 1000

_notifications = sa.table(
    "notifications",
    sa.column("id", sa.Integer),
    sa.column("type", sa.String),
    sa.column("read", sa.Boolean),
    sa.column("created_at", sa.DateTime),
    sa.column("read_at", sa.DateTime),
    sa.column("expires_at", sa.DateTime),
)


def _session_zone(bind):
    """The zone PostgreSQL wrote ``now()`` in, or None for UTC."""
    if bind.dialect.name != "postgresql":
        return None  # SQLite's CURRENT_TIMESTAMP is UTC.
    name = bind.execute(sa.text("SHOW TIME ZONE")).scalar() or "UTC"
    if name.upper() in ("UTC", "ETC/UTC", "GMT", "Z", "UCT"):
        return None
    try:
        return ZoneInfo(name)
    except Exception:
        return None


def _as_utc(value, zone):
    if zone is None:
        return value
    return value.replace(tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)


def _backfill_expiry(bind) -> None:
    zone = _session_zone(bind)
    update = (
        _notifications.update()
        .where(_notifications.c.id == sa.bindparam("row_id"))
        .values(expires_at=sa.bindparam("value"))
    )
    last_id = 0
    while True:
        rows = bind.execute(
            sa.select(_notifications.c.id, _notifications.c.type, _notifications.c.created_at)
            .where(_notifications.c.type.in_(list(_LEGACY_LIFETIMES)), _notifications.c.id > last_id)
            .order_by(_notifications.c.id)
            .limit(_BATCH)
        ).fetchall()
        if not rows:
            return
        last_id = rows[-1].id
        updates = [
            {"row_id": row.id, "value": _as_utc(row.created_at, zone) + _LEGACY_LIFETIMES[row.type]}
            for row in rows
            if row.created_at is not None
        ]
        if updates:
            bind.execute(update, updates)


def upgrade() -> None:
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(), nullable=True))
    op.add_column("notifications", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("reminder_snoozes", sa.Column("expires_at", sa.DateTime(), nullable=True))

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # Rebuilt with AUTOINCREMENT; copying the rows records the highest id.
        with op.batch_alter_table(
            "notifications", recreate="always", table_kwargs={"sqlite_autoincrement": True},
        ):
            pass

    bind.execute(
        _notifications.update()
        .where(_notifications.c.read.is_(True))
        .values(read_at=utcnow())
    )
    _backfill_expiry(bind)

    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])
    op.create_index("ix_notifications_expires_at", "notifications", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_notifications_expires_at", table_name="notifications")
    op.drop_index("ix_notifications_read_at", table_name="notifications")
    with op.batch_alter_table("reminder_snoozes") as batch:
        batch.drop_column("expires_at")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("expires_at")
        batch.drop_column("read_at")
