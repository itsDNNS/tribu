"""Add OIDC / SSO support.

Revision ID: 0030
Revises: 0029
Create Date: 2026-04-22

Issue #156. Adds the schema prerequisites for generic OpenID Connect
login so Tribu can integrate with self-hosted identity providers
(Authentik, Zitadel, Keycloak, ...).

Two changes:

1. ``users.password_hash`` becomes nullable. A user created purely
   via SSO has no local password; cleaning them up to a sentinel
   string would mean ``verify_password`` has to special-case it and
   risks someone bypassing password login with a crafted payload.
   Instead, ``/auth/login`` already treats missing passwords as an
   invalid-credential failure because ``verify_password`` refuses
   anything that is not a bcrypt envelope.

2. New ``oidc_identities`` table links a local user to a remote
   (issuer, subject) pair. ``subject`` is the OIDC ``sub`` claim,
   which per the spec is stable for the lifetime of the account at
   the IdP and MUST be used as the identifier rather than email
   (which can change). ``email_at_login`` is kept only for audit /
   debugging when admins need to confirm which provider row belongs
   to which user.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in insp.get_table_names()


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return name in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    # Relax users.password_hash to allow SSO-only accounts. Existing
    # rows are NOT NULL; the alter just widens the allowed set.
    with op.batch_alter_table("users") as batch:
        batch.alter_column(
            "password_hash",
            existing_type=sa.String(),
            nullable=True,
        )

    if not _has_table("oidc_identities"):
        op.create_table(
            "oidc_identities",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("issuer", sa.String(500), nullable=False),
            sa.Column("subject", sa.String(255), nullable=False),
            sa.Column("email_at_login", sa.String(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint(
                "issuer", "subject", name="uq_oidc_identities_issuer_subject"
            ),
        )

    if not _has_index("oidc_identities", "ix_oidc_identities_user_id"):
        op.create_index(
            "ix_oidc_identities_user_id",
            "oidc_identities",
            ["user_id"],
        )


def downgrade() -> None:
    if _has_index("oidc_identities", "ix_oidc_identities_user_id"):
        op.drop_index(
            "ix_oidc_identities_user_id", table_name="oidc_identities"
        )
    if _has_table("oidc_identities"):
        op.drop_table("oidc_identities")

    # Restore NOT NULL only if every row has a password_hash. On a
    # real deployment that has used SSO accounts this downgrade is
    # informational only; admins would have to backfill or drop the
    # SSO-only rows first.
    with op.batch_alter_table("users") as batch:
        batch.alter_column(
            "password_hash",
            existing_type=sa.String(),
            nullable=False,
        )
