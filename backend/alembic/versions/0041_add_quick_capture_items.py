"""Add quick capture inbox.

Revision ID: 0041
Revises: 0040
Create Date: 2026-04-29
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0041"
down_revision: Union[str, None] = "0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quick_capture_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=240), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="open", nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("converted_to", sa.String(length=40), nullable=True),
        sa.Column("converted_object_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quick_capture_items_id"), "quick_capture_items", ["id"], unique=False)
    op.create_index(op.f("ix_quick_capture_items_family_id"), "quick_capture_items", ["family_id"], unique=False)
    op.create_index("ix_quick_capture_family_status_created", "quick_capture_items", ["family_id", "status", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_quick_capture_family_status_created", table_name="quick_capture_items")
    op.drop_index(op.f("ix_quick_capture_items_family_id"), table_name="quick_capture_items")
    op.drop_index(op.f("ix_quick_capture_items_id"), table_name="quick_capture_items")
    op.drop_table("quick_capture_items")
