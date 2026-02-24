import base64
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


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against a hash. Supports both bcrypt and legacy
    passlib pbkdf2_sha256 hashes for migration purposes."""
    if hashed.startswith("$2b$") or hashed.startswith("$2a$"):
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    if hashed.startswith("$pbkdf2-sha256$"):
        return _verify_legacy_pbkdf2(plain, hashed)
    return False


def needs_rehash(hashed: str) -> bool:
    """Return True if the hash uses a legacy scheme and should be rehashed."""
    return not hashed.startswith("$2b$")


def _ab64_decode(data: str) -> bytes:
    """Decode passlib's ab64 encoding (base64 with . instead of +, no padding)."""
    data = data.replace(".", "+")
    padding = 4 - (len(data) % 4)
    if padding < 4:
        data += "=" * padding
    return base64.b64decode(data)


def _verify_legacy_pbkdf2(plain: str, hashed: str) -> bool:
    """Verify a passlib pbkdf2_sha256 hash without the passlib dependency.
    Format: $pbkdf2-sha256$rounds$salt$checksum"""
    parts = hashed.split("$")
    if len(parts) != 5 or parts[1] != "pbkdf2-sha256":
        return False
    rounds = int(parts[2])
    salt = _ab64_decode(parts[3])
    expected = _ab64_decode(parts[4])
    derived = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, rounds, dklen=len(expected))
    return secrets.compare_digest(derived, expected)


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


def generate_pat() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    plain = f"{PAT_PREFIX}{raw}"
    return plain, hashlib.sha256(plain.encode()).hexdigest()


def hash_pat(plain: str) -> str:
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
