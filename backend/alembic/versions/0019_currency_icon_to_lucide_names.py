"""Convert currency icons from emoji to Lucide icon names

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMOJI_TO_NAME = {
    "\u2b50": "star",       # ⭐
    "\ud83d\udc8e": "gem",  # 💎
    "\u2764\ufe0f": "heart",# ❤️
    "\u26a1": "zap",        # ⚡
    "\ud83c\udfc6": "trophy",# 🏆
}


def upgrade() -> None:
    conn = op.get_bind()
    for emoji, name in EMOJI_TO_NAME.items():
        conn.execute(
            sa.text("UPDATE reward_currencies SET icon = :name WHERE icon = :emoji"),
            {"name": name, "emoji": emoji},
        )
    conn.execute(
        sa.text("ALTER TABLE reward_currencies ALTER COLUMN icon SET DEFAULT 'star'"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    for emoji, name in EMOJI_TO_NAME.items():
        conn.execute(
            sa.text("UPDATE reward_currencies SET icon = :emoji WHERE icon = :name"),
            {"name": name, "emoji": emoji},
        )
    conn.execute(
        sa.text("ALTER TABLE reward_currencies ALTER COLUMN icon SET DEFAULT '\u2b50'"),
    )
