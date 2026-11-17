"""Calendar events can remind only the person who created them.

- ``calendar_events.remind_only_creator``: when true, only the creator gets
  the reminder before the event starts. Existing events keep reminding
  everyone.

Revision ID: 0083_event_remind_only_creator
Revises: 0082_notification_expiry
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0083_event_remind_only_creator"
down_revision: Union[str, None] = "0082_notification_expiry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column("remind_only_creator", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("remind_only_creator")
