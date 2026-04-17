"""Enforce one meal per family/date/slot.

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "uq_meal_plans_family_date_slot"


def _constraint_exists() -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "meal_plans" not in insp.get_table_names():
        return False
    for c in insp.get_unique_constraints("meal_plans"):
        if c.get("name") == CONSTRAINT_NAME:
            return True
    return False


def upgrade() -> None:
    if _constraint_exists():
        return
    with op.batch_alter_table("meal_plans") as batch:
        batch.create_unique_constraint(
            CONSTRAINT_NAME,
            ["family_id", "plan_date", "slot"],
        )


def downgrade() -> None:
    if not _constraint_exists():
        return
    with op.batch_alter_table("meal_plans") as batch:
        batch.drop_constraint(CONSTRAINT_NAME, type_="unique")
