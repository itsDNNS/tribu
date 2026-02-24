"""Add user_nav_order table

Revision ID: 0008
Revises: 0007
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_NAV_ORDER = '["dashboard","calendar","shopping","tasks","contacts","notifications","settings"]'


def upgrade() -> None:
    op.create_table(
        "user_nav_order",
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("nav_order", sa.JSON, nullable=False, server_default=sa.text(f"'{DEFAULT_NAV_ORDER}'")),
    )


def downgrade() -> None:
    op.drop_table("user_nav_order")
