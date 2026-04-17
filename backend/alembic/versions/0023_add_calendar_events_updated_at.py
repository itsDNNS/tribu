"""Add updated_at to calendar_events for DAV cache invalidation.

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-17

Introduces an ``updated_at`` timestamp so every mutation to a row
moves the column forward. CalDAV clients derive their ``CS:getctag``
and item ``Last-Modified`` headers from it; without the column an
edit made in Tribu would never invalidate client-side caches.

Existing rows are backfilled with their ``created_at`` value so
clients do not see every row as freshly modified after the upgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if _has_column("calendar_events", "updated_at"):
        return
    op.add_column(
        "calendar_events",
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute("UPDATE calendar_events SET updated_at = created_at")


def downgrade() -> None:
    if not _has_column("calendar_events", "updated_at"):
        return
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("updated_at")
