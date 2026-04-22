import os

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.errors import error_detail, ADMIN_REQUIRED, ADULT_REQUIRED
from app.models import AuditLog, Membership, SystemSetting

# Re-export utcnow so existing `from app.core.utils import utcnow` keeps working
__all__ = [
    "utcnow",
    "audit_log",
    "ensure_any_admin",
    "ensure_any_adult",
    "get_setting",
    "set_setting",
    "resolve_base_url",
]


# ── Audit log helper ────────────────────────────────────────

def audit_log(db: Session, family_id: int, admin_id: int | None, action: str,
              *, target_user_id: int | None = None, details: dict | None = None):
    """Write an entry to the family audit log."""
    db.add(AuditLog(family_id=family_id, admin_user_id=admin_id, action=action,
                     target_user_id=target_user_id, details=details))


# ── "Any-family admin" check ────────────────────────────────

def ensure_any_admin(db: Session, user_id: int):
    """Raise 403 if the user is not an admin of at least one family."""
    admin = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.role == "admin",
    ).first()
    if not admin:
        raise HTTPException(status_code=403, detail=error_detail(ADMIN_REQUIRED))
    return admin


def ensure_any_adult(db: Session, user_id: int):
    """Raise 403 if the user is not an adult member of at least one family."""
    adult = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.is_adult == True,
    ).first()
    if not adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    return adult


# ── SystemSetting helpers ───────────────────────────────────

def get_setting(db: Session, key: str, default: str = "") -> str:
    """Read a value from the system_settings table."""
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else default


def set_setting(db: Session, key: str, value: str):
    """Upsert a value in the system_settings table (does not commit)."""
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = utcnow()
    else:
        row = SystemSetting(key=key, value=value, updated_at=utcnow())
        db.add(row)
    db.flush()


# ── Base-URL resolution ────────────────────────────────────

def resolve_base_url(db: Session, request: Request) -> str:
    """Return the canonical base URL for this instance.

    Resolution order:
      1. Explicit admin override saved in ``system_settings.base_url``
         (set via PUT /admin/settings/base-url).
      2. ``BASE_URL`` environment variable.
      3. Reverse-proxy headers (``x-forwarded-proto`` / ``x-forwarded-host``)
         falling back to the direct request if they are missing.

    Trailing slashes are always stripped so callers can safely
    concatenate paths.
    """
    saved = get_setting(db, "base_url")
    if saved:
        return saved.rstrip("/")
    env_val = os.getenv("BASE_URL", "")
    if env_val:
        return env_val.rstrip("/")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    return f"{scheme}://{host}".rstrip("/")
