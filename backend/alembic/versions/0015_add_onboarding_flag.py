"""Add onboarding flag

Revision ID: 0015
Revises: 0014
Create Date: 2026-02-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return False
    return any(column["name"] == column_name for column in insp.get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("users", "has_completed_onboarding"):
        op.add_column(
            "users",
            sa.Column("has_completed_onboarding", sa.Boolean, nullable=False, server_default="false"),
        )
    # All existing users have been using the app — mark them as onboarded
    op.execute(sa.text("UPDATE users SET has_completed_onboarding = true"))


def downgrade() -> None:
    if _column_exists("users", "has_completed_onboarding"):
        op.drop_column("users", "has_completed_onboarding")
