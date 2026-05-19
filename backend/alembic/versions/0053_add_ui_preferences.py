"""add ui preferences

Revision ID: 0053_ui_preferences
Revises: 0052_native_push
Create Date: 2026-05-19 16:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0053_ui_preferences"
down_revision: Union[str, None] = "0052_native_push"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_nav_order", sa.Column("ui_theme", sa.String(), nullable=True))
    op.add_column("user_nav_order", sa.Column("ui_language", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_nav_order", "ui_language")
    op.drop_column("user_nav_order", "ui_theme")
