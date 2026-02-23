"""Add is_adult to memberships and profile_image to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade() -> None:
    if not _column_exists("memberships", "is_adult"):
        op.add_column("memberships", sa.Column("is_adult", sa.Boolean, nullable=False, server_default="false"))

    if not _column_exists("users", "profile_image"):
        op.add_column("users", sa.Column("profile_image", sa.String, nullable=True))

    # Normalize legacy 'owner' role to 'admin'
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE memberships SET role='admin' WHERE role='owner'"))
    conn.execute(sa.text("UPDATE memberships SET is_adult=TRUE WHERE role='admin'"))


def downgrade() -> None:
    op.drop_column("users", "profile_image")
    op.drop_column("memberships", "is_adult")
