"""Small square thumbnails for shopping product photos.

Shopping lists show product photos as small tiles, yet every list response
carried the stored photo of up to 1024 px. ``shopping_items.photo_thumbnail``
keeps a 128 px square WebP next to it, created on upload; this migration fills
it for existing photos. Unreadable photos keep no thumbnail, so clients fall
back to the stored photo.

Revision ID: 0081_shopping_photo_thumbnails
Revises: 0080_user_mfa
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.avatars import AvatarError, product_thumbnail


revision: str = "0081_shopping_photo_thumbnails"
down_revision: Union[str, None] = "0080_user_mfa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shopping_items", sa.Column("photo_thumbnail", sa.Text(), nullable=True))
    bind = op.get_bind()
    ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM shopping_items WHERE photo IS NOT NULL")).fetchall()]
    # One row at a time keeps memory flat with many large images.
    for row_id in ids:
        photo = bind.execute(sa.text("SELECT photo FROM shopping_items WHERE id = :id"), {"id": row_id}).scalar()
        try:
            thumbnail = product_thumbnail(photo)
        except AvatarError:
            continue
        bind.execute(sa.text("UPDATE shopping_items SET photo_thumbnail = :value WHERE id = :id"), {"value": thumbnail, "id": row_id})


def downgrade() -> None:
    with op.batch_alter_table("shopping_items") as batch:
        batch.drop_column("photo_thumbnail")
