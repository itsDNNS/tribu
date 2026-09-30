"""Members' birthdays in the birthday list; contacts can be a member.

``family_birthdays`` is the list the calendar, Today, displays, reminders and
phones read. It held contacts' birthdays only, so a member's own birthday
(``memberships.date_of_birth``) reached some screens and not others. Members
now have their row too (``family_birthdays.member_user_id``).

A contact can say it is a family member (``contacts.member_user_id``), for
the phone's "Hannelore Müller" who is "Hannelore" in Tribu. The member's
birthday then stands for both. ``contact_member_dismissals`` remembers pairs
someone marked as different people.

Revision ID: 0074_member_birthdays_links
Revises: 0073_rewards_goals_and_praise
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0074_member_birthdays_links"
down_revision: Union[str, None] = "0073_rewards_goals_and_praise"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contacts") as batch:
        batch.add_column(sa.Column("member_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_contacts_member_user_id", "users", ["member_user_id"], ["id"], ondelete="SET NULL",
        )
    with op.batch_alter_table("family_birthdays") as batch:
        batch.add_column(sa.Column("member_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_family_birthdays_member_user_id", "users", ["member_user_id"], ["id"], ondelete="CASCADE",
        )
        batch.create_index("ix_family_birthdays_member_user_id", ["member_user_id"])
    op.create_table(
        "contact_member_dismissals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("contact_id", "member_user_id", name="uq_contact_member_dismissal"),
    )
    op.create_index("ix_contact_member_dismissals_family_id", "contact_member_dismissals", ["family_id"])

    # Every member with a birthday gets their row in the list.
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        """
        SELECT m.family_id, m.user_id, m.date_of_birth, u.display_name, u.email
        FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.date_of_birth IS NOT NULL
        """
    )).fetchall()
    for family_id, user_id, born, display_name, email in rows:
        if isinstance(born, str):
            year, month, day = (int(part) for part in born[:10].split("-"))
        else:
            year, month, day = born.year, born.month, born.day
        name = (display_name or "").strip() or (email or "").split("@")[0]
        bind.execute(
            sa.text(
                "INSERT INTO family_birthdays (family_id, person_name, month, day, year, member_user_id, created_at) "
                "VALUES (:family_id, :name, :month, :day, :year, :user_id, CURRENT_TIMESTAMP)"
            ),
            {"family_id": family_id, "name": name, "month": month, "day": day, "year": year, "user_id": user_id},
        )


def downgrade() -> None:
    op.execute("DELETE FROM family_birthdays WHERE member_user_id IS NOT NULL")
    op.drop_index("ix_contact_member_dismissals_family_id", table_name="contact_member_dismissals")
    op.drop_table("contact_member_dismissals")
    with op.batch_alter_table("family_birthdays") as batch:
        batch.drop_index("ix_family_birthdays_member_user_id")
        batch.drop_constraint("fk_family_birthdays_member_user_id", type_="foreignkey")
        batch.drop_column("member_user_id")
    with op.batch_alter_table("contacts") as batch:
        batch.drop_constraint("fk_contacts_member_user_id", type_="foreignkey")
        batch.drop_column("member_user_id")
