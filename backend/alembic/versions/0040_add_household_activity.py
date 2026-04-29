"""Add household activity feed.

Revision ID: 0040
Revises: 0039
Create Date: 2026-04-29
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "household_activity",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_display_name", sa.String(length=80), nullable=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("object_type", sa.String(length=60), nullable=False),
        sa.Column("object_id", sa.Integer(), nullable=True),
        sa.Column("summary", sa.String(length=240), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_household_activity_id"), "household_activity", ["id"], unique=False)
    op.create_index(op.f("ix_household_activity_family_id"), "household_activity", ["family_id"], unique=False)
    op.create_index(op.f("ix_household_activity_actor_user_id"), "household_activity", ["actor_user_id"], unique=False)
    op.create_index("ix_household_activity_family_created", "household_activity", ["family_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_household_activity_family_created", table_name="household_activity")
    op.drop_index(op.f("ix_household_activity_actor_user_id"), table_name="household_activity")
    op.drop_index(op.f("ix_household_activity_family_id"), table_name="household_activity")
    op.drop_index(op.f("ix_household_activity_id"), table_name="household_activity")
    op.drop_table("household_activity")
