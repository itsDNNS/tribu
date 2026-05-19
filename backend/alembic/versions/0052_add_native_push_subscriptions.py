"""add native push subscriptions

Revision ID: 0052_native_push
Revises: 0051_notification_destinations
Create Date: 2026-05-19 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0052_native_push"
down_revision: Union[str, None] = "0051_notification_destinations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("push_subscriptions", sa.Column("platform", sa.String(length=20), server_default="web", nullable=False))
    op.add_column("push_subscriptions", sa.Column("device_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("push_subscriptions", "device_name")
    op.drop_column("push_subscriptions", "platform")
