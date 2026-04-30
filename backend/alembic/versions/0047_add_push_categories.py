"""add push notification categories

Revision ID: 0047_add_push_categories
Revises: 0046
Create Date: 2026-04-30 09:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "0047_add_push_categories"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "notification_preferences",
        sa.Column("push_categories", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade():
    op.drop_column("notification_preferences", "push_categories")
