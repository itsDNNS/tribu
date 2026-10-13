"""Weekly duties can pause for a while, for example during school holidays.

- ``duty_pauses``: a duty and the first and last day of a time without it.

Revision ID: 0079_duty_pauses
Revises: 0078_duty_slot_times
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0079_duty_pauses"
down_revision: Union[str, None] = "0078_duty_slot_times"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "duty_pauses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("duty_id", sa.Integer(), sa.ForeignKey("duties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start", sa.Date(), nullable=False),
        sa.Column("end", sa.Date(), nullable=False),
    )
    op.create_index("ix_duty_pauses_id", "duty_pauses", ["id"])
    op.create_index("ix_duty_pauses_duty_id", "duty_pauses", ["duty_id"])


def downgrade() -> None:
    op.drop_index("ix_duty_pauses_duty_id", table_name="duty_pauses")
    op.drop_index("ix_duty_pauses_id", table_name="duty_pauses")
    op.drop_table("duty_pauses")
