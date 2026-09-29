"""Keep the object name of household activity entries.

The feed summary is an English sentence. ``household_activity.object_label``
keeps the sanitized object name on its own, so clients can phrase each
entry in the reader's language. Older entries keep only their summary.

Revision ID: 0063_activity_object_label
Revises: 0062_calendar_recurrence_rules
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0063_activity_object_label"
down_revision: Union[str, None] = "0062_calendar_recurrence_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("household_activity", sa.Column("object_label", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("household_activity", "object_label")
