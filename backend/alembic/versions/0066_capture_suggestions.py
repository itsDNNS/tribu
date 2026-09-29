"""Children's suggestions in the quick capture inbox (Tribu 2.0, E5).

``quick_capture_items.is_suggestion`` marks entries a child captured; an
adult confirms or dismisses them.

Revision ID: 0066_capture_suggestions
Revises: 0065_notification_actions
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0066_capture_suggestions"
down_revision: Union[str, None] = "0065_notification_actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quick_capture_items",
        sa.Column("is_suggestion", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("quick_capture_items", "is_suggestion")
