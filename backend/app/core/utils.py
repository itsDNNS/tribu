from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.errors import error_detail, ADMIN_REQUIRED, ADULT_REQUIRED
from app.models import AuditLog, Membership, SystemSetting

# Re-export utcnow so existing `from app.core.utils import utcnow` keeps working
__all__ = ["utcnow", "audit_log", "ensure_any_admin", "ensure_any_adult", "get_setting", "set_setting"]


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
