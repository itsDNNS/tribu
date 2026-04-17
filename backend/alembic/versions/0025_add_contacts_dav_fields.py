"""Add CardDAV identity columns and updated_at to contacts.

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-17

Gives the Contact rows the same DAV hooks CalendarEvent already has:
``vcard_uid``, ``dav_href``, and ``updated_at`` with matching
per-family unique indexes. Existing rows are backfilled with
synthesized identifiers so pre-migration rows keep surfacing in the
address book.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return any(i["name"] == name for i in insp.get_indexes(table))


def upgrade() -> None:
    if not _has_column("contacts", "updated_at"):
        op.add_column(
            "contacts",
            sa.Column(
                "updated_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.execute("UPDATE contacts SET updated_at = created_at")
    if not _has_column("contacts", "vcard_uid"):
        op.add_column("contacts", sa.Column("vcard_uid", sa.String(200), nullable=True))
        op.execute(
            "UPDATE contacts "
            "SET vcard_uid = 'tribu-contact-' || id || '@tribu.local' "
            "WHERE vcard_uid IS NULL"
        )
    if not _has_column("contacts", "dav_href"):
        op.add_column("contacts", sa.Column("dav_href", sa.String(250), nullable=True))
        op.execute(
            "UPDATE contacts "
            "SET dav_href = 'tribu-contact-' || id || '.vcf' "
            "WHERE dav_href IS NULL"
        )
    if not _has_index("contacts", "uq_contacts_family_uid"):
        op.create_index(
            "uq_contacts_family_uid",
            "contacts",
            ["family_id", "vcard_uid"],
            unique=True,
        )
    if not _has_index("contacts", "uq_contacts_family_href"):
        op.create_index(
            "uq_contacts_family_href",
            "contacts",
            ["family_id", "dav_href"],
            unique=True,
        )


def downgrade() -> None:
    if _has_index("contacts", "uq_contacts_family_href"):
        op.drop_index("uq_contacts_family_href", table_name="contacts")
    if _has_index("contacts", "uq_contacts_family_uid"):
        op.drop_index("uq_contacts_family_uid", table_name="contacts")
    for col in ("dav_href", "vcard_uid", "updated_at"):
        if _has_column("contacts", col):
            with op.batch_alter_table("contacts") as batch:
                batch.drop_column(col)
