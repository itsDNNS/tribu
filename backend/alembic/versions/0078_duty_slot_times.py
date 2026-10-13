"""A weekly duty can have its own time on single weekdays.

- ``duty_slots.due_time``: the local time on that weekday when it differs
  from ``duties.due_time`` (for example pickup at noon on Wednesdays).

Revision ID: 0078_duty_slot_times
Revises: 0077_duty_alternate_weeks
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0078_duty_slot_times"
down_revision: Union[str, None] = "0077_duty_alternate_weeks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("duty_slots") as batch:
        batch.add_column(sa.Column("due_time", sa.Time(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("duty_slots") as batch:
        batch.drop_column("due_time")
