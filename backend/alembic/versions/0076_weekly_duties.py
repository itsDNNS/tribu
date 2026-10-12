"""Weekly duties with a default person per weekday and per-date exceptions.

- ``duties``: a recurring household duty (title, optional local due time).
- ``duty_slots``: the weekdays a duty happens on and who does it by default.
- ``duty_exceptions``: one date of a duty taken by someone else, or skipped.
- ``tasks.duty_id`` / ``tasks.duty_date``: the duty and date a task was
  created for, unique so each date gets one task.

Revision ID: 0076_weekly_duties
Revises: 0075_gifts_wishes_occasions
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0076_weekly_duties"
down_revision: Union[str, None] = "0075_gifts_wishes_occasions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "duties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("due_time", sa.Time(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_duties_id", "duties", ["id"])
    op.create_index("ix_duties_family_id", "duties", ["family_id"])
    op.create_table(
        "duty_slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("duty_id", sa.Integer(), sa.ForeignKey("duties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("duty_id", "weekday", name="uq_duty_slot_weekday"),
    )
    op.create_index("ix_duty_slots_id", "duty_slots", ["id"])
    op.create_index("ix_duty_slots_duty_id", "duty_slots", ["duty_id"])
    op.create_table(
        "duty_exceptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("duty_id", sa.Integer(), sa.ForeignKey("duties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default="false"),
        sa.UniqueConstraint("duty_id", "date", name="uq_duty_exception_date"),
    )
    op.create_index("ix_duty_exceptions_id", "duty_exceptions", ["id"])
    op.create_index("ix_duty_exceptions_duty_id", "duty_exceptions", ["duty_id"])
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("duty_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("duty_date", sa.Date(), nullable=True))
        batch.create_foreign_key("fk_tasks_duty_id", "duties", ["duty_id"], ["id"], ondelete="SET NULL")
    op.create_index("uq_tasks_duty_date", "tasks", ["duty_id", "duty_date"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_tasks_duty_date", table_name="tasks")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_constraint("fk_tasks_duty_id", type_="foreignkey")
        batch.drop_column("duty_date")
        batch.drop_column("duty_id")
    op.drop_index("ix_duty_exceptions_duty_id", table_name="duty_exceptions")
    op.drop_index("ix_duty_exceptions_id", table_name="duty_exceptions")
    op.drop_table("duty_exceptions")
    op.drop_index("ix_duty_slots_duty_id", table_name="duty_slots")
    op.drop_index("ix_duty_slots_id", table_name="duty_slots")
    op.drop_table("duty_slots")
    op.drop_index("ix_duties_family_id", table_name="duties")
    op.drop_index("ix_duties_id", table_name="duties")
    op.drop_table("duties")
