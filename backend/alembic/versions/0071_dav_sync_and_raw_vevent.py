"""DAV: sync tokens and the VEVENT a client wrote.

``dav_sync_snapshots`` keeps what a DAV collection held when a sync token
was handed out, so clients can ask for the changes since then instead of
downloading everything (RFC 6578). ``calendar_events.raw_vevent`` keeps the
VEVENT a client last wrote, so alarms and other properties Tribu does not
model survive the next sync.

Revision ID: 0071_dav_sync_and_raw_vevent
Revises: 0070_shopping_categories
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0071_dav_sync_and_raw_vevent"
down_revision: Union[str, None] = "0070_shopping_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch:
        batch.add_column(sa.Column("raw_vevent", sa.Text(), nullable=True))
    op.create_table(
        "dav_sync_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("collection_key", sa.String(120), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("collection_key", "token", name="uq_dav_sync_snapshots_key_token"),
    )
    op.create_index(
        "ix_dav_sync_snapshots_key_created",
        "dav_sync_snapshots",
        ["collection_key", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_dav_sync_snapshots_key_created", table_name="dav_sync_snapshots")
    op.drop_table("dav_sync_snapshots")
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("raw_vevent")
