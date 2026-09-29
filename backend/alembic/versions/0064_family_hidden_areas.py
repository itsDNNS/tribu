"""Let a family hide the optional areas it does not use.

``families.hidden_areas`` lists navigation keys such as ``recipes``
(Tribu 2.0, R4). Unset shows every area.

Revision ID: 0064_family_hidden_areas
Revises: 0063_activity_object_label
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0064_family_hidden_areas"
down_revision: Union[str, None] = "0063_activity_object_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("families", sa.Column("hidden_areas", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("families", "hidden_areas")
