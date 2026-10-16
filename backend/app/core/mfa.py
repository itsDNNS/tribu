"""Optional second login step: authenticator app codes (TOTP, RFC 6238) and recovery codes.

The login endpoints check the password first and then hand out a short-lived
challenge token instead of a session. Only a valid code turns that challenge
into a session. Recovery codes are single use and stored as SHA-256 lookups;
they carry ~50 bits of randomness and are guarded by the failed-attempt limit.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlencode

import jwt
from sqlalchemy.orm import Session

from app.core.clock import utcnow_aware
from app.models import MfaRecoveryCode, User
from app.security import JWT_ALG, JWT_SECRET

ISSUER = "Tribu"
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
# Accept the previous and next 30-second window for clock drift on phones.
TOTP_DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 10
# Lowercase letters and digits without look-alikes (i/l/1, o/0).
RECOVERY_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
RECOVERY_CODE_LENGTH = 10
LOGIN_CHALLENGE_TTL = timedelta(minutes=5)
SETUP_TTL = timedelta(minutes=10)
MAX_FAILED_ATTEMPTS = 5
LOCKOUT = timedelta(minutes=15)

LOGIN_CHALLENGE_TYPE = "mfa_login"
SETUP_TYPE = "mfa_setup"


class MfaLockedError(Exception):
    """Too many wrong codes in a row; the second step is paused for a while."""


def _signing_key() -> str:
    # Derived from the server secret but different from the access token key,
    # so a challenge can never be used as a session token.
    return hmac.new(JWT_SECRET.encode(), b"tribu-mfa", hashlib.sha256).hexdigest()


def mfa_enabled(user: User) -> bool:
    return user.mfa_enabled_at is not None and bool(user.totp_secret)


# ---------------------------------------------------------------------------
# TOTP
# ---------------------------------------------------------------------------

def generate_totp_secret() -> str:
    # 20 random bytes encode to exactly 32 base32 characters without padding.
    return base64.b32encode(secrets.token_bytes(20)).decode()


def totp_code(secret: str, step: int) -> str:
    key = base64.b32decode(secret)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** TOTP_DIGITS).zfill(TOTP_DIGITS)


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // TOTP_PERIOD_SECONDS)


def matching_step(secret: str, code: str, after_step: int | None = None, now: float | None = None) -> int | None:
    """Return the time step ``code`` belongs to, or None.

    Steps at or before ``after_step`` are refused so an observed code cannot
    be replayed within its validity window.
    """
    code = code.strip().replace(" ", "")
    if len(code) != TOTP_DIGITS or not code.isdigit():
        return None
    step = current_step(now)
    for candidate in range(step - TOTP_DRIFT_STEPS, step + TOTP_DRIFT_STEPS + 1):
        if after_step is not None and candidate <= after_step:
            continue
        if hmac.compare_digest(totp_code(secret, candidate), code):
            return candidate
    return None


def otpauth_uri(secret: str, email: str) -> str:
    label = quote(f"{ISSUER}:{email}")
    params = urlencode({"secret": secret, "issuer": ISSUER, "digits": TOTP_DIGITS, "period": TOTP_PERIOD_SECONDS})
    return f"otpauth://totp/{label}?{params}"


# ---------------------------------------------------------------------------
# Recovery codes
# ---------------------------------------------------------------------------

def _normalize_recovery_code(code: str) -> str:
    return "".join(ch for ch in code.lower() if ch.isalnum())


def recovery_code_lookup_key(code: str) -> str:
    return hashlib.sha256(_normalize_recovery_code(code).encode()).hexdigest()


def generate_recovery_codes() -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(RECOVERY_CODE_ALPHABET) for _ in range(RECOVERY_CODE_LENGTH))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def remaining_recovery_codes(db: Session, user: User) -> int:
    return db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).count()


def _use_recovery_code(db: Session, user: User, code: str) -> bool:
    normalized = _normalize_recovery_code(code)
    if len(normalized) != RECOVERY_CODE_LENGTH:
        return False
    row = (
        db.query(MfaRecoveryCode)
        .filter(MfaRecoveryCode.user_id == user.id, MfaRecoveryCode.code_lookup == recovery_code_lookup_key(normalized))
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    return True


# ---------------------------------------------------------------------------
# Turning MFA on and off
# ---------------------------------------------------------------------------

def enable_mfa(db: Session, user: User, secret: str, confirmed_step: int) -> list[str]:
    """Store a confirmed secret and return fresh recovery codes (shown once)."""
    codes = generate_recovery_codes()
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).delete(synchronize_session=False)
    for code in codes:
        db.add(MfaRecoveryCode(user_id=user.id, code_lookup=recovery_code_lookup_key(code)))
    user.totp_secret = secret
    user.totp_last_step = confirmed_step
    user.mfa_enabled_at = utcnow_aware()
    user.mfa_failed_attempts = 0
    user.mfa_last_failed_at = None
    return codes


def disable_mfa(db: Session, user: User) -> None:
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).delete(synchronize_session=False)
    user.totp_secret = None
    user.totp_last_step = None
    user.mfa_enabled_at = None
    user.mfa_failed_attempts = 0
    user.mfa_last_failed_at = None


# ---------------------------------------------------------------------------
# Checking a code
# ---------------------------------------------------------------------------

def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _recent_failures(user: User, now: datetime) -> int:
    last_failed = user.mfa_last_failed_at
    if last_failed is None or now - _as_aware(last_failed) >= LOCKOUT:
        return 0
    return user.mfa_failed_attempts or 0


def verify_second_factor(db: Session, user: User, code: str) -> bool:
    """Check an authenticator or recovery code and track failures.

    Raises MfaLockedError after MAX_FAILED_ATTEMPTS wrong codes within LOCKOUT,
    which caps guessing per account no matter how many IPs an attacker uses.
    The caller commits.
    """
    now = utcnow_aware()
    failures = _recent_failures(user, now)
    if failures >= MAX_FAILED_ATTEMPTS:
        raise MfaLockedError()
    step = matching_step(user.totp_secret, code, after_step=user.totp_last_step) if user.totp_secret else None
    if step is not None:
        user.totp_last_step = step
    elif not _use_recovery_code(db, user, code):
        user.mfa_failed_attempts = failures + 1
        user.mfa_last_failed_at = now
        return False
    user.mfa_failed_attempts = 0
    user.mfa_last_failed_at = None
    return True


# ---------------------------------------------------------------------------
# Short-lived tokens between steps
# ---------------------------------------------------------------------------

def _encode(user: User, token_type: str, ttl: timedelta, **claims: object) -> str:
    now = utcnow_aware()
    payload = {"sub": str(user.id), "typ": token_type, "iat": now.timestamp(), "exp": now + ttl, **claims}
    return jwt.encode(payload, _signing_key(), algorithm=JWT_ALG)


def _decode(token: str, token_type: str) -> dict | None:
    try:
        payload = jwt.decode(token, _signing_key(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != token_type:
        return None
    return payload


def create_login_challenge(user: User) -> str:
    return _encode(user, LOGIN_CHALLENGE_TYPE, LOGIN_CHALLENGE_TTL)


def read_login_challenge(db: Session, token: str) -> User | None:
    """Return the user behind a still-valid challenge, locked for the update."""
    payload = _decode(token, LOGIN_CHALLENGE_TYPE)
    if payload is None:
        return None
    try:
        user_id = int(payload["sub"])
        issued_at = datetime.fromtimestamp(float(payload["iat"]), UTC)
    except (KeyError, TypeError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None or not mfa_enabled(user):
        return None
    # A password change or sign-out-everywhere after the password step voids the challenge.
    if user.session_invalidated_at is not None and issued_at < _as_aware(user.session_invalidated_at):
        return None
    return user


def create_setup_token(user: User, secret: str) -> str:
    return _encode(user, SETUP_TYPE, SETUP_TTL, secret=secret)


def read_setup_token(token: str, user: User) -> str | None:
    """Return the pending secret if the setup token belongs to ``user``."""
    payload = _decode(token, SETUP_TYPE)
    if payload is None or payload.get("sub") != str(user.id):
        return None
    secret = payload.get("secret")
    return secret if isinstance(secret, str) else None
