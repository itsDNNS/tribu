"""Store changed occurrences of recurring calendar events as their own rows.

A calendar feed describes a changed occurrence of a recurring series as a
second VEVENT with the series UID and a RECURRENCE-ID naming the
occurrence it replaces. ``calendar_events.recurrence_id`` holds that
original start, so the UID stays unique only among series rows and
(family_id, ical_uid, recurrence_id) identifies each changed occurrence.

Downgrading deletes the changed-occurrence rows, because the old unique
index on (family_id, ical_uid) cannot hold them.

Revision ID: 0062_calendar_recurrence_id
Revises: 0061_normalize_stored_photos
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0062_calendar_recurrence_id"
down_revision: Union[str, None] = "0061_normalize_stored_photos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SERIES_WHERE = sa.text("recurrence_id IS NULL")


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("recurrence_id", sa.DateTime(), nullable=True))
    op.drop_index("uq_calendar_events_family_uid", table_name="calendar_events")
    op.create_index(
        "uq_calendar_events_family_uid",
        "calendar_events",
        ["family_id", "ical_uid"],
        unique=True,
        postgresql_where=SERIES_WHERE,
        sqlite_where=SERIES_WHERE,
    )
    op.create_index(
        "uq_calendar_events_family_uid_recurrence",
        "calendar_events",
        ["family_id", "ical_uid", "recurrence_id"],
        unique=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM calendar_events WHERE recurrence_id IS NOT NULL")
    op.drop_index("uq_calendar_events_family_uid_recurrence", table_name="calendar_events")
    op.drop_index("uq_calendar_events_family_uid", table_name="calendar_events")
    op.create_index(
        "uq_calendar_events_family_uid",
        "calendar_events",
        ["family_id", "ical_uid"],
        unique=True,
    )
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("recurrence_id")
