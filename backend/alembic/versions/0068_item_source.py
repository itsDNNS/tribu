"""Where a shopping item came from (Tribu 2.0, L5).

``shopping_items.source`` names the recipes or meals an item was added for,
so the list can say "for Lasagne".

Revision ID: 0068_item_source
Revises: 0067_list_shopper
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0068_item_source"
down_revision: Union[str, None] = "0067_list_shopper"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("shopping_items") as batch:
        batch.add_column(sa.Column("source", sa.String(200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("shopping_items") as batch:
        batch.drop_column("source")
