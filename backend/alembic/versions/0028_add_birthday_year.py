"""Add optional year column to family_birthdays.

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-21

The birthday UI wanted an optional year so tribu can compute and
display the person's current age alongside the date. Existing rows
stay nullable because the year is not always known (e.g. distant
relatives, in-laws).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if _has_column("family_birthdays", "year"):
        return
    op.add_column("family_birthdays", sa.Column("year", sa.Integer, nullable=True))


def downgrade() -> None:
    if not _has_column("family_birthdays", "year"):
        return
    with op.batch_alter_table("family_birthdays") as batch:
        batch.drop_column("year")
