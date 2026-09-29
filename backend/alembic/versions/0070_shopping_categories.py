"""Shopping categories: one name per built-in category, and a switch.

The app stored the built-in categories in its own language, so a family's
categories grew once per language (discussion #512). Every translation of a
built-in category now becomes its stored label, and lists' category orders
follow. ``families.shopping_categories`` lets a family turn categories off.

Revision ID: 0070_shopping_categories
Revises: 0069_drop_dashboard_layout
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.shopping_categories import stored_category


revision: str = "0070_shopping_categories"
down_revision: Union[str, None] = "0069_drop_dashboard_layout"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _fold_column(bind, table: str) -> None:
    rows = bind.execute(sa.text(f"SELECT id, category FROM {table} WHERE category IS NOT NULL")).fetchall()
    for row_id, category in rows:
        stored = stored_category(category.strip()) if category.strip() else category
        if stored != category.strip():
            bind.execute(sa.text(f"UPDATE {table} SET category = :category WHERE id = :id"), {"category": stored, "id": row_id})


def upgrade() -> None:
    with op.batch_alter_table("families") as batch:
        batch.add_column(sa.Column("shopping_categories", sa.Boolean(), nullable=False, server_default=sa.true()))

    bind = op.get_bind()
    for table in ("shopping_items", "shopping_template_items", "family_product_preferences"):
        _fold_column(bind, table)

    lists = sa.table("shopping_lists", sa.column("id", sa.Integer), sa.column("category_order", sa.JSON))
    for row_id, order in bind.execute(sa.select(lists.c.id, lists.c.category_order)).fetchall():
        if not isinstance(order, list):
            continue
        folded = list(dict.fromkeys(stored_category(entry) for entry in order if isinstance(entry, str) and entry.strip()))
        if folded != order:
            bind.execute(lists.update().where(lists.c.id == row_id).values(category_order=folded))


def downgrade() -> None:
    with op.batch_alter_table("families") as batch:
        batch.drop_column("shopping_categories")
