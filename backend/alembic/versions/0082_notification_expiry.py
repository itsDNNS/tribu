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

Timestamps are naive UTC throughout Tribu, and from now on
``notifications.created_at`` is written by the app in UTC. It used to come
only from the database clock (``now()``), which PostgreSQL stores in the
session time zone. On PostgreSQL the upgrade converts existing values to UTC
with the database's own zone rules before computing expiries. Which zone the
sessions that wrote them used cannot be known afterwards; the current
session zone is assumed (for a default setup that is UTC and nothing
changes). SQLite's CURRENT_TIMESTAMP is UTC already.

Snoozed reminders of recurring events that were snoozed before snoozes kept
their occurrence get a bounded expiry of a day after they were snoozed.

Revision ID: 0082_notification_expiry
Revises: 0081_shopping_photo_thumbnails
"""

from datetime import timedelta
from typing import Sequence, Union

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


# On PostgreSQL: read a session-zone wall time as UTC, and back.
_CREATED_AT_TO_UTC = (
    "UPDATE notifications SET created_at = "
    "(created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'"
)
_CREATED_AT_TO_SESSION_ZONE = (
    "UPDATE notifications SET created_at = "
    "(created_at AT TIME ZONE 'UTC') AT TIME ZONE current_setting('TimeZone')"
)
# A snooze runs out an hour after it was made (SNOOZE_DELAY); without its
# occurrence a snoozed recurring reminder lasts a day from then.
_LEGACY_SNOOZE_LIFETIME = timedelta(days=1) - timedelta(hours=1)

_snoozes = sa.table(
    "reminder_snoozes",
    sa.column("id", sa.Integer),
    sa.column("source_type", sa.String),
    sa.column("source_id", sa.Integer),
    sa.column("remind_at", sa.DateTime),
    sa.column("delivered_at", sa.DateTime),
    sa.column("expires_at", sa.DateTime),
)
_events = sa.table("calendar_events", sa.column("id", sa.Integer), sa.column("recurrence", sa.String))


def _backfill_snoozes(bind) -> None:
    rows = bind.execute(
        sa.select(_snoozes.c.id, _snoozes.c.remind_at)
        .select_from(_snoozes.join(_events, _events.c.id == _snoozes.c.source_id))
        .where(
            _snoozes.c.source_type == "event",
            _snoozes.c.delivered_at.is_(None),
            _snoozes.c.expires_at.is_(None),
            _events.c.recurrence.isnot(None),
        )
    ).fetchall()
    if rows:
        bind.execute(
            _snoozes.update().where(_snoozes.c.id == sa.bindparam("row_id")).values(expires_at=sa.bindparam("value")),
            [{"row_id": row.id, "value": row.remind_at + _LEGACY_SNOOZE_LIFETIME} for row in rows],
        )


def _backfill_expiry(bind) -> None:
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
            {"row_id": row.id, "value": row.created_at + _LEGACY_LIFETIMES[row.type]}
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
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text(_CREATED_AT_TO_UTC))
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
    _backfill_snoozes(bind)

    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])
    op.create_index("ix_notifications_expires_at", "notifications", ["expires_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # The old code writes created_at in the session zone again.
        bind.execute(sa.text(_CREATED_AT_TO_SESSION_ZONE))
    op.drop_index("ix_notifications_expires_at", table_name="notifications")
    op.drop_index("ix_notifications_read_at", table_name="notifications")
    with op.batch_alter_table("reminder_snoozes") as batch:
        batch.drop_column("expires_at")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("expires_at")
        batch.drop_column("read_at")
