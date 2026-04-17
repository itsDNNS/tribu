"""Add CalDAV identity columns to calendar_events.

Revision ID: 0024
Revises: 0023
Create Date: 2026-04-17

Stores the iCalendar ``UID`` the client picked plus the DAV href
(path segment inside the collection). Both are unique per family so
a PUT can be resolved to the same row on the follow-up fetch, and so
two clients editing the same calendar cannot collide on the same UID.

Existing rows are backfilled with synthesized values (``tribu-event-<id>``)
so the storage plugin can still resolve legacy hrefs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return any(i["name"] == name for i in insp.get_indexes(table))


def upgrade() -> None:
    if not _has_column("calendar_events", "ical_uid"):
        op.add_column("calendar_events", sa.Column("ical_uid", sa.String(200), nullable=True))
        op.execute(
            "UPDATE calendar_events "
            "SET ical_uid = 'tribu-event-' || id || '@tribu.local' "
            "WHERE ical_uid IS NULL"
        )
    if not _has_column("calendar_events", "dav_href"):
        op.add_column("calendar_events", sa.Column("dav_href", sa.String(250), nullable=True))
        op.execute(
            "UPDATE calendar_events "
            "SET dav_href = 'tribu-event-' || id || '.ics' "
            "WHERE dav_href IS NULL"
        )
    if not _has_index("calendar_events", "uq_calendar_events_family_uid"):
        op.create_index(
            "uq_calendar_events_family_uid",
            "calendar_events",
            ["family_id", "ical_uid"],
            unique=True,
        )
    if not _has_index("calendar_events", "uq_calendar_events_family_href"):
        op.create_index(
            "uq_calendar_events_family_href",
            "calendar_events",
            ["family_id", "dav_href"],
            unique=True,
        )


def downgrade() -> None:
    if _has_index("calendar_events", "uq_calendar_events_family_href"):
        op.drop_index("uq_calendar_events_family_href", table_name="calendar_events")
    if _has_index("calendar_events", "uq_calendar_events_family_uid"):
        op.drop_index("uq_calendar_events_family_uid", table_name="calendar_events")
    if _has_column("calendar_events", "dav_href"):
        with op.batch_alter_table("calendar_events") as batch:
            batch.drop_column("dav_href")
    if _has_column("calendar_events", "ical_uid"):
        with op.batch_alter_table("calendar_events") as batch:
            batch.drop_column("ical_uid")
