"""Store profile image sources and product photos bounded and without metadata.

Profile image uploads were kept exactly as sent (up to 2 MB, including EXIF
data such as the camera location). Readable profile images and shopping
product photos are replaced by a WebP of at most 1024 px on the longest side,
with the EXIF orientation applied and no metadata. Unreadable images stay
untouched.

This conversion is not reversible: downgrading keeps the converted images.

Revision ID: 0061_normalize_stored_photos
Revises: 0060_process_runs
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.avatars import AvatarError, normalize_photo


revision: str = "0061_normalize_stored_photos"
down_revision: Union[str, None] = "0060_process_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_column(table: str, column: str) -> None:
    bind = op.get_bind()
    ids = [row[0] for row in bind.execute(sa.text(f"SELECT id FROM {table} WHERE {column} IS NOT NULL")).fetchall()]
    # One row at a time keeps memory flat with many large images.
    for row_id in ids:
        value = bind.execute(sa.text(f"SELECT {column} FROM {table} WHERE id = :id"), {"id": row_id}).scalar()
        try:
            normalized = normalize_photo(value)
        except AvatarError:
            continue
        bind.execute(sa.text(f"UPDATE {table} SET {column} = :value WHERE id = :id"), {"value": normalized, "id": row_id})


def upgrade() -> None:
    _normalize_column("users", "profile_image")
    _normalize_column("shopping_items", "photo")


def downgrade() -> None:
    # The original uploads are gone; the converted images stay valid for older versions.
    pass
