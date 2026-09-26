"""Store small and large profile image sizes next to the uploaded image.

Existing uploads are converted once into the square WebP sizes the API
now serves (app.core.avatars). The uploaded images stay untouched;
unreadable ones simply get no sizes.

Revision ID: 0059_profile_image_sizes
Revises: 0058_display_stage_weather
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.avatars import try_build_avatar_variants


revision: str = "0059_profile_image_sizes"
down_revision: Union[str, None] = "0058_display_stage_weather"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_image_small", sa.String(), nullable=True))
    op.add_column("users", sa.Column("profile_image_large", sa.String(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM users WHERE profile_image IS NOT NULL")).fetchall()
    # One user at a time keeps memory flat even with many large uploads.
    for (user_id,) in rows:
        image = bind.execute(sa.text("SELECT profile_image FROM users WHERE id = :id"), {"id": user_id}).scalar()
        variants = try_build_avatar_variants(image)
        if variants is None:
            continue
        bind.execute(
            sa.text("UPDATE users SET profile_image_small = :small, profile_image_large = :large WHERE id = :id"),
            {"small": variants.small, "large": variants.large, "id": user_id},
        )


def downgrade() -> None:
    op.drop_column("users", "profile_image_large")
    op.drop_column("users", "profile_image_small")
