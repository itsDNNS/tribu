"""Add reward system

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"),
        {"t": table_name, "c": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    if not _table_exists("reward_currencies"):
        op.create_table(
            "reward_currencies",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String(50), nullable=False),
            sa.Column("icon", sa.String(10), nullable=False, server_default="⭐"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("earning_rules"):
        op.create_table(
            "earning_rules",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("currency_id", sa.Integer, sa.ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("amount", sa.Integer, nullable=False),
            sa.Column("require_confirmation", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("rewards"):
        op.create_table(
            "rewards",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("currency_id", sa.Integer, sa.ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("cost", sa.Integer, nullable=False),
            sa.Column("icon", sa.String(10), nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("token_transactions"):
        op.create_table(
            "token_transactions",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("currency_id", sa.Integer, sa.ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("kind", sa.String(10), nullable=False),
            sa.Column("amount", sa.Integer, nullable=False),
            sa.Column("status", sa.String(10), nullable=False, server_default="confirmed"),
            sa.Column("note", sa.String(200), nullable=True),
            sa.Column("source_task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
            sa.Column("source_reward_id", sa.Integer, sa.ForeignKey("rewards.id", ondelete="SET NULL"), nullable=True),
            sa.Column("source_rule_id", sa.Integer, sa.ForeignKey("earning_rules.id", ondelete="SET NULL"), nullable=True),
            sa.Column("confirmed_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("confirmed_at", sa.DateTime, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _column_exists("tasks", "token_reward_amount"):
        op.add_column("tasks", sa.Column("token_reward_amount", sa.Integer, nullable=True))
    if not _column_exists("tasks", "token_require_confirmation"):
        op.add_column("tasks", sa.Column("token_require_confirmation", sa.Boolean, nullable=False, server_default="true"))


def downgrade() -> None:
    if _column_exists("tasks", "token_require_confirmation"):
        op.drop_column("tasks", "token_require_confirmation")
    if _column_exists("tasks", "token_reward_amount"):
        op.drop_column("tasks", "token_reward_amount")
    for table in ["token_transactions", "rewards", "earning_rules", "reward_currencies"]:
        if _table_exists(table):
            op.drop_table(table)
