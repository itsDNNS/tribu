"""Who is out shopping with a list (Tribu 2.0, L4).

``shopping_lists.shopper_user_id`` and ``shopping_since`` tell the family
that someone is shopping right now ("Anna is shopping").

Revision ID: 0067_list_shopper
Revises: 0066_capture_suggestions
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0067_list_shopper"
down_revision: Union[str, None] = "0066_capture_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("shopping_lists") as batch:
        batch.add_column(sa.Column("shopper_user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("shopping_since", sa.DateTime(), nullable=True))
        batch.create_foreign_key(
            "fk_shopping_lists_shopper_user_id_users",
            "users",
            ["shopper_user_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("shopping_lists") as batch:
        batch.drop_constraint("fk_shopping_lists_shopper_user_id_users", type_="foreignkey")
        batch.drop_column("shopping_since")
        batch.drop_column("shopper_user_id")
