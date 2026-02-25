"""Add assigned_to column to calendar_events

Revision ID: 0012
Revises: 0011
Create Date: 2026-02-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade() -> None:
    if not _column_exists("calendar_events", "assigned_to"):
        op.add_column("calendar_events", sa.Column("assigned_to", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "assigned_to")
