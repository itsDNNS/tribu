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
    """Verify a password against a bcrypt hash."""
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
