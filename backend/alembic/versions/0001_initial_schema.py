"""Initial schema: all 7 tables

Revision ID: 0001
Revises:
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("email", sa.String, unique=True, index=True, nullable=False),
            sa.Column("password_hash", sa.String, nullable=False),
            sa.Column("display_name", sa.String, nullable=False),
        )

    if not _table_exists("families"):
        op.create_table(
            "families",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
        )

    if not _table_exists("memberships"):
        op.create_table(
            "memberships",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String, nullable=False, server_default="member"),
            sa.UniqueConstraint("user_id", "family_id", name="uq_membership_user_family"),
        )

    if not _table_exists("calendar_events"):
        op.create_table(
            "calendar_events",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.String, nullable=True),
            sa.Column("starts_at", sa.DateTime, nullable=False),
            sa.Column("ends_at", sa.DateTime, nullable=True),
            sa.Column("all_day", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("family_birthdays"):
        op.create_table(
            "family_birthdays",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("person_name", sa.String, nullable=False),
            sa.Column("month", sa.Integer, nullable=False),
            sa.Column("day", sa.Integer, nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("tasks"):
        op.create_table(
            "tasks",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.String, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="open"),
            sa.Column("priority", sa.String, nullable=False, server_default="normal"),
            sa.Column("due_date", sa.DateTime, nullable=True),
            sa.Column("recurrence", sa.String, nullable=True),
            sa.Column("assigned_to_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime, nullable=True),
        )

    if not _table_exists("contacts"):
        op.create_table(
            "contacts",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("full_name", sa.String, nullable=False),
            sa.Column("email", sa.String, nullable=True),
            sa.Column("phone", sa.String, nullable=True),
            sa.Column("birthday_month", sa.Integer, nullable=True),
            sa.Column("birthday_day", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    for table in ("contacts", "tasks", "family_birthdays", "calendar_events", "memberships", "families", "users"):
        op.drop_table(table)
