"""add first week checklist

Revision ID: 0043
Revises: 0042
Create Date: 2026-04-29 16:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0043"
down_revision: Union[str, None] = "0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "family_setup_checklists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("completed_steps", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("dismissed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("dismissed_at", sa.DateTime(), nullable=True),
        sa.Column("reset_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", name="uq_family_setup_checklists_family"),
    )
    op.create_index("ix_family_setup_checklists_family_id", "family_setup_checklists", ["family_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_family_setup_checklists_family_id", table_name="family_setup_checklists")
    op.drop_table("family_setup_checklists")
