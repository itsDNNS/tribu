"""Add meal planning module

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if _table_exists("meal_plans"):
        return
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("plan_date", sa.Date, nullable=False, index=True),
        sa.Column("slot", sa.String(16), nullable=False),
        sa.Column("meal_name", sa.String(200), nullable=False),
        sa.Column("ingredients", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_meal_plans_family_date",
        "meal_plans",
        ["family_id", "plan_date"],
    )


def downgrade() -> None:
    if not _table_exists("meal_plans"):
        return
    op.drop_index("ix_meal_plans_family_date", table_name="meal_plans")
    op.drop_table("meal_plans")
