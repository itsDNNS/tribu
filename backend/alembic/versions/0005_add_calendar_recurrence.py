"""Add recurrence fields to calendar_events

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade() -> None:
    if not _column_exists("calendar_events", "recurrence"):
        op.add_column("calendar_events", sa.Column("recurrence", sa.String, nullable=True))
    if not _column_exists("calendar_events", "recurrence_end"):
        op.add_column("calendar_events", sa.Column("recurrence_end", sa.DateTime, nullable=True))
    if not _column_exists("calendar_events", "excluded_dates"):
        op.add_column("calendar_events", sa.Column("excluded_dates", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "excluded_dates")
    op.drop_column("calendar_events", "recurrence_end")
    op.drop_column("calendar_events", "recurrence")
