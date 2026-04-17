"""Prepare PAT storage for bcrypt hashing with HMAC lookup key.

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-17

Tribu's Personal Access Tokens were stored as plain SHA-256 digests
with ``token_hash`` used both as the verification primitive and as the
DB lookup key. Two problems:

1. SHA-256 is a fast, unsalted hash. Fine for high-entropy bearer
   tokens in isolation, but the static-analysis tooling (CodeQL's
   ``py/weak-sensitive-data-hashing``) keeps flagging it because the
   name-based heuristic cannot tell a PAT apart from a user password.
2. Switching directly to bcrypt breaks lookup: bcrypt is salted, so
   there is no ``stored == bcrypt(plain)`` shortcut.

This migration widens ``token_hash`` to hold bcrypt's ~60-character
envelope (plus headroom) and introduces ``token_lookup`` — a
deterministic, keyed HMAC fingerprint used for equality lookup. The
verification primitive (bcrypt) stays unsalted-dependent on the hash
column; the lookup column only narrows the candidate set.

Legacy rows are left untouched (``token_lookup = NULL``). The login
path still falls back to ``token_hash == sha256(plain)`` for rows that
have not yet been migrated; lazy migration happens on the next
successful auth and moves the row to bcrypt + HMAC lookup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return column in {c["name"] for c in insp.get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    return any(i["name"] == name for i in insp.get_indexes(table))


def upgrade() -> None:
    # Widen the existing SHA-256 hex column to accommodate bcrypt
    # envelopes. bcrypt output is ~60 chars; 256 gives headroom for
    # possible future algorithm swaps.
    with op.batch_alter_table("personal_access_tokens") as batch:
        batch.alter_column(
            "token_hash",
            existing_type=sa.String(64),
            type_=sa.String(256),
            existing_nullable=False,
        )

    if not _has_column("personal_access_tokens", "token_lookup"):
        op.add_column(
            "personal_access_tokens",
            sa.Column("token_lookup", sa.String(64), nullable=True),
        )
        # Legacy rows stored SHA-256(plain) in token_hash. That is
        # exactly the value token_lookup is supposed to hold going
        # forward, so copy it over for every existing row. The
        # verification primitive per row stays SHA-256 until the first
        # successful auth rewrites token_hash to bcrypt.
        op.execute(
            "UPDATE personal_access_tokens "
            "SET token_lookup = token_hash "
            "WHERE token_lookup IS NULL"
        )
    if not _has_index("personal_access_tokens", "uq_personal_access_tokens_lookup"):
        op.create_index(
            "uq_personal_access_tokens_lookup",
            "personal_access_tokens",
            ["token_lookup"],
            unique=True,
        )


def downgrade() -> None:
    if _has_index("personal_access_tokens", "uq_personal_access_tokens_lookup"):
        op.drop_index(
            "uq_personal_access_tokens_lookup",
            table_name="personal_access_tokens",
        )
    if _has_column("personal_access_tokens", "token_lookup"):
        with op.batch_alter_table("personal_access_tokens") as batch:
            batch.drop_column("token_lookup")
    with op.batch_alter_table("personal_access_tokens") as batch:
        batch.alter_column(
            "token_hash",
            existing_type=sa.String(256),
            type_=sa.String(64),
            existing_nullable=False,
        )
