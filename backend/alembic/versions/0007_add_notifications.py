"""Add notification tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("link", sa.String, nullable=True),
        sa.Column("read", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read"])

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("reminders_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("reminder_minutes", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("quiet_start", sa.String, nullable=True),
        sa.Column("quiet_end", sa.String, nullable=True),
    )

    op.create_table(
        "notification_sent_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("source_type", sa.String, nullable=False),
        sa.Column("source_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sent_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notification_sent_log_source", "notification_sent_log", ["source_type", "source_id", "user_id"])


def downgrade() -> None:
    op.drop_index("ix_notification_sent_log_source", table_name="notification_sent_log")
    op.drop_table("notification_sent_log")
    op.drop_table("notification_preferences")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
