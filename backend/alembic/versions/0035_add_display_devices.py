"""Add display_devices table for shared-home display identity (issue #172).

Revision ID: 0035
Revises: 0034
Create Date: 2026-04-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("display_devices"):
        return
    op.create_table(
        "display_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("token_lookup", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=256), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_lookup", name="uq_display_devices_token_lookup"),
    )
    op.create_index("ix_display_devices_family_id", "display_devices", ["family_id"])
    op.create_index("ix_display_devices_token_lookup", "display_devices", ["token_lookup"])


def downgrade() -> None:
    if not _has_table("display_devices"):
        return
    op.drop_index("ix_display_devices_token_lookup", table_name="display_devices")
    op.drop_index("ix_display_devices_family_id", table_name="display_devices")
    op.drop_table("display_devices")
