"""add calendar event location

Revision ID: 0045
Revises: 0044
Create Date: 2026-04-30 02:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("location", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "location")
