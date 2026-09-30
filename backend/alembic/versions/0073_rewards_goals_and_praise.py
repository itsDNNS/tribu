"""Rewards around goals: personal goals, family goals and praise.

The rewards were bookkeeping: a currency to set up first, earning rules
that led nowhere, and a queue of tokens to confirm. They now start from
what the family works towards:

- ``memberships.reward_goal_id``: the wish someone saves for.
- ``rewards.kind``: ``personal`` (bought from one's own stars) or
  ``family`` (everyone puts stars in); ``rewards.achieved_at`` marks a
  family goal the family has reached and celebrated.
- ``token_transactions.fulfilled_at``: an approved wish that was actually
  given. Stars put into a family goal are transactions of kind ``give``.
- ``praises``: a thank-you from one member to another, with or without
  stars.

Currencies named after the English starting presets ("Stars", "Gems", ...)
lose the name, so every reader sees it in their own language.

Revision ID: 0073_rewards_goals_and_praise
Revises: 0072_contacts_carry_birthdays
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0073_rewards_goals_and_praise"
down_revision: Union[str, None] = "0072_contacts_carry_birthdays"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PRESET_NAMES = ("Stars", "Gems", "Hearts", "Bolts", "Trophies")


def upgrade() -> None:
    with op.batch_alter_table("rewards") as batch:
        batch.add_column(sa.Column("kind", sa.String(length=10), nullable=False, server_default="personal"))
        batch.add_column(sa.Column("achieved_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("memberships") as batch:
        batch.add_column(sa.Column("reward_goal_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_memberships_reward_goal_id", "rewards", ["reward_goal_id"], ["id"], ondelete="SET NULL",
        )
    with op.batch_alter_table("token_transactions") as batch:
        batch.add_column(sa.Column("fulfilled_at", sa.DateTime(), nullable=True))
    op.create_table(
        "praises",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "transaction_id", sa.Integer(),
            sa.ForeignKey("token_transactions.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_praises_family_id", "praises", ["family_id"])
    reward_currencies = sa.table("reward_currencies", sa.column("name", sa.String))
    op.execute(
        reward_currencies.update()
        .where(reward_currencies.c.name.in_(PRESET_NAMES))
        .values(name="")
    )


def downgrade() -> None:
    op.drop_index("ix_praises_family_id", table_name="praises")
    op.drop_table("praises")
    with op.batch_alter_table("token_transactions") as batch:
        batch.drop_column("fulfilled_at")
    with op.batch_alter_table("memberships") as batch:
        batch.drop_constraint("fk_memberships_reward_goal_id", type_="foreignkey")
        batch.drop_column("reward_goal_id")
    with op.batch_alter_table("rewards") as batch:
        batch.drop_column("achieved_at")
        batch.drop_column("kind")
