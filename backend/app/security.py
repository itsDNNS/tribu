import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required. Set it via environment variable.")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


PAT_PREFIX = "tribu_pat_"


def generate_pat() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    plain = f"{PAT_PREFIX}{raw}"
    return plain, hashlib.sha256(plain.encode()).hexdigest()


def hash_pat(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()


def is_pat(token: str) -> bool:
    return token.startswith(PAT_PREFIX)
