from __future__ import annotations

from datetime import timedelta

from fastapi import Response
from sqlalchemy.orm import Session

from app.core.config import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    COOKIE_SECURE,
    REFRESH_COOKIE_MAX_AGE,
    REFRESH_COOKIE_NAME,
)
from app.core.utils import utcnow
from app.models import User, UserSession
from app.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_lookup_key,
    verify_refresh_token,
)


REFRESH_COOKIE_PATH = "/"


def issue_session_cookies(response: Response, db: Session, user: User) -> None:
    """Create a revocable refresh session and set both auth cookies."""
    access_token = create_access_token(user_id=user.id, email=user.email)
    refresh_token, stored_hash, lookup = generate_refresh_token()
    now = utcnow()
    db.add(
        UserSession(
            user_id=user.id,
            token_lookup=lookup,
            token_hash=stored_hash,
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(seconds=REFRESH_COOKIE_MAX_AGE),
        )
    )
    response.set_cookie(
        COOKIE_NAME, access_token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME, refresh_token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=REFRESH_COOKIE_MAX_AGE, path=REFRESH_COOKIE_PATH,
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/auth/refresh")


def rotate_refresh_session(response: Response, db: Session, refresh_token: str) -> User | None:
    session = (
        db.query(UserSession)
        .filter(UserSession.token_lookup == refresh_token_lookup_key(refresh_token))
        .first()
    )
    if not session or session.revoked_at is not None:
        return None
    now = utcnow()
    if session.expires_at <= now:
        session.revoked_at = now
        db.commit()
        return None
    if not verify_refresh_token(refresh_token, session.token_hash):
        return None
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        session.revoked_at = now
        db.commit()
        return None

    next_token, next_hash, next_lookup = generate_refresh_token()
    session.token_lookup = next_lookup
    session.token_hash = next_hash
    session.last_used_at = now
    session.expires_at = now + timedelta(seconds=REFRESH_COOKIE_MAX_AGE)

    access_token = create_access_token(user_id=user.id, email=user.email)
    response.set_cookie(
        COOKIE_NAME, access_token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME, next_token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=REFRESH_COOKIE_MAX_AGE, path=REFRESH_COOKIE_PATH,
    )
    return user


def revoke_refresh_session(db: Session, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    session = (
        db.query(UserSession)
        .filter(UserSession.token_lookup == refresh_token_lookup_key(refresh_token))
        .first()
    )
    if session and session.revoked_at is None:
        session.revoked_at = utcnow()
        db.commit()
