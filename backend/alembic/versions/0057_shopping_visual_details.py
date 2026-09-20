"""Shopping product details, trip history and per-list department order."""
from alembic import op
import sqlalchemy as sa
revision = "0057_shopping_visual_details"
down_revision = "0056_store_links"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("shopping_lists", sa.Column("category_order", sa.JSON(), nullable=True))
    op.add_column("shopping_lists", sa.Column("icon", sa.String(20), nullable=False, server_default="cart"))
    op.add_column("shopping_items", sa.Column("notes", sa.String(500), nullable=True))
    op.add_column("shopping_items", sa.Column("photo", sa.Text(), nullable=True))
    op.add_column("shopping_items", sa.Column("priority", sa.String(10), nullable=False, server_default="normal"))
    op.add_column("shopping_items", sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()))

def downgrade():
    for column in ["archived", "priority", "photo", "notes"]:
        op.drop_column("shopping_items", column)
    op.drop_column("shopping_lists", "icon")
    op.drop_column("shopping_lists", "category_order")
