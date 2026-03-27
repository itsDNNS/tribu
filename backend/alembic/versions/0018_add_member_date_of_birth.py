"""Add member date of birth

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0018"
down_revision: Union[str, None] = "0017"
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
    if not _column_exists("memberships", "date_of_birth"):
        op.add_column("memberships", sa.Column("date_of_birth", sa.Date, nullable=True))


def downgrade() -> None:
    if _column_exists("memberships", "date_of_birth"):
        op.drop_column("memberships", "date_of_birth")
