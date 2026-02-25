"""Add push subscriptions

Revision ID: 0013
Revises: 0012
Create Date: 2026-02-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"),
        {"t": table_name},
    )
    return result.scalar()


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"),
        {"t": table_name, "c": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    if not _table_exists("push_subscriptions"):
        op.create_table(
            "push_subscriptions",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("endpoint", sa.Text, nullable=False, unique=True),
            sa.Column("p256dh", sa.Text, nullable=False),
            sa.Column("auth", sa.Text, nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])

    if not _column_exists("notification_preferences", "push_enabled"):
        op.add_column(
            "notification_preferences",
            sa.Column("push_enabled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        )


def downgrade() -> None:
    if _column_exists("notification_preferences", "push_enabled"):
        op.drop_column("notification_preferences", "push_enabled")
    if _table_exists("push_subscriptions"):
        op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
        op.drop_table("push_subscriptions")
