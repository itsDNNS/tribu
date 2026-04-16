"""Add gift list

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def upgrade() -> None:
    if not _table_exists("gift_ideas"):
        op.create_table(
            "gift_ideas",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("for_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("for_person_name", sa.String(120), nullable=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("url", sa.Text, nullable=True),
            sa.Column("occasion", sa.String(40), nullable=True),
            sa.Column("occasion_date", sa.Date, nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="idea"),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("current_price_cents", sa.Integer, nullable=True),
            sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
            sa.Column("gifted_at", sa.DateTime, nullable=True),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("gift_price_history"):
        op.create_table(
            "gift_price_history",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("gift_id", sa.Integer, sa.ForeignKey("gift_ideas.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("price_cents", sa.Integer, nullable=False),
            sa.Column("recorded_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    if _table_exists("gift_price_history"):
        op.drop_table("gift_price_history")
    if _table_exists("gift_ideas"):
        op.drop_table("gift_ideas")
