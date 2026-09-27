"""Track backend process runs to spot unexpected restarts.

Revision ID: 0060_process_runs
Revises: 0059_profile_image_sizes
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0060_process_runs"
down_revision: Union[str, None] = "0059_profile_image_sizes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "process_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("host", sa.String(length=120), nullable=False),
        sa.Column("pid", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=60), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("stopped_at", sa.DateTime(), nullable=True),
        sa.Column("crashed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_process_runs_open", "process_runs", ["stopped_at", "last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_process_runs_open", table_name="process_runs")
    op.drop_table("process_runs")
