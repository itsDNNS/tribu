"""Add lightweight recipe library.

Revision ID: 0031
Revises: 0030
Create Date: 2026-04-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def _index_exists(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return False
    return name in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    if not _table_exists("recipes"):
        op.create_table(
            "recipes",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("family_id", sa.Integer, sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("source_url", sa.String(500), nullable=True),
            sa.Column("servings", sa.Integer, nullable=True),
            sa.Column("tags", sa.JSON, nullable=False, server_default="[]"),
            sa.Column("ingredients", sa.JSON, nullable=False, server_default="[]"),
            sa.Column("instructions", sa.Text, nullable=True),
            sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _index_exists("recipes", "ix_recipes_family_title"):
        op.create_index(
            "ix_recipes_family_title",
            "recipes",
            ["family_id", "title"],
        )


def downgrade() -> None:
    if not _table_exists("recipes"):
        return
    if _index_exists("recipes", "ix_recipes_family_title"):
        op.drop_index("ix_recipes_family_title", table_name="recipes")
    op.drop_table("recipes")
