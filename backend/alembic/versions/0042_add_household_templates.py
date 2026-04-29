"""Add household planning templates."""

from alembic import op
import sqlalchemy as sa


revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "household_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("task_items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("shopping_items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_household_templates_family_created", "household_templates", ["family_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_household_templates_family_created", table_name="household_templates")
    op.drop_table("household_templates")
