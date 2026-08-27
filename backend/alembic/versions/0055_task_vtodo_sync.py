"""Add VTODO sync metadata and due precision to tasks.

Revision ID: 0055_task_vtodo
Revises: 0054_product_preferences
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0055_task_vtodo"
down_revision: Union[str, None] = "0054_product_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite cannot ALTER an existing populated table with a non-constant
    # CURRENT_TIMESTAMP default. Add nullable, backfill, then let Alembic's
    # batch mode recreate the table for the final non-null/default contract.
    op.add_column("tasks", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("tasks", sa.Column("vtodo_uid", sa.String(length=200), nullable=True))
    op.add_column("tasks", sa.Column("dav_href", sa.String(length=250), nullable=True))
    op.add_column("tasks", sa.Column("raw_vtodo", sa.Text(), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("due_is_date", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute(
        "UPDATE tasks SET updated_at = COALESCE(completed_at, created_at, CURRENT_TIMESTAMP)"
    )
    with op.batch_alter_table("tasks") as batch:
        batch.alter_column(
            "updated_at",
            existing_type=sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        )
    op.create_index(
        "uq_tasks_family_vtodo_uid",
        "tasks",
        ["family_id", "vtodo_uid"],
        unique=True,
    )
    op.create_index(
        "uq_tasks_family_dav_href",
        "tasks",
        ["family_id", "dav_href"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_tasks_family_dav_href", table_name="tasks")
    op.drop_index("uq_tasks_family_vtodo_uid", table_name="tasks")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("due_is_date")
        batch.drop_column("raw_vtodo")
        batch.drop_column("dav_href")
        batch.drop_column("vtodo_uid")
        batch.drop_column("updated_at")
