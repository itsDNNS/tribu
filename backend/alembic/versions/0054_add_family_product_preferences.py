"""add family product category preferences

Revision ID: 0054_product_preferences
Revises: 0053_ui_preferences
Create Date: 2026-08-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0054_product_preferences"
down_revision: Union[str, None] = "0053_ui_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "family_product_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("normalized_name", sa.String(length=400), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "length(trim(category)) > 0",
            name="ck_family_product_preference_category_nonempty",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "family_id",
            "normalized_name",
            name="uq_family_product_preference_family_name",
        ),
    )
    op.create_index(
        op.f("ix_family_product_preferences_family_id"),
        "family_product_preferences",
        ["family_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_family_product_preferences_id"),
        "family_product_preferences",
        ["id"],
        unique=False,
    )

    connection = op.get_bind()
    rows = connection.execute(sa.text("""
        SELECT sl.family_id, si.name, si.category, si.created_at, si.id
        FROM shopping_items AS si
        JOIN shopping_lists AS sl ON sl.id = si.list_id
        WHERE si.category IS NOT NULL
        ORDER BY sl.family_id ASC, si.created_at ASC, si.id ASC
    """)).mappings()
    latest: dict[tuple[int, str], dict[str, object]] = {}
    for row in rows:
        name = str(row["name"] or "").strip()
        category = str(row["category"] or "").strip()
        if not name or not category:
            continue
        normalized_name = name.casefold()
        latest[(int(row["family_id"]), normalized_name)] = {
            "family_id": int(row["family_id"]),
            "normalized_name": normalized_name,
            "category": category,
        }
    if latest:
        preferences = sa.table(
            "family_product_preferences",
            sa.column("family_id", sa.Integer()),
            sa.column("normalized_name", sa.String()),
            sa.column("category", sa.String()),
        )
        op.bulk_insert(preferences, list(latest.values()))


def downgrade() -> None:
    op.drop_index(op.f("ix_family_product_preferences_id"), table_name="family_product_preferences")
    op.drop_index(op.f("ix_family_product_preferences_family_id"), table_name="family_product_preferences")
    op.drop_table("family_product_preferences")
