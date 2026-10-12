"""Weekly duties that alternate every other week.

- ``duties.alternate_from``: the Monday of a week A; weeks after it
  alternate between A and B. Null keeps every week alike.
- ``duty_slots.alternate_assigned_to_user_id``: who does it in week B.

Revision ID: 0077_duty_alternate_weeks
Revises: 0076_weekly_duties
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0077_duty_alternate_weeks"
down_revision: Union[str, None] = "0076_weekly_duties"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("duties") as batch:
        batch.add_column(sa.Column("alternate_from", sa.Date(), nullable=True))
    with op.batch_alter_table("duty_slots") as batch:
        batch.add_column(sa.Column("alternate_assigned_to_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_duty_slots_alternate_assigned_to_user_id", "users",
            ["alternate_assigned_to_user_id"], ["id"], ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("duty_slots") as batch:
        batch.drop_constraint("fk_duty_slots_alternate_assigned_to_user_id", type_="foreignkey")
        batch.drop_column("alternate_assigned_to_user_id")
    with op.batch_alter_table("duties") as batch:
        batch.drop_column("alternate_from")
