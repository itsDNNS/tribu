"""Public OIDC login + callback endpoints (Issue #156).

Flow:

  1. Browser calls ``GET /auth/oidc/login?invite=<token>&redirect_to=/``.
     We discover the IdP's authorize endpoint, mint a random state
     + nonce + PKCE verifier, sign them into a short-lived httpOnly
     cookie, and 302 to the IdP.
  2. IdP posts the user back to ``GET /auth/oidc/callback?code=...&state=...``.
     We load the cookie, compare state, POST the code to the token
     endpoint with the PKCE verifier, verify the ID token's signature
     + iss + aud + exp + nonce via JWKS, and then link or create the
     local user. On success we set the standard ``tribu_token``
     cookie and redirect to the original ``redirect_to``.

Error handling: whenever something goes wrong after the user has
already left Tribu we redirect back to ``/?sso_error=<code>`` so the
frontend can render a translatable message instead of showing a raw
JSON error page.
"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import timedelta
from typing import Optional
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core import oidc as oidc_core
from app.core.clock import utcnow
from app.core.config import COOKIE_MAX_AGE, COOKIE_NAME, COOKIE_SECURE
from app.core.errors import (
    OIDC_ID_TOKEN_INVALID,
    OIDC_INVALID_CALLBACK,
    OIDC_NOT_CONFIGURED,
    OIDC_SIGNUP_DISABLED,
    OIDC_TOKEN_EXCHANGE_FAILED,
    error_detail,
)
from app.core.utils import audit_log as _audit, resolve_base_url
from app.database import get_db
from app.models import Family, FamilyInvitation, Membership, OIDCIdentity, User
from app.security import JWT_SECRET, create_access_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sso"])


FLOW_COOKIE = "tribu_oidc_flow"
FLOW_TTL_SECONDS = 600  # 10 minutes from authorize to callback
FLOW_JWT_ALG = "HS256"
FLOW_JWT_PURPOSE = "oidc_flow"


# ---------------------------------------------------------------------------
# Public config
# ---------------------------------------------------------------------------


@router.get(
    "/auth/oidc/public-config",
    summary="Public OIDC configuration",
    description=(
        "Return the minimum the login page needs to render the SSO "
        "button. Safe for unauthenticated callers: no secrets leak."
    ),
    response_description="Public OIDC flags + button label",
)
def public_config(db: Session = Depends(get_db)):
    cfg = oidc_core.load_config(db)
    ready = cfg.is_ready()
    return {
        "enabled": bool(cfg.enabled),
        "ready": ready,
        "button_label": cfg.effective_button_label() if ready else "",
        # Mirror the full backend gate (ready + disable flag + recent
        # SSO proof-of-life) so the frontend does not hide local auth
        # before the first successful SSO login, and so password login
        # automatically re-surfaces after the lockout grace expires.
        "password_login_disabled": oidc_core.password_login_disabled(db),
    }


# ---------------------------------------------------------------------------
# Flow cookie helpers
# ---------------------------------------------------------------------------


def _sign_flow(payload: dict) -> str:
    """Sign the flow payload into a JWT we hand to the browser.

    Shares JWT_SECRET with session tokens for convenience, but pins
    a distinct ``purpose`` claim so neither the flow cookie can
    authenticate a session request nor a stolen session cookie can
    satisfy the callback's state check — defense in depth against
    future code paths that might blur the two.
    """
    payload = {
        **payload,
        "exp": utcnow() + timedelta(seconds=FLOW_TTL_SECONDS),
        "purpose": FLOW_JWT_PURPOSE,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=FLOW_JWT_ALG)


def _unsign_flow(raw: str) -> dict:
    decoded = jwt.decode(raw, JWT_SECRET, algorithms=[FLOW_JWT_ALG])
    if decoded.get("purpose") != FLOW_JWT_PURPOSE:
        raise jwt.InvalidTokenError("Flow cookie has wrong purpose")
    return decoded


def _set_flow_cookie(response, token: str) -> None:
    response.set_cookie(
        FLOW_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=FLOW_TTL_SECONDS,
        path="/auth/oidc",
    )


def _clear_flow_cookie(response) -> None:
    response.delete_cookie(FLOW_COOKIE, path="/auth/oidc")


# ---------------------------------------------------------------------------
# /auth/oidc/login
# ---------------------------------------------------------------------------


def _safe_redirect(target: Optional[str]) -> str:
    """Reduce an arbitrary ``redirect_to`` to a same-origin path.

    Only absolute paths starting with ``/`` are accepted. Everything
    else (full URLs, ``//evil.com``, ``javascript:``, empty) collapses
    to ``/`` so the callback cannot be abused as an open redirect.
    """
    if not target or not target.startswith("/") or target.startswith("//"):
        return "/"
    return target


@router.get(
    "/auth/oidc/login",
    summary="Start an OIDC login",
    description=(
        "Redirect the browser to the configured identity provider's "
        "authorize endpoint with PKCE + nonce. Pass ``invite`` to "
        "bind the callback to an invitation token so that a new "
        "account can join a family in the same flow."
    ),
    response_description="302 to the identity provider",
)
def start_login(
    request: Request,
    invite: Optional[str] = Query(None, description="Invitation token to bind to the new account."),
    redirect_to: Optional[str] = Query(None, description="Absolute path to land on after login (same-origin)."),
    db: Session = Depends(get_db),
):
    cfg = oidc_core.load_config(db)
    if not cfg.is_ready():
        raise HTTPException(status_code=400, detail=error_detail(OIDC_NOT_CONFIGURED))

    try:
        disc = oidc_core.fetch_discovery(cfg.issuer)
    except oidc_core.DiscoveryError as exc:
        logger.warning("OIDC discovery failed at login: %s", exc)
        return RedirectResponse(url=_error_redirect("discovery_failed"), status_code=303)

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = oidc_core.generate_code_verifier()
    code_challenge = oidc_core.code_challenge_s256(code_verifier)

    redirect_uri = f"{resolve_base_url(db, request)}{oidc_core.CALLBACK_PATH}"

    authorize_params = {
        "response_type": "code",
        "client_id": cfg.client_id,
        "redirect_uri": redirect_uri,
        "scope": cfg.scopes or "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    authorize_url = f"{disc.authorization_endpoint}?{urlencode(authorize_params)}"

    flow_cookie = _sign_flow({
        "state": state,
        "nonce": nonce,
        "verifier": code_verifier,
        "invite": invite or "",
        "redirect_to": _safe_redirect(redirect_to),
        "issuer": cfg.issuer,
    })

    response = RedirectResponse(url=authorize_url, status_code=303)
    _set_flow_cookie(response, flow_cookie)
    return response


# ---------------------------------------------------------------------------
# /auth/oidc/callback
# ---------------------------------------------------------------------------


def _error_redirect(code: str) -> str:
    """Build the ``/?sso_error=<code>`` URL the frontend handles."""
    return f"/?sso_error={code}"


def _invitation_by_token(db: Session, token: Optional[str]) -> Optional[FamilyInvitation]:
    if not token:
        return None
    inv = (
        db.query(FamilyInvitation)
        .filter(FamilyInvitation.token == token)
        .with_for_update()
        .first()
    )
    if not inv:
        return None
    now = utcnow()
    if inv.revoked or inv.expires_at <= now:
        return None
    if inv.max_uses is not None and inv.use_count >= inv.max_uses:
        return None
    return inv


def _link_or_create_user(
    db: Session,
    *,
    cfg: oidc_core.OIDCConfig,
    claims: oidc_core.IDTokenClaims,
    invite_token: Optional[str],
) -> User:
    """Resolve claims to a local user, creating one only when allowed.

    Precedence:
      1. Existing OIDCIdentity on (issuer, sub) → that user.
      2. Existing User with the claim's verified email → link a new
         OIDCIdentity to them. Unverified email is refused so a
         malicious IdP cannot claim an arbitrary address.
      3. Invitation-bound signup: allow_signup=true and a valid
         invite token → create a new user, link the identity,
         apply the invitation's membership. Email is still required
         and the ``email_verified`` rule still applies.
      4. Otherwise → refuse with OIDC_SIGNUP_DISABLED. We do not
         silently create family-less users.
    """
    existing = (
        db.query(OIDCIdentity)
        .filter(
            OIDCIdentity.issuer == cfg.issuer,
            OIDCIdentity.subject == claims.subject,
        )
        .first()
    )
    if existing:
        user = db.query(User).filter(User.id == existing.user_id).first()
        if not user:
            raise HTTPException(status_code=500, detail=error_detail(OIDC_INVALID_CALLBACK))
        existing.last_login_at = utcnow()
        if claims.email:
            existing.email_at_login = claims.email
        return user

    if not claims.email or not claims.email_verified:
        raise HTTPException(
            status_code=400,
            detail=error_detail(
                OIDC_ID_TOKEN_INVALID,
                reason="email claim missing or not verified",
            ),
        )

    existing_user = (
        db.query(User)
        .filter(User.email == claims.email.lower())
        .first()
    )
    if existing_user:
        _link_identity_with_race_guard(
            db,
            user_id=existing_user.id,
            issuer=cfg.issuer,
            subject=claims.subject,
            email=claims.email,
        )
        return existing_user

    invitation = _invitation_by_token(db, invite_token)

    if not cfg.allow_signup or invitation is None:
        raise HTTPException(status_code=403, detail=error_detail(OIDC_SIGNUP_DISABLED))

    user = User(
        email=claims.email.lower(),
        password_hash=None,
        display_name=claims.name or claims.email,
        has_completed_onboarding=True,
    )
    db.add(user)
    db.flush()

    role = invitation.role_preset
    is_adult = invitation.is_adult_preset
    if role == "admin" and not is_adult:
        role = "member"

    db.add(Membership(
        user_id=user.id,
        family_id=invitation.family_id,
        role=role,
        is_adult=is_adult,
    ))
    invitation.use_count += 1

    _link_identity_with_race_guard(
        db,
        user_id=user.id,
        issuer=cfg.issuer,
        subject=claims.subject,
        email=claims.email,
    )

    _audit(
        db, invitation.family_id, None, "sso_invite_used",
        target_user_id=user.id,
        details={"email": user.email, "invite_id": invitation.id},
    )
    return user


def _link_identity_with_race_guard(
    db: Session,
    *,
    user_id: int,
    issuer: str,
    subject: str,
    email: Optional[str],
) -> OIDCIdentity:
    """Insert an OIDCIdentity, tolerating a concurrent first-login race.

    Two first-time callbacks for the same (issuer, subject) can both
    see "no row" in ``_link_or_create_user`` and both try to insert.
    The second flush fails on the ``uq_oidc_identities_issuer_subject``
    unique constraint. We catch that, roll back the failed flush, and
    re-fetch the winning row so the caller continues with it. If the
    winning row happens to belong to a *different* local user (which
    should not happen in practice: both racers discovered the same
    email_user_id first), we surface the discrepancy loudly rather
    than silently cross-binding.
    """
    from sqlalchemy.exc import IntegrityError

    identity = OIDCIdentity(
        user_id=user_id,
        issuer=issuer,
        subject=subject,
        email_at_login=email,
        last_login_at=utcnow(),
    )
    db.add(identity)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        winner = (
            db.query(OIDCIdentity)
            .filter(
                OIDCIdentity.issuer == issuer,
                OIDCIdentity.subject == subject,
            )
            .first()
        )
        if winner is None:
            raise
        if winner.user_id != user_id:
            logger.warning(
                "OIDC identity race: local user %s lost to %s for (%s, %s)",
                user_id, winner.user_id, issuer, subject,
            )
            raise HTTPException(
                status_code=409,
                detail=error_detail(OIDC_INVALID_CALLBACK),
            )
        # Update mutable fields on the winner
        winner.last_login_at = utcnow()
        if email:
            winner.email_at_login = email
        return winner
    return identity


@router.get(
    "/auth/oidc/callback",
    summary="OIDC callback",
    description=(
        "Consume the IdP's ``code`` + ``state`` response. Sets the "
        "standard session cookie and redirects back to the "
        "post-login target on success. On failure the redirect is "
        "``/?sso_error=<code>`` so the login page can render the "
        "reason in the user's language."
    ),
    response_description="Redirect to the landing page",
)
def callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),  # noqa: F841 — logged only
    db: Session = Depends(get_db),
):
    flow_raw = request.cookies.get(FLOW_COOKIE)
    if not flow_raw:
        resp = RedirectResponse(url=_error_redirect("missing_state"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    try:
        flow = _unsign_flow(flow_raw)
    except jwt.PyJWTError:
        resp = RedirectResponse(url=_error_redirect("invalid_state"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    if error:
        logger.info("OIDC provider returned error %r: %s", error, error_description)
        resp = RedirectResponse(url=_error_redirect("provider_error"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    if not code or not state:
        resp = RedirectResponse(url=_error_redirect("invalid_state"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    if not secrets.compare_digest(state, flow.get("state", "")):
        resp = RedirectResponse(url=_error_redirect("state_mismatch"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    cfg = oidc_core.load_config(db)
    if not cfg.is_ready() or cfg.issuer != flow.get("issuer"):
        # Issuer changed between authorize and callback — cfg drift.
        resp = RedirectResponse(url=_error_redirect("config_changed"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    try:
        disc = oidc_core.fetch_discovery(cfg.issuer)
    except oidc_core.DiscoveryError as exc:
        logger.warning("OIDC discovery failed at callback: %s", exc)
        resp = RedirectResponse(url=_error_redirect("discovery_failed"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    redirect_uri = f"{resolve_base_url(db, request)}{oidc_core.CALLBACK_PATH}"

    try:
        token_response = oidc_core.exchange_code_for_tokens(
            token_endpoint=disc.token_endpoint,
            code=code,
            redirect_uri=redirect_uri,
            client_id=cfg.client_id,
            client_secret=cfg.client_secret,
            code_verifier=flow["verifier"],
        )
    except oidc_core.TokenExchangeError as exc:
        logger.warning("OIDC token exchange failed: %s", exc)
        resp = RedirectResponse(url=_error_redirect("token_exchange_failed"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    try:
        claims = oidc_core.verify_id_token(
            token_response["id_token"],
            issuer=cfg.issuer,
            client_id=cfg.client_id,
            jwks_uri=disc.jwks_uri,
            expected_nonce=flow.get("nonce"),
        )
    except oidc_core.IDTokenError as exc:
        logger.warning("OIDC ID token verification failed: %s", exc)
        resp = RedirectResponse(url=_error_redirect("id_token_invalid"), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    try:
        user = _link_or_create_user(
            db,
            cfg=cfg,
            claims=claims,
            invite_token=flow.get("invite") or None,
        )
    except HTTPException as exc:
        db.rollback()
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "UNKNOWN"}
        code_tag = str(detail.get("code", "signup_blocked")).lower()
        resp = RedirectResponse(url=_error_redirect(code_tag), status_code=303)
        _clear_flow_cookie(resp)
        return resp

    # Stamp proof-of-life so password_login_disabled can trust that
    # SSO actually works end-to-end. Commit once for the whole
    # transaction (identity link + membership + timestamp).
    oidc_core.record_successful_sso_login(db)

    db.commit()

    jwt_token = create_access_token(user_id=user.id, email=user.email)
    redirect_to = _safe_redirect(flow.get("redirect_to"))
    response = RedirectResponse(url=redirect_to, status_code=303)
    response.set_cookie(
        COOKIE_NAME, jwt_token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    _clear_flow_cookie(response)
    return response
