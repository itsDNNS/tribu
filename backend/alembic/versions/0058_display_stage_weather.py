"""Move shared displays to the rotating stage layout and add a family weather place.

Every existing display device is switched to the stage layout with the
default rotation (their name, mode, token and refresh cadence are kept).
Families get an optional Open-Meteo location for the display weather card.

Revision ID: 0058_display_stage_weather
Revises: 0057_shopping_visual_details
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0058_display_stage_weather"
down_revision: Union[str, None] = "0057_shopping_visual_details"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Snapshot of the default stage layout at the time of this migration.
STAGE_LAYOUT = {
    "version": 2,
    "zones": {
        "a": {"cards": ["dinner", "shopping", "weather"], "interval_seconds": 60},
        "b": {"cards": ["reminders", "school"], "interval_seconds": 60},
        "c": {"cards": ["soon", "stars"], "interval_seconds": 60},
        "d": {"cards": ["people", "week"], "interval_seconds": 60},
    },
    "stagger": True,
    "skip_empty": True,
    "pause_on_touch": True,
    "night_dim": True,
    "day_parts": {"morning_start": "05:30", "morning_end": "09:00", "evening_start": "18:00", "night_start": "22:00"},
    "eink_format": "compact",
}


def upgrade() -> None:
    op.add_column("families", sa.Column("weather_location_name", sa.String(length=120), nullable=True))
    op.add_column("families", sa.Column("weather_latitude", sa.Float(), nullable=True))
    op.add_column("families", sa.Column("weather_longitude", sa.Float(), nullable=True))

    with op.batch_alter_table("display_devices") as batch:
        batch.alter_column(
            "layout_preset",
            existing_type=sa.String(length=64),
            existing_nullable=False,
            server_default="stage",
        )
    op.execute(
        sa.text("UPDATE display_devices SET layout_preset = 'stage', layout_config = :layout").bindparams(
            sa.bindparam("layout", value=STAGE_LAYOUT, type_=sa.JSON())
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE display_devices SET layout_config = NULL, "
            "layout_preset = CASE WHEN display_mode = 'eink' THEN 'eink_compact' ELSE 'hearth' END"
        )
    )
    with op.batch_alter_table("display_devices") as batch:
        batch.alter_column(
            "layout_preset",
            existing_type=sa.String(length=64),
            existing_nullable=False,
            server_default="hearth",
        )
    op.drop_column("families", "weather_longitude")
    op.drop_column("families", "weather_latitude")
    op.drop_column("families", "weather_location_name")
