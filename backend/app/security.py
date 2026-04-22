import hashlib
import os
import secrets
import string
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required. Set it via environment variable.")


# ---------------------------------------------------------------------------
# Password hashing (bcrypt)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str | None) -> bool:
    """Verify a password against a bcrypt hash.

    Tolerates ``hashed=None`` because SSO-only users have no local
    password_hash on the row. Any non-bcrypt envelope (including
    ``None`` and the empty string) is rejected so an attacker cannot
    coerce a successful login by sending a crafted payload against
    an account that was never meant to use password auth.
    """
    if not hashed:
        return False
    if hashed.startswith("$2b$") or hashed.startswith("$2a$"):
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    return False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


# ---------------------------------------------------------------------------
# Personal Access Tokens
# ---------------------------------------------------------------------------

PAT_PREFIX = "tribu_pat_"


def generate_pat() -> tuple[str, str, str]:
    """Return ``(plain, stored_hash, lookup_key)`` for a fresh PAT.

    Plain is the token handed to the user once, stored_hash is the
    bcrypt envelope for verification, lookup_key is the HMAC-SHA256
    fingerprint for indexed equality lookup.
    """
    raw = secrets.token_urlsafe(32)
    plain = f"{PAT_PREFIX}{raw}"
    return plain, hash_pat(plain), pat_lookup_key(plain)


def hash_pat(plain: str) -> str:
    """Return a bcrypt hash of a PAT for storage.

    Used for both freshly-generated tokens and for lazy migration
    when a legacy SHA-256-hashed row authenticates successfully.
    bcrypt is intentionally overkill for a bearer token with 256
    bits of entropy, but it makes static analysis (CodeQL) happy
    without cost beyond the single hash per login.
    """
    import bcrypt
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_pat(plain: str, stored_hash: str) -> bool:
    """Constant-time compare a PAT against its stored hash.

    Accepts both the new bcrypt envelope (``$2b$...``) and the
    legacy 64-hex SHA-256 format so freshly-migrated and legacy
    rows both authenticate during the transition window.
    """
    import bcrypt
    import hmac
    if stored_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(plain.encode(), stored_hash.encode())
        except ValueError:
            return False
    return hmac.compare_digest(pat_lookup_key(plain), stored_hash)


def pat_lookup_key(plain: str) -> str:
    """Deterministic SHA-256 fingerprint used for indexed PAT lookup.

    The token itself is 256 bits of entropy (``secrets.token_urlsafe(32)``),
    so an attacker who dumps the DB cannot brute-force the preimage
    even without a keyed construction. Using plain SHA-256 instead of
    ``hmac(JWT_SECRET, plain)`` means that rotating ``JWT_SECRET``
    (for example after a suspected leak of JWTs) does not invalidate
    PATs. Legacy rows persisted the same value in ``token_hash``, so
    the migration backfills ``token_lookup = token_hash`` and every
    row converges on the same column for equality lookup going
    forward. The verification primitive stays per-row: bcrypt for
    rows stamped after the migration, SHA-256-via-hmac.compare_digest
    for legacy rows awaiting lazy migration.
    """
    return hashlib.sha256(plain.encode()).hexdigest()


def is_pat(token: str) -> bool:
    return token.startswith(PAT_PREFIX)


# ---------------------------------------------------------------------------
# Temporary password generation
# ---------------------------------------------------------------------------

def generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isupper() for c in password) and any(c.isdigit() for c in password):
            return password
