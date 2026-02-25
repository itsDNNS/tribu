"""Add family_invitations table

Revision ID: 0011
Revises: 0010
Create Date: 2026-02-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists("family_invitations"):
        op.create_table(
            "family_invitations",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token", sa.String(64), unique=True, nullable=False),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("role_preset", sa.String, nullable=False, server_default="member"),
            sa.Column("is_adult_preset", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("max_uses", sa.Integer, nullable=True),
            sa.Column("use_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("expires_at", sa.DateTime, nullable=False),
            sa.Column("revoked", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_family_invitations_family_id", "family_invitations", ["family_id"])
        op.create_index("ix_family_invitations_token", "family_invitations", ["token"], unique=True)


def downgrade() -> None:
    if _table_exists("family_invitations"):
        op.drop_table("family_invitations")
