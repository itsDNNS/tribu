"""Add event color and category

Revision ID: 0016
Revises: 0015
Create Date: 2026-03-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return False
    return any(column["name"] == column_name for column in insp.get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("calendar_events", "color"):
        op.add_column("calendar_events", sa.Column("color", sa.String, nullable=True))
    if not _column_exists("calendar_events", "category"):
        op.add_column("calendar_events", sa.Column("category", sa.String, nullable=True))


def downgrade() -> None:
    if _column_exists("calendar_events", "color"):
        op.drop_column("calendar_events", "color")
    if _column_exists("calendar_events", "category"):
        op.drop_column("calendar_events", "category")
