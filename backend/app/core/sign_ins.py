"""One log line per failed sign-in, and sign-ins in the family audit logs.

The log line lets fail2ban, CrowdSec or similar ban addresses that keep guessing:

    Failed sign-in: ip=203.0.113.7 method=password

The address is resolved like the rate limits' (``TRUSTED_PROXY_CIDRS``), so the
reverse proxy must be trusted, or every line shows the proxy's address.

Audit entries name the method, never the address, so family admins don't see
where a member signs in from. A wrong password writes no audit entry: it must
cost no more than an unknown email (#650), and nobody can fill an audit log by
guessing.

After a few wrong passwords for an email, attempts have to be further and
further apart (doubling up to a few minutes), however many addresses the
guesses come from. It counts per email, known or not, in the rate-limit
storage, so an unknown email behaves exactly like an account. There is no
lockout: the owner gets in after the wait, and a right password clears it.
"""
import hashlib
import logging
import math
import os
import time

from fastapi import Request
from limits.storage import storage_from_string
from sqlalchemy.orm import Session

from app.core.rate_limits import rate_limit_key
from app.core.utils import audit_log
from app.models import Membership, User

logger = logging.getLogger("tribu.security")

FREE_PASSWORD_ATTEMPTS = 3
MAX_PASSWORD_DELAY_SECONDS = 300
PASSWORD_ATTEMPTS_KEPT_SECONDS = 24 * 3600
# Valkey when configured, so all workers share the count, like the rate limits.
password_attempts = storage_from_string(
    os.getenv("REDIS_URL") or "memory://", socket_connect_timeout=2, socket_timeout=2,
)


def log_failed_sign_in(request: Request, method: str) -> None:
    logger.warning("Failed sign-in: ip=%s method=%s", rate_limit_key(request), method)


def audit_sign_in(db: Session, user: User, method: str, *, ok: bool = True) -> None:
    """Add a ``sign_in`` or ``sign_in_failed`` entry for each of the account's families; the caller commits."""
    for (family_id,) in db.query(Membership.family_id).filter(Membership.user_id == user.id):
        audit_log(db, family_id, None, "sign_in" if ok else "sign_in_failed",
                  target_user_id=user.id, details={"method": method})


def _attempt_keys(email: str) -> tuple[str, str]:
    lookup = hashlib.sha256(email.strip().lower().encode()).hexdigest()
    return f"sign-in-failures:{lookup}", f"sign-in-wait:{lookup}"


def password_wait(email: str) -> int:
    """Seconds this email must wait before trying a password; 0 lets this attempt through.

    Past the free attempts, each attempt claims the next wait at once, so
    parallel guesses from many addresses get one try per wait, not one each.
    """
    failures, wait = _attempt_keys(email)
    try:
        excess = password_attempts.get(failures) - FREE_PASSWORD_ATTEMPTS
        if excess < 0 or password_attempts.incr(wait, min(2 ** excess, MAX_PASSWORD_DELAY_SECONDS)) == 1:
            return 0
        return max(1, math.ceil(password_attempts.get_expiry(wait) - time.time()))
    except Exception as e:  # storage unreachable: the per-address rate limit still applies
        logger.warning("Sign-in delay unavailable: %s", e)
        return 0


def count_password_attempt(email: str, *, ok: bool) -> None:
    """A right password clears the count and the wait; a wrong one adds to the count."""
    failures, wait = _attempt_keys(email)
    try:
        if ok:
            password_attempts.clear(failures)
            password_attempts.clear(wait)
        else:
            password_attempts.incr(failures, PASSWORD_ATTEMPTS_KEPT_SECONDS)
    except Exception as e:
        logger.warning("Sign-in delay unavailable: %s", e)
