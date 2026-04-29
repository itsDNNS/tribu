"""Add PAT DAV health metadata.

Revision ID: 0039
Revises: 0038
Create Date: 2026-04-29
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("personal_access_tokens", sa.Column("last_dav_success_at", sa.DateTime(), nullable=True))
    op.add_column("personal_access_tokens", sa.Column("last_dav_failure_at", sa.DateTime(), nullable=True))
    op.add_column("personal_access_tokens", sa.Column("last_dav_failure_reason", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("personal_access_tokens", "last_dav_failure_reason")
    op.drop_column("personal_access_tokens", "last_dav_failure_at")
    op.drop_column("personal_access_tokens", "last_dav_success_at")
