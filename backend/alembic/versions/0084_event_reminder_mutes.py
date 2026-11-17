"""Everyone can take themselves off an event's reminders.

- ``event_reminder_mutes``: a member who no longer wants the reminder
  before an event, for the whole event or series (``occurrence_start``
  NULL) or for one occurrence of a series (its original start).
- ``reminder_snoozes.occurrence_start``: the same occurrence key for a
  snoozed reminder, so a mute made after snoozing matches it even when the
  occurrence moved. Existing snoozes keep NULL; they run out within a day
  and the scheduler falls back to working the occurrence out from the event.

Revision ID: 0084_event_reminder_mutes
Revises: 0083_event_remind_only_creator
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0084_event_reminder_mutes"
down_revision: Union[str, None] = "0083_event_remind_only_creator"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_reminder_mutes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("calendar_events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurrence_start", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "event_id", "occurrence_start", name="uq_event_reminder_mutes_occurrence"),
    )
    op.create_index("ix_event_reminder_mutes_id", "event_reminder_mutes", ["id"])
    op.create_index("ix_event_reminder_mutes_event_id", "event_reminder_mutes", ["event_id"])
    # NULLs never collide in a unique index, so the whole-series mute needs
    # a partial index of its own.
    op.create_index(
        "uq_event_reminder_mutes_series",
        "event_reminder_mutes",
        ["user_id", "event_id"],
        unique=True,
        postgresql_where=sa.text("occurrence_start IS NULL"),
        sqlite_where=sa.text("occurrence_start IS NULL"),
    )
    op.add_column("reminder_snoozes", sa.Column("occurrence_start", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("reminder_snoozes") as batch:
        batch.drop_column("occurrence_start")
    op.drop_index("uq_event_reminder_mutes_series", table_name="event_reminder_mutes")
    op.drop_index("ix_event_reminder_mutes_event_id", table_name="event_reminder_mutes")
    op.drop_index("ix_event_reminder_mutes_id", table_name="event_reminder_mutes")
    op.drop_table("event_reminder_mutes")
