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
    result = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"),
        {"t": table_name, "c": column_name},
    )
    return result.scalar()


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
