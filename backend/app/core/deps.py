from datetime import UTC, date, datetime

from app.core.utils import utcnow
from typing import Optional

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Membership, PersonalAccessToken, User
from app.security import decode_token, hash_pat, is_pat
from app.core.scopes import parse_scopes
from app.core.errors import error_detail, INVALID_TOKEN, TOKEN_EXPIRED, UNAUTHENTICATED, USER_NOT_FOUND, NO_FAMILY_ACCESS, ADULT_REQUIRED, ADMIN_REQUIRED

security = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description=(
        "Personal Access Token (PAT) authentication. "
        "Create tokens via POST /tokens. Tokens are prefixed with `tribu_pat_` "
        "and passed in the Authorization header.\n\n"
        "Example: `Authorization: Bearer tribu_pat_abc123...`\n\n"
        "Cookie-based JWT auth (set automatically on login via POST /auth/login) "
        "is also supported and takes precedence."
    ),
)

COOKIE_NAME = "tribu_token"


def _resolve_user(request: Request, token_str: str, db: Session) -> User:
    """Resolve a user from a token string (JWT or PAT). Sets request.state.pat_scopes."""
    if is_pat(token_str):
        token_hash = hash_pat(token_str)
        pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.token_hash == token_hash).first()
        if not pat:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(INVALID_TOKEN))
        if pat.expires_at and pat.expires_at < utcnow():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(TOKEN_EXPIRED))
        pat.last_used_at = utcnow()
        db.commit()
        user = db.query(User).filter(User.id == pat.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(USER_NOT_FOUND))
        request.state.pat_scopes = parse_scopes(pat.scopes)
        return user

    try:
        payload = decode_token(token_str)
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(INVALID_TOKEN))

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(USER_NOT_FOUND))
    request.state.pat_scopes = None
    return user


def current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)
    if not token and creds:
        token = creds.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(UNAUTHENTICATED))

    return _resolve_user(request, token, db)


def current_user_via_token_param(
    request: Request,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    """Like current_user but also accepts ?token= query parameter. For feed endpoints."""
    token_str = request.cookies.get(COOKIE_NAME)
    if not token_str and creds:
        token_str = creds.credentials
    if not token_str and token:
        token_str = token
    if not token_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_detail(UNAUTHENTICATED))

    return _resolve_user(request, token_str, db)


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
        raise HTTPException(status_code=403, detail=error_detail(NO_FAMILY_ACCESS))
    return membership


def ensure_adult(db: Session, user_id: int, family_id: int):
    membership = ensure_family_membership(db, user_id, family_id)
    if not membership.is_adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    return membership


def ensure_family_admin(db: Session, user_id: int, family_id: int):
    membership = ensure_family_membership(db, user_id, family_id)
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail=error_detail(ADMIN_REQUIRED))
    return membership


def next_birthday_date(month: int, day: int, today: date) -> date:
    year = today.year
    candidate = date(year, month, day)
    if candidate < today:
        candidate = date(year + 1, month, day)
    return candidate
