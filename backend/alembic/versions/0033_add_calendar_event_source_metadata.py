"""Add provenance columns to calendar_events.

Revision ID: 0033
Revises: 0032
Create Date: 2026-04-26

Records where each event came from so the UI can mark imported and
subscribed events differently from locally created ones, and so a
re-import of the same ICS feed can be merged into the existing rows
instead of duplicating them.

``source_type`` is constrained at the application level to
``local``, ``import``, or ``subscription``. Existing rows are
backfilled to ``local`` via a server default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "calendar_events"


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column(TABLE, "source_type"):
        op.add_column(
            TABLE,
            sa.Column(
                "source_type",
                sa.String(length=20),
                nullable=False,
                server_default="local",
            ),
        )
    if not _has_column(TABLE, "source_name"):
        op.add_column(TABLE, sa.Column("source_name", sa.String(length=200), nullable=True))
    if not _has_column(TABLE, "source_url"):
        op.add_column(TABLE, sa.Column("source_url", sa.String(length=500), nullable=True))
    if not _has_column(TABLE, "imported_at"):
        op.add_column(TABLE, sa.Column("imported_at", sa.DateTime(), nullable=True))
    if not _has_column(TABLE, "last_synced_at"):
        op.add_column(TABLE, sa.Column("last_synced_at", sa.DateTime(), nullable=True))
    if not _has_column(TABLE, "sync_status"):
        op.add_column(TABLE, sa.Column("sync_status", sa.String(length=20), nullable=True))


def downgrade() -> None:
    for col in ("sync_status", "last_synced_at", "imported_at", "source_url", "source_name", "source_type"):
        if _has_column(TABLE, col):
            with op.batch_alter_table(TABLE) as batch:
                batch.drop_column(col)
