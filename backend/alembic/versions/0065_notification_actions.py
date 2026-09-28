"""Actions in reminder notifications (Tribu 2.0, N-2).

``push_subscriptions.supports_actions`` marks clients that show action
buttons themselves; ``reminder_snoozes`` keeps reminders someone asked to
hear about again later.

Revision ID: 0065_notification_actions
Revises: 0064_family_hidden_areas
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0065_notification_actions"
down_revision: Union[str, None] = "0064_family_hidden_areas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "push_subscriptions",
        sa.Column("supports_actions", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "reminder_snoozes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(length=20), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("notification_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(), nullable=True),
        sa.Column("remind_at", sa.DateTime(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reminder_snoozes_id", "reminder_snoozes", ["id"])
    op.create_index("ix_reminder_snoozes_user_id", "reminder_snoozes", ["user_id"])
    op.create_index("ix_reminder_snoozes_due", "reminder_snoozes", ["delivered_at", "remind_at"])


def downgrade() -> None:
    op.drop_index("ix_reminder_snoozes_due", table_name="reminder_snoozes")
    op.drop_index("ix_reminder_snoozes_user_id", table_name="reminder_snoozes")
    op.drop_index("ix_reminder_snoozes_id", table_name="reminder_snoozes")
    op.drop_table("reminder_snoozes")
    op.drop_column("push_subscriptions", "supports_actions")
