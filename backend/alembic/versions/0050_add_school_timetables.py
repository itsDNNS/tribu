"""add school timetables

Revision ID: 0050_add_school_timetables
Revises: 0049_add_user_sessions
Create Date: 2026-04-30 20:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0050_add_school_timetables"
down_revision: Union[str, None] = "0049_add_user_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "school_timetables",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("class_label", sa.String(length=80), nullable=True),
        sa.Column("include_saturday", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_school_timetables_id"), "school_timetables", ["id"], unique=False)
    op.create_index(op.f("ix_school_timetables_family_id"), "school_timetables", ["family_id"], unique=False)
    op.create_index("ix_school_timetables_family_name", "school_timetables", ["family_id", "name"], unique=False)

    op.create_table(
        "school_timetable_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("timetable_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("kind", sa.String(length=20), server_default="lesson", nullable=False),
        sa.Column("break_label", sa.String(length=120), nullable=True),
        sa.ForeignKeyConstraint(["timetable_id"], ["school_timetables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("timetable_id", "position", name="uq_school_timetable_period_position"),
    )
    op.create_index(op.f("ix_school_timetable_periods_id"), "school_timetable_periods", ["id"], unique=False)
    op.create_index(op.f("ix_school_timetable_periods_timetable_id"), "school_timetable_periods", ["timetable_id"], unique=False)

    op.create_table(
        "school_timetable_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("timetable_id", sa.Integer(), nullable=False),
        sa.Column("member_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["member_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["timetable_id"], ["school_timetables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("timetable_id", "member_user_id", name="uq_school_timetable_member"),
    )
    op.create_index(op.f("ix_school_timetable_assignments_id"), "school_timetable_assignments", ["id"], unique=False)
    op.create_index(op.f("ix_school_timetable_assignments_timetable_id"), "school_timetable_assignments", ["timetable_id"], unique=False)
    op.create_index(op.f("ix_school_timetable_assignments_member_user_id"), "school_timetable_assignments", ["member_user_id"], unique=False)

    op.create_table(
        "school_timetable_lessons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("timetable_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("period_id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("room", sa.String(length=80), nullable=True),
        sa.Column("teacher", sa.String(length=120), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["period_id"], ["school_timetable_periods.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["timetable_id"], ["school_timetables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("timetable_id", "weekday", "period_id", name="uq_school_timetable_lesson_slot"),
    )
    op.create_index(op.f("ix_school_timetable_lessons_id"), "school_timetable_lessons", ["id"], unique=False)
    op.create_index(op.f("ix_school_timetable_lessons_timetable_id"), "school_timetable_lessons", ["timetable_id"], unique=False)
    op.create_index(op.f("ix_school_timetable_lessons_weekday"), "school_timetable_lessons", ["weekday"], unique=False)
    op.create_index(op.f("ix_school_timetable_lessons_period_id"), "school_timetable_lessons", ["period_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_school_timetable_lessons_period_id"), table_name="school_timetable_lessons")
    op.drop_index(op.f("ix_school_timetable_lessons_weekday"), table_name="school_timetable_lessons")
    op.drop_index(op.f("ix_school_timetable_lessons_timetable_id"), table_name="school_timetable_lessons")
    op.drop_index(op.f("ix_school_timetable_lessons_id"), table_name="school_timetable_lessons")
    op.drop_table("school_timetable_lessons")
    op.drop_index(op.f("ix_school_timetable_assignments_member_user_id"), table_name="school_timetable_assignments")
    op.drop_index(op.f("ix_school_timetable_assignments_timetable_id"), table_name="school_timetable_assignments")
    op.drop_index(op.f("ix_school_timetable_assignments_id"), table_name="school_timetable_assignments")
    op.drop_table("school_timetable_assignments")
    op.drop_index(op.f("ix_school_timetable_periods_timetable_id"), table_name="school_timetable_periods")
    op.drop_index(op.f("ix_school_timetable_periods_id"), table_name="school_timetable_periods")
    op.drop_table("school_timetable_periods")
    op.drop_index("ix_school_timetables_family_name", table_name="school_timetables")
    op.drop_index(op.f("ix_school_timetables_family_id"), table_name="school_timetables")
    op.drop_index(op.f("ix_school_timetables_id"), table_name="school_timetables")
    op.drop_table("school_timetables")
