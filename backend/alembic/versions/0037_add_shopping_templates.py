"""Add shopping list templates.

Revision ID: 0037
Revises: 0036
Create Date: 2026-04-28
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    if _has_table("shopping_items") and not _has_column("shopping_items", "category"):
        op.add_column("shopping_items", sa.Column("category", sa.String(), nullable=True))

    if not _has_table("shopping_templates"):
        op.create_table(
            "shopping_templates",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_shopping_templates_id"), "shopping_templates", ["id"], unique=False)
        op.create_index(op.f("ix_shopping_templates_family_id"), "shopping_templates", ["family_id"], unique=False)

    if not _has_table("shopping_template_items"):
        op.create_table(
            "shopping_template_items",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("spec", sa.String(), nullable=True),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["template_id"], ["shopping_templates.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_shopping_template_items_id"), "shopping_template_items", ["id"], unique=False)
        op.create_index(op.f("ix_shopping_template_items_template_id"), "shopping_template_items", ["template_id"], unique=False)


def downgrade() -> None:
    if _has_table("shopping_template_items"):
        op.drop_index(op.f("ix_shopping_template_items_template_id"), table_name="shopping_template_items")
        op.drop_index(op.f("ix_shopping_template_items_id"), table_name="shopping_template_items")
        op.drop_table("shopping_template_items")
    if _has_table("shopping_templates"):
        op.drop_index(op.f("ix_shopping_templates_family_id"), table_name="shopping_templates")
        op.drop_index(op.f("ix_shopping_templates_id"), table_name="shopping_templates")
        op.drop_table("shopping_templates")
    if _has_table("shopping_items") and _has_column("shopping_items", "category"):
        op.drop_column("shopping_items", "category")
