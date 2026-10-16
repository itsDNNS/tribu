"""Optional second login step with an authenticator app and recovery codes.

- ``users``: TOTP secret, when MFA was turned on, the last accepted time step
  and a failed-attempt counter for the second step.
- ``mfa_recovery_codes``: hashed single-use recovery codes.

Revision ID: 0080_user_mfa
Revises: 0079_duty_pauses
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0080_user_mfa"
down_revision: Union[str, None] = "0079_duty_pauses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("mfa_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("totp_last_step", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("mfa_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("mfa_last_failed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "mfa_recovery_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_lookup", sa.String(64), nullable=False),
    )
    op.create_index("ix_mfa_recovery_codes_id", "mfa_recovery_codes", ["id"])
    op.create_index("ix_mfa_recovery_codes_user_id", "mfa_recovery_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mfa_recovery_codes_user_id", table_name="mfa_recovery_codes")
    op.drop_index("ix_mfa_recovery_codes_id", table_name="mfa_recovery_codes")
    op.drop_table("mfa_recovery_codes")
    op.drop_column("users", "mfa_last_failed_at")
    op.drop_column("users", "mfa_failed_attempts")
    op.drop_column("users", "totp_last_step")
    op.drop_column("users", "mfa_enabled_at")
    op.drop_column("users", "totp_secret")
