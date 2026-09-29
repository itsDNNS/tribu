"""Drop the dashboard layout preference (#523).

Today orders the day by time, so there is no card order to keep. The web
app and the Tribu app 2.0 no longer read ``/nav/dashboard-layout``; the
endpoints and ``user_nav_order.dashboard_layout`` go away.

Revision ID: 0069_drop_dashboard_layout
Revises: 0068_item_source
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0069_drop_dashboard_layout"
down_revision: Union[str, None] = "0068_item_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_nav_order") as batch:
        batch.drop_column("dashboard_layout")


def downgrade() -> None:
    with op.batch_alter_table("user_nav_order") as batch:
        batch.add_column(sa.Column("dashboard_layout", sa.JSON(), nullable=True))
