"""add calendar event icon

Revision ID: 0048_add_calendar_event_icon
Revises: 0047_add_push_categories
Create Date: 2026-04-30 10:50:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0048_add_calendar_event_icon"
down_revision: Union[str, None] = "0047_add_push_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("icon", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "icon")
