"""Link family_birthdays to contacts by stable id.

Revision ID: 0029
Revises: 0028
Create Date: 2026-04-22

Issue #160. Previously, contact-synced birthdays were located and
maintained by ``person_name``, which broke on rename and could not
represent two contacts sharing a name. This migration adds a nullable
``contact_id`` FK on ``family_birthdays`` plus a partial unique index
on ``(family_id, contact_id) WHERE contact_id IS NOT NULL``.

Existing rows are backfilled only when name+date matches are
unambiguous within a family; ambiguous legacy data is left unlinked so
nothing is silently merged or reassigned. The runtime backfill logic
lives in ``app.core.contact_birthdays.backfill_contact_id_from_name_match``
so it is unit-testable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.contact_birthdays import backfill_contact_id_from_name_match


revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    if not _has_column("family_birthdays", "contact_id"):
        # batch_alter_table rebuilds the table under SQLite so the FK is
        # actually created; it is a no-op wrapper on PostgreSQL.
        with op.batch_alter_table("family_birthdays") as batch:
            batch.add_column(sa.Column("contact_id", sa.Integer, nullable=True))
            batch.create_foreign_key(
                "fk_family_birthdays_contact_id",
                "contacts",
                ["contact_id"],
                ["id"],
                ondelete="SET NULL",
            )

    if not _has_index("family_birthdays", "ix_family_birthdays_contact_id"):
        op.create_index(
            "ix_family_birthdays_contact_id",
            "family_birthdays",
            ["contact_id"],
        )

    if not _has_index("family_birthdays", "uq_family_birthdays_family_contact"):
        op.create_index(
            "uq_family_birthdays_family_contact",
            "family_birthdays",
            ["family_id", "contact_id"],
            unique=True,
            sqlite_where=sa.text("contact_id IS NOT NULL"),
            postgresql_where=sa.text("contact_id IS NOT NULL"),
        )

    backfill_contact_id_from_name_match(op.get_bind())


def downgrade() -> None:
    if _has_index("family_birthdays", "uq_family_birthdays_family_contact"):
        op.drop_index("uq_family_birthdays_family_contact", table_name="family_birthdays")
    if _has_index("family_birthdays", "ix_family_birthdays_contact_id"):
        op.drop_index("ix_family_birthdays_contact_id", table_name="family_birthdays")
    if _has_column("family_birthdays", "contact_id"):
        with op.batch_alter_table("family_birthdays") as batch:
            batch.drop_constraint("fk_family_birthdays_contact_id", type_="foreignkey")
            batch.drop_column("contact_id")
