"""Sign-ins in the family audit logs, and one log line per failed attempt.

The log line lets fail2ban, CrowdSec or similar ban addresses that keep guessing:

    Failed sign-in: ip=203.0.113.7 method=password

The address is resolved like the rate limits' (``TRUSTED_PROXY_CIDRS``), so the
reverse proxy must be trusted, or every line shows the proxy's address.
"""
import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.rate_limits import rate_limit_key
from app.core.utils import audit_log
from app.models import Membership, User

logger = logging.getLogger("tribu.security")


def record_sign_in(request: Request, db: Session, user: User | None, method: str, *, ok: bool = True) -> None:
    """Add a ``sign_in`` or ``sign_in_failed`` entry for each of the account's families; the caller commits."""
    ip = rate_limit_key(request)
    if not ok:
        logger.warning("Failed sign-in: ip=%s method=%s", ip, method)
    if user is None:
        return
    for (family_id,) in db.query(Membership.family_id).filter(Membership.user_id == user.id):
        audit_log(db, family_id, None, "sign_in" if ok else "sign_in_failed",
                  target_user_id=user.id, details={"ip": ip, "method": method})
