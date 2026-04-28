"""Add recipe quality-of-life fields.

Revision ID: 0038
Revises: 0037
Create Date: 2026-04-28
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    if _has_table("recipes") and not _has_column("recipes", "is_favorite"):
        op.add_column(
            "recipes",
            sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if _has_table("recipes") and not _has_column("recipes", "last_used_at"):
        op.add_column("recipes", sa.Column("last_used_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    if _has_table("recipes") and _has_column("recipes", "last_used_at"):
        op.drop_column("recipes", "last_used_at")
    if _has_table("recipes") and _has_column("recipes", "is_favorite"):
        op.drop_column("recipes", "is_favorite")
