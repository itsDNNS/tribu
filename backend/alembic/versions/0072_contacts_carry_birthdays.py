"""Contacts carry birthdays; duplicates can be dismissed.

Birthdays and contacts were two lists: a contact knew day and month, a
birthday entry also the year, and birthdays without a contact lived only in
their own tab. Every person is a contact now:

- ``contacts.birthday_year`` takes the year from the linked birthday entry.
- Each birthday entry without a contact becomes a contact with that name and
  date, and the entry is linked to it.

``family_birthdays`` stays as the list the calendar, Today and displays read;
it follows the contacts. ``contact_duplicate_dismissals`` remembers pairs
someone marked as different people.

Revision ID: 0072_contacts_carry_birthdays
Revises: 0071_dav_sync_and_raw_vevent
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0072_contacts_carry_birthdays"
down_revision: Union[str, None] = "0071_dav_sync_and_raw_vevent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contacts") as batch:
        batch.add_column(sa.Column("birthday_year", sa.Integer(), nullable=True))
    op.create_table(
        "contact_duplicate_dismissals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("second_contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("first_contact_id", "second_contact_id", name="uq_contact_duplicate_dismissals_pair"),
    )
    op.create_index(
        "ix_contact_duplicate_dismissals_family_id", "contact_duplicate_dismissals", ["family_id"]
    )

    bind = op.get_bind()
    bind.execute(sa.text(
        """
        UPDATE contacts SET birthday_year = (
            SELECT fb.year FROM family_birthdays fb WHERE fb.contact_id = contacts.id AND fb.year IS NOT NULL
        )
        WHERE birthday_year IS NULL
          AND EXISTS (SELECT 1 FROM family_birthdays fb WHERE fb.contact_id = contacts.id AND fb.year IS NOT NULL)
        """
    ))
    rows = bind.execute(sa.text(
        "SELECT id, family_id, person_name, month, day, year, created_at "
        "FROM family_birthdays WHERE contact_id IS NULL ORDER BY id"
    )).fetchall()
    for birthday_id, family_id, name, month, day, year, created_at in rows:
        contact_id = bind.execute(
            sa.text(
                "INSERT INTO contacts (family_id, full_name, birthday_month, birthday_day, birthday_year, created_at, updated_at) "
                "VALUES (:family_id, :name, :month, :day, :year, :created_at, :created_at) RETURNING id"
            ),
            {"family_id": family_id, "name": name, "month": month, "day": day, "year": year, "created_at": created_at},
        ).scalar()
        bind.execute(
            sa.text("UPDATE family_birthdays SET contact_id = :contact_id WHERE id = :id"),
            {"contact_id": contact_id, "id": birthday_id},
        )


def downgrade() -> None:
    op.drop_index("ix_contact_duplicate_dismissals_family_id", table_name="contact_duplicate_dismissals")
    op.drop_table("contact_duplicate_dismissals")
    with op.batch_alter_table("contacts") as batch:
        batch.drop_column("birthday_year")
