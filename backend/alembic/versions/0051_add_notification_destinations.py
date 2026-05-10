"""add notification destinations

Revision ID: 0051_add_notification_destinations
Revises: 0050_add_school_timetables
Create Date: 2026-05-10 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0051_add_notification_destinations"
down_revision: Union[str, None] = "0050_add_school_timetables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_destinations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=30), server_default="apprise", nullable=False),
        sa.Column("target_url_secret", sa.Text(), nullable=False),
        sa.Column("events", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("respect_quiet_hours", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_attempted_at", sa.DateTime(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sa.String(length=20), server_default="never", nullable=False),
        sa.Column("last_error", sa.String(length=80), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notification_destinations_id"), "notification_destinations", ["id"], unique=False)
    op.create_index(op.f("ix_notification_destinations_family_id"), "notification_destinations", ["family_id"], unique=False)
    op.create_index("ix_notification_destinations_family_active", "notification_destinations", ["family_id", "active"], unique=False)

    op.create_table(
        "notification_destination_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("destination_id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("trigger_key", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_attempted_at", sa.DateTime(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.String(length=80), nullable=True),
        sa.ForeignKeyConstraint(["destination_id"], ["notification_destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "destination_id",
            "event_type",
            "source_type",
            "source_id",
            "trigger_key",
            name="uq_notification_destination_delivery_trigger",
        ),
    )
    op.create_index(op.f("ix_notification_destination_deliveries_id"), "notification_destination_deliveries", ["id"], unique=False)
    op.create_index(op.f("ix_notification_destination_deliveries_destination_id"), "notification_destination_deliveries", ["destination_id"], unique=False)
    op.create_index(op.f("ix_notification_destination_deliveries_family_id"), "notification_destination_deliveries", ["family_id"], unique=False)
    op.create_index(
        "ix_notification_destination_deliveries_destination_created",
        "notification_destination_deliveries",
        ["destination_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_destination_deliveries_destination_created", table_name="notification_destination_deliveries")
    op.drop_index(op.f("ix_notification_destination_deliveries_family_id"), table_name="notification_destination_deliveries")
    op.drop_index(op.f("ix_notification_destination_deliveries_destination_id"), table_name="notification_destination_deliveries")
    op.drop_index(op.f("ix_notification_destination_deliveries_id"), table_name="notification_destination_deliveries")
    op.drop_table("notification_destination_deliveries")
    op.drop_index("ix_notification_destinations_family_active", table_name="notification_destinations")
    op.drop_index(op.f("ix_notification_destinations_family_id"), table_name="notification_destinations")
    op.drop_index(op.f("ix_notification_destinations_id"), table_name="notification_destinations")
    op.drop_table("notification_destinations")
