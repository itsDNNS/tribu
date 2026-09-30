"""Gifts around people and occasions: wishes, "I'll take care of it", budgets.

- ``gift_ideas.kind``: ``idea`` (someone's plan for a person, never shown to
  that person) or ``wish`` (what the person wishes for themselves; who takes
  care of it stays hidden from them).
- ``gift_ideas.for_contact_id``: a contact as the recipient, next to a
  family member or a free-text name.
- ``gift_ideas.image``: a small picture of the product (a data URL Tribu
  keeps itself, so viewing the list never calls the shop).
- ``gift_ideas.claimed_by_user_id`` / ``claimed_at``: who takes care of it,
  so nobody buys the same thing twice.
- ``gift_budgets``: an optional budget per occasion and person.

Revision ID: 0075_gifts_wishes_occasions
Revises: 0074_member_birthdays_links
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0075_gifts_wishes_occasions"
down_revision: Union[str, None] = "0074_member_birthdays_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("gift_ideas") as batch:
        batch.add_column(sa.Column("kind", sa.String(length=10), nullable=False, server_default="idea"))
        batch.add_column(sa.Column("for_contact_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("image", sa.Text(), nullable=True))
        batch.add_column(sa.Column("claimed_by_user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("claimed_at", sa.DateTime(), nullable=True))
        batch.create_foreign_key(
            "fk_gift_ideas_for_contact_id", "contacts", ["for_contact_id"], ["id"], ondelete="SET NULL",
        )
        batch.create_foreign_key(
            "fk_gift_ideas_claimed_by_user_id", "users", ["claimed_by_user_id"], ["id"], ondelete="SET NULL",
        )
    op.create_table(
        "gift_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occasion", sa.String(length=40), nullable=False),
        sa.Column("occasion_date", sa.Date(), nullable=False),
        sa.Column("recipient_key", sa.String(length=160), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("family_id", "occasion", "occasion_date", "recipient_key", name="uq_gift_budget"),
    )
    op.create_index("ix_gift_budgets_family_id", "gift_budgets", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_gift_budgets_family_id", table_name="gift_budgets")
    op.drop_table("gift_budgets")
    with op.batch_alter_table("gift_ideas") as batch:
        batch.drop_constraint("fk_gift_ideas_claimed_by_user_id", type_="foreignkey")
        batch.drop_constraint("fk_gift_ideas_for_contact_id", type_="foreignkey")
        batch.drop_column("claimed_at")
        batch.drop_column("claimed_by_user_id")
        batch.drop_column("image")
        batch.drop_column("for_contact_id")
        batch.drop_column("kind")
