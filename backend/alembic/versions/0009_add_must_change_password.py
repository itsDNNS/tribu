"""Add must_change_password to users

Revision ID: 0009
Revises: 0008
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [c["name"] for c in inspector.get_columns(table)]
    return column in columns


def upgrade() -> None:
    if not _column_exists("users", "must_change_password"):
        op.add_column(
            "users",
            sa.Column("must_change_password", sa.Boolean, nullable=False, server_default="false"),
        )


def downgrade() -> None:
    if _column_exists("users", "must_change_password"):
        op.drop_column("users", "must_change_password")
