"""Add display device render config fields.

Revision ID: 0036
Revises: 0035
Create Date: 2026-04-27
"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_HEARTH_LAYOUT_JSON = json.dumps({
    "columns": 3,
    "rows": 3,
    "widgets": [
        {"type": "identity", "x": 0, "y": 0, "w": 1, "h": 1},
        {"type": "clock", "x": 0, "y": 1, "w": 1, "h": 1},
        {"type": "focus", "x": 0, "y": 2, "w": 1, "h": 1},
        {"type": "agenda", "x": 1, "y": 0, "w": 1, "h": 3},
        {"type": "birthdays", "x": 2, "y": 0, "w": 1, "h": 1},
        {"type": "members", "x": 2, "y": 1, "w": 1, "h": 2},
    ],
})


def _has_table(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    if not _has_table("display_devices"):
        return
    if not _has_column("display_devices", "display_mode"):
        op.add_column("display_devices", sa.Column("display_mode", sa.String(length=16), nullable=False, server_default="tablet"))
    if not _has_column("display_devices", "refresh_interval_seconds"):
        op.add_column("display_devices", sa.Column("refresh_interval_seconds", sa.Integer(), nullable=False, server_default="60"))
    if not _has_column("display_devices", "layout_preset"):
        op.add_column("display_devices", sa.Column("layout_preset", sa.String(length=64), nullable=False, server_default="hearth"))
    if not _has_column("display_devices", "layout_config"):
        op.add_column("display_devices", sa.Column("layout_config", sa.JSON(), nullable=True))
    op.execute(
        sa.text("UPDATE display_devices SET layout_config = :layout WHERE layout_config IS NULL")
        .bindparams(layout=_HEARTH_LAYOUT_JSON)
    )


def downgrade() -> None:
    if not _has_table("display_devices"):
        return
    for column in ("layout_config", "layout_preset", "refresh_interval_seconds", "display_mode"):
        if _has_column("display_devices", column):
            op.drop_column("display_devices", column)
