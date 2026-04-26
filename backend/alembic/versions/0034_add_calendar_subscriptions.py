"""Add persistent calendar subscriptions.

Revision ID: 0034
Revises: 0033
Create Date: 2026-04-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_table("calendar_subscriptions"):
        op.create_table(
            "calendar_subscriptions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("source_url", sa.String(length=500), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_status", sa.String(length=20), nullable=True),
            sa.Column("last_sync_error", sa.String(length=300), nullable=True),
            sa.Column("last_created", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_updated", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("family_id", "source_url", name="uq_calendar_subscriptions_family_url"),
        )
        op.create_index("ix_calendar_subscriptions_family_id", "calendar_subscriptions", ["family_id"])
        op.create_index("ix_calendar_subscriptions_family_status", "calendar_subscriptions", ["family_id", "status"])

    if not _has_table("calendar_subscription_syncs"):
        op.create_table(
            "calendar_subscription_syncs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("subscription_id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("created", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_summary", sa.String(length=300), nullable=True),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["subscription_id"], ["calendar_subscriptions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_calendar_subscription_syncs_family_id", "calendar_subscription_syncs", ["family_id"])
        op.create_index("ix_calendar_subscription_syncs_subscription_id", "calendar_subscription_syncs", ["subscription_id"])
        op.create_index("ix_calendar_subscription_syncs_subscription_started", "calendar_subscription_syncs", ["subscription_id", "started_at"])

    if not _has_column("calendar_events", "subscription_id"):
        with op.batch_alter_table("calendar_events") as batch:
            batch.add_column(sa.Column("subscription_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(
                "fk_calendar_events_subscription_id",
                "calendar_subscriptions",
                ["subscription_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch.create_index("ix_calendar_events_subscription_id", ["subscription_id"])


def downgrade() -> None:
    if _has_column("calendar_events", "subscription_id"):
        with op.batch_alter_table("calendar_events") as batch:
            batch.drop_index("ix_calendar_events_subscription_id")
            batch.drop_constraint("fk_calendar_events_subscription_id", type_="foreignkey")
            batch.drop_column("subscription_id")
    if _has_table("calendar_subscription_syncs"):
        op.drop_index("ix_calendar_subscription_syncs_subscription_started", table_name="calendar_subscription_syncs")
        op.drop_index("ix_calendar_subscription_syncs_subscription_id", table_name="calendar_subscription_syncs")
        op.drop_index("ix_calendar_subscription_syncs_family_id", table_name="calendar_subscription_syncs")
        op.drop_table("calendar_subscription_syncs")
    if _has_table("calendar_subscriptions"):
        op.drop_index("ix_calendar_subscriptions_family_status", table_name="calendar_subscriptions")
        op.drop_index("ix_calendar_subscriptions_family_id", table_name="calendar_subscriptions")
        op.drop_table("calendar_subscriptions")
