"""Two-step sign-in: setup, turning it off, and the second login step."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core import mfa
from app.core import oidc as oidc_core
from app.core.auth_sessions import issue_refresh_session, issue_session_cookies
from app.core.config import REFRESH_COOKIE_MAX_AGE
from app.core.deps import current_user
from app.core.errors import (
    error_detail,
    MFA_ALREADY_ENABLED,
    MFA_CHALLENGE_INVALID,
    MFA_CODE_INVALID,
    MFA_NOT_ENABLED,
    MFA_SETUP_EXPIRED,
    MFA_TOO_MANY_ATTEMPTS,
    PASSWORD_INCORRECT,
    PASSWORD_LOGIN_DISABLED,
)
from app.core.rate_limits import limiter_storage_options
from app.core.scopes import require_scope
from app.database import get_db
from app.models import User
from app.schemas import (
    AUTH_RESPONSES,
    ErrorResponse,
    MfaConfirmRequest,
    MfaDisableRequest,
    MfaLoginRequest,
    MfaPasswordRequest,
    MfaRecoveryCodesResponse,
    MfaSetupResponse,
    MfaStatusResponse,
    MobileLoginResponse,
)
from app.security import JWT_EXPIRE_HOURS, create_access_token, verify_password

router = APIRouter(tags=["auth"])
# Keyed by the direct peer like the other routers, so behind the frontend proxy all
# clients share one budget; the per-account lockout in app.core.mfa is the real guard.
limiter = Limiter(key_func=get_remote_address, **limiter_storage_options())

SETUP_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Code, password or setup token not valid"},
    409: {"model": ErrorResponse, "description": "Two-step sign-in is already on"},
}
CODE_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Code or password not valid"},
    429: {"model": ErrorResponse, "description": "Too many wrong codes"},
}


def _check_code(db: Session, user: User, code: str) -> None:
    """Raise unless ``code`` is valid; failed attempts are committed before raising."""
    try:
        valid = mfa.verify_second_factor(db, user, code)
    except mfa.MfaLockedError:
        raise HTTPException(status_code=429, detail=error_detail(MFA_TOO_MANY_ATTEMPTS))
    if not valid:
        db.commit()
        raise HTTPException(status_code=400, detail=error_detail(MFA_CODE_INVALID))


def _challenge_user(db: Session, token: str) -> User:
    user = mfa.read_login_challenge(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail=error_detail(MFA_CHALLENGE_INVALID))
    return user


@router.get(
    "/auth/me/mfa",
    summary="Two-step sign-in status",
    description="Return whether sign-in asks for an authenticator code. Scope: `profile:read`.",
    response_model=MfaStatusResponse,
    responses={**AUTH_RESPONSES},
)
def mfa_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:read"),
):
    enabled = mfa.mfa_enabled(user)
    return MfaStatusResponse(
        enabled=enabled,
        available=bool(user.password_hash) and not oidc_core.password_login_disabled(db),
        recovery_codes_remaining=mfa.remaining_recovery_codes(db, user) if enabled else 0,
    )


@router.post(
    "/auth/me/mfa/setup",
    summary="Start two-step sign-in setup",
    description=(
        "Check the current password and return a new authenticator secret. "
        "Nothing changes until the first code is confirmed. Scope: `profile:write`."
    ),
    response_model=MfaSetupResponse,
    responses={**AUTH_RESPONSES, **SETUP_RESPONSES},
)
@limiter.limit("10/minute")
def mfa_setup(
    request: Request,
    payload: MfaPasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    if oidc_core.password_login_disabled(db):
        raise HTTPException(status_code=403, detail=error_detail(PASSWORD_LOGIN_DISABLED))
    if mfa.mfa_enabled(user):
        raise HTTPException(status_code=409, detail=error_detail(MFA_ALREADY_ENABLED))
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail=error_detail(PASSWORD_INCORRECT))
    secret = mfa.generate_totp_secret()
    return MfaSetupResponse(
        secret=secret,
        otpauth_uri=mfa.otpauth_uri(secret, user.email),
        setup_token=mfa.create_setup_token(user, secret),
    )


@router.post(
    "/auth/me/mfa/confirm",
    summary="Turn two-step sign-in on",
    description=(
        "Confirm the setup with the first code from the authenticator app. "
        "Returns single-use recovery codes, which are shown only this once. Scope: `profile:write`."
    ),
    response_model=MfaRecoveryCodesResponse,
    responses={**AUTH_RESPONSES, **SETUP_RESPONSES},
)
@limiter.limit("10/minute")
def mfa_confirm(
    request: Request,
    payload: MfaConfirmRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    if mfa.mfa_enabled(user):
        raise HTTPException(status_code=409, detail=error_detail(MFA_ALREADY_ENABLED))
    secret = mfa.read_setup_token(payload.setup_token, user)
    if secret is None:
        raise HTTPException(status_code=400, detail=error_detail(MFA_SETUP_EXPIRED))
    step = mfa.matching_step(secret, payload.code)
    if step is None:
        raise HTTPException(status_code=400, detail=error_detail(MFA_CODE_INVALID))
    codes = mfa.enable_mfa(db, user, secret, step)
    db.commit()
    return MfaRecoveryCodesResponse(recovery_codes=codes)


@router.post(
    "/auth/me/mfa/disable",
    summary="Turn two-step sign-in off",
    description="Requires the current password and an authenticator or recovery code. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES, **CODE_RESPONSES},
)
@limiter.limit("10/minute")
def mfa_disable(
    request: Request,
    payload: MfaDisableRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    if not mfa.mfa_enabled(user):
        raise HTTPException(status_code=400, detail=error_detail(MFA_NOT_ENABLED))
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail=error_detail(PASSWORD_INCORRECT))
    _check_code(db, user, payload.code)
    mfa.disable_mfa(db, user)
    db.commit()
    return {"status": "ok"}


@router.post(
    "/auth/login/mfa",
    summary="Finish login with the second step",
    description=(
        "Exchange the challenge token from `POST /auth/login` and an authenticator or recovery code "
        "for the session cookies. Rate limited to 20 requests per minute; five wrong codes pause the "
        "account's second step for 15 minutes. No authentication required."
    ),
    responses={**CODE_RESPONSES, 401: {"model": ErrorResponse, "description": "Challenge expired or invalid"}},
)
@limiter.limit("20/minute")
def login_mfa(request: Request, payload: MfaLoginRequest, db: Session = Depends(get_db)):
    user = _challenge_user(db, payload.mfa_token)
    _check_code(db, user, payload.code)
    response = JSONResponse(content={"status": "ok", "must_change_password": user.must_change_password})
    issue_session_cookies(response, db, user)
    db.commit()
    return response


@router.post(
    "/auth/mobile-login/mfa",
    summary="Finish mobile login with the second step",
    description=(
        "Exchange the challenge token from the `MFA_REQUIRED` error of `POST /auth/mobile-login` "
        "and an authenticator or recovery code for bearer tokens. Same limits as `POST /auth/login/mfa`."
    ),
    response_model=MobileLoginResponse,
    responses={**CODE_RESPONSES, 401: {"model": ErrorResponse, "description": "Challenge expired or invalid"}},
)
@limiter.limit("20/minute")
def mobile_login_mfa(request: Request, payload: MfaLoginRequest, db: Session = Depends(get_db)):
    user = _challenge_user(db, payload.mfa_token)
    _check_code(db, user, payload.code)
    refresh_token = issue_refresh_session(db, user)
    db.commit()
    return MobileLoginResponse(
        access_token=create_access_token(user_id=user.id, email=user.email),
        refresh_token=refresh_token,
        expires_in_hours=JWT_EXPIRE_HOURS,
        refresh_expires_in_seconds=REFRESH_COOKIE_MAX_AGE,
        must_change_password=user.must_change_password,
    )
