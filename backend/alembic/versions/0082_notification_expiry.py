"""Read and expiry times for notifications.

- ``notifications.read_at``: when the notification was marked read. Read
  notifications are removed a week later.
- ``notifications.expires_at``: when a time-bound reminder stops being true,
  for example the start of the event it announces. Expired notifications
  are hidden and removed, read or not.

Existing read notifications get ``read_at`` set to the time of the upgrade,
so they disappear a week after it instead of all at once. Existing
time-bound reminders get a generous expiry from their creation time, since
the exact event or birthday they announced is not stored with them.

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

_notifications = sa.table(
    "notifications",
    sa.column("id", sa.Integer),
    sa.column("type", sa.String),
    sa.column("read", sa.Boolean),
    sa.column("created_at", sa.DateTime),
    sa.column("read_at", sa.DateTime),
    sa.column("expires_at", sa.DateTime),
)


def upgrade() -> None:
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(), nullable=True))
    op.add_column("notifications", sa.Column("expires_at", sa.DateTime(), nullable=True))

    bind = op.get_bind()
    bind.execute(
        _notifications.update()
        .where(_notifications.c.read.is_(True))
        .values(read_at=utcnow())
    )
    rows = bind.execute(
        sa.select(_notifications.c.id, _notifications.c.type, _notifications.c.created_at)
        .where(_notifications.c.type.in_(list(_LEGACY_LIFETIMES)))
    ).fetchall()
    updates = [
        {"row_id": row.id, "value": row.created_at + _LEGACY_LIFETIMES[row.type]}
        for row in rows
        if row.created_at is not None
    ]
    if updates:
        bind.execute(
            _notifications.update()
            .where(_notifications.c.id == sa.bindparam("row_id"))
            .values(expires_at=sa.bindparam("value")),
            updates,
        )


def downgrade() -> None:
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("expires_at")
        batch.drop_column("read_at")
