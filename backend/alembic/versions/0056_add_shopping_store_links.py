"""Add family-configured shopping store links.

Revision ID: 0056_store_links
Revises: 0055_task_vtodo
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0056_store_links"
down_revision: Union[str, None] = "0055_task_vtodo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shopping_store_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("normalized_name", sa.String(length=240), nullable=False),
        sa.Column("url_template", sa.String(length=500), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "length(trim(name)) > 0",
            name="ck_shopping_store_links_name_nonempty",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "family_id",
            "normalized_name",
            name="uq_shopping_store_links_family_normalized_name",
        ),
    )
    op.create_index(
        op.f("ix_shopping_store_links_family_id"),
        "shopping_store_links",
        ["family_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_shopping_store_links_id"),
        "shopping_store_links",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_shopping_store_links_id"), table_name="shopping_store_links")
    op.drop_index(op.f("ix_shopping_store_links_family_id"), table_name="shopping_store_links")
    op.drop_table("shopping_store_links")
