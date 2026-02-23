"""Add shopping_lists and shopping_items tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if not _table_exists("shopping_lists"):
        op.create_table(
            "shopping_lists",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("shopping_items"):
        op.create_table(
            "shopping_items",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("list_id", sa.Integer, sa.ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("spec", sa.String, nullable=True),
            sa.Column("checked", sa.Boolean, nullable=False, server_default=sa.text("false")),
            sa.Column("checked_at", sa.DateTime, nullable=True),
            sa.Column("added_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0")),
        )


def downgrade() -> None:
    op.drop_table("shopping_items")
    op.drop_table("shopping_lists")
