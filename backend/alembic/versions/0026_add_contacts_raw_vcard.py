"""Add raw_vcard passthrough column to contacts.

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-17

The DAV storage plugin stores the full uploaded vCard text here so
fields Tribu does not model (ORG, ADR, NOTE, secondary EMAIL/TEL,
PHOTO, etc.) round-trip on the next GET instead of being silently
lost. Tribu's own UI continues to render from the structured
columns (full_name, email, phone, birthday).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if _has_column("contacts", "raw_vcard"):
        return
    op.add_column("contacts", sa.Column("raw_vcard", sa.Text, nullable=True))


def downgrade() -> None:
    if not _has_column("contacts", "raw_vcard"):
        return
    with op.batch_alter_table("contacts") as batch:
        batch.drop_column("raw_vcard")
