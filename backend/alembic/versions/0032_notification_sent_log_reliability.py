"""Add reliability metadata to notification_sent_log.

Revision ID: 0032
Revises: 0031
Create Date: 2026-04-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "notification_sent_log"
PARTIAL_UQ_NAME = "uq_notification_sent_log_user_trigger_key"
TRIGGER_KEY_INDEX = "ix_notification_sent_log_trigger_key"


def _columns(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _index_exists(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if table not in insp.get_table_names():
        return False
    return name in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    cols = _columns(TABLE)
    if not cols:
        return

    with op.batch_alter_table(TABLE) as batch:
        if "trigger_key" not in cols:
            batch.add_column(sa.Column("trigger_key", sa.String(), nullable=True))
        if "status" not in cols:
            batch.add_column(
                sa.Column("status", sa.String(), nullable=False, server_default="pending")
            )
        if "delivery_attempts" not in cols:
            batch.add_column(
                sa.Column("delivery_attempts", sa.Integer(), nullable=False, server_default="0")
            )
        if "last_attempt_at" not in cols:
            batch.add_column(sa.Column("last_attempt_at", sa.DateTime(), nullable=True))
        if "last_error" not in cols:
            batch.add_column(sa.Column("last_error", sa.Text(), nullable=True))
        if "delivered_at" not in cols:
            batch.add_column(sa.Column("delivered_at", sa.DateTime(), nullable=True))

    # Partial unique index: prevents duplicate (user_id, trigger_key) pairs
    # for new rows while leaving legacy rows (trigger_key IS NULL) unaffected.
    # Both PostgreSQL and SQLite (>= 3.8) support partial indexes; SQLAlchemy
    # accepts the dialect-specific WHERE via *_where kwargs.
    if not _index_exists(TABLE, PARTIAL_UQ_NAME):
        op.create_index(
            PARTIAL_UQ_NAME,
            TABLE,
            ["user_id", "trigger_key"],
            unique=True,
            postgresql_where=sa.text("trigger_key IS NOT NULL"),
            sqlite_where=sa.text("trigger_key IS NOT NULL"),
        )

    if not _index_exists(TABLE, TRIGGER_KEY_INDEX):
        op.create_index(TRIGGER_KEY_INDEX, TABLE, ["trigger_key"])


def downgrade() -> None:
    cols = _columns(TABLE)
    if not cols:
        return

    if _index_exists(TABLE, TRIGGER_KEY_INDEX):
        op.drop_index(TRIGGER_KEY_INDEX, table_name=TABLE)
    if _index_exists(TABLE, PARTIAL_UQ_NAME):
        op.drop_index(PARTIAL_UQ_NAME, table_name=TABLE)

    with op.batch_alter_table(TABLE) as batch:
        for col in (
            "delivered_at",
            "last_error",
            "last_attempt_at",
            "delivery_attempts",
            "status",
            "trigger_key",
        ):
            if col in cols:
                batch.drop_column(col)
