from datetime import UTC, date
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Membership, User
from app.security import decode_token

security = HTTPBearer(auto_error=False)

COOKIE_NAME = "tribu_token"


def current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)
    if not token and creds:
        token = creds.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nicht authentifiziert")

    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültiges Token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Benutzer nicht gefunden")
    return user


def to_utc_naive(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def ensure_family_membership(db: Session, user_id: int, family_id: int):
    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.family_id == family_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diese Familie")
    return membership


def ensure_family_admin(db: Session, user_id: int, family_id: int):
    membership = ensure_family_membership(db, user_id, family_id)
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Admin Rolle erforderlich")
    return membership


def next_birthday_date(month: int, day: int, today: date) -> date:
    year = today.year
    candidate = date(year, month, day)
    if candidate < today:
        candidate = date(year + 1, month, day)
    return candidate
