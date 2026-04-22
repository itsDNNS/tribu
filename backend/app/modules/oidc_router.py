"""Admin endpoints for OIDC / SSO configuration (Issue #156).

This module only exposes the *configuration* surface — the actual
login / callback endpoints live in ``app.modules.oidc_auth_router``
and are wired up in Phase 2. Separating the two routers keeps the
admin-only "read/write settings" responses tidy in the OpenAPI doc
and lets us put the public login endpoints on their own tag.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import oidc as oidc_core
from app.core.deps import current_user
from app.core.errors import (
    OIDC_DISCOVERY_FAILED,
    OIDC_INVALID_PRESET,
    error_detail,
)
from app.core.oidc_presets import PRESETS, list_presets
from app.core.scopes import require_scope
from app.core.utils import ensure_any_admin
from app.database import get_db
from app.models import User
from app.schemas import (
    AUTH_RESPONSES,
    OIDCConfigResponse,
    OIDCConfigUpdate,
    OIDCPresetEntry,
    OIDCTestRequest,
    OIDCTestResponse,
)

router = APIRouter(
    prefix="/admin/oidc",
    tags=["admin-settings"],
    responses={**AUTH_RESPONSES},
)


def _to_response(cfg: oidc_core.OIDCConfig) -> OIDCConfigResponse:
    return OIDCConfigResponse(
        enabled=cfg.enabled,
        preset=cfg.preset,
        button_label=cfg.button_label,
        issuer=cfg.issuer,
        client_id=cfg.client_id,
        client_secret_set=bool(cfg.client_secret),
        scopes=cfg.scopes,
        allow_signup=cfg.allow_signup,
        disable_password_login=cfg.disable_password_login,
        ready=cfg.is_ready(),
    )


@router.get(
    "/presets",
    response_model=list[OIDCPresetEntry],
    summary="List OIDC provider presets",
    description=(
        "Return the catalog of provider presets (Authentik, Zitadel, "
        "Keycloak, generic) shown in the admin SSO form. Admin role "
        "required. Scope: `admin:read`."
    ),
    response_description="All available provider presets",
)
def get_presets(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
) -> list[OIDCPresetEntry]:
    ensure_any_admin(db, user.id)
    return [OIDCPresetEntry(**p) for p in list_presets()]


@router.get(
    "",
    response_model=OIDCConfigResponse,
    summary="Read OIDC configuration",
    description=(
        "Return the current Single Sign-On configuration. The client "
        "secret itself is never returned; `client_secret_set` "
        "indicates whether one is stored. Admin role required. "
        "Scope: `admin:read`."
    ),
    response_description="Current OIDC configuration",
)
def get_oidc_config(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
) -> OIDCConfigResponse:
    ensure_any_admin(db, user.id)
    cfg = oidc_core.load_config(db)
    return _to_response(cfg)


@router.put(
    "",
    response_model=OIDCConfigResponse,
    summary="Update OIDC configuration",
    description=(
        "Partial update of the Single Sign-On configuration. Fields "
        "omitted from the request body keep their stored value. Pass "
        "an explicit empty string for `client_secret` to clear it. "
        "Admin role required. Scope: `admin:write`."
    ),
    response_description="Updated OIDC configuration",
)
def update_oidc_config(
    payload: OIDCConfigUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
) -> OIDCConfigResponse:
    ensure_any_admin(db, user.id)

    cfg = oidc_core.load_config(db)

    preset = payload.preset if payload.preset is not None else cfg.preset
    if preset not in PRESETS:
        raise HTTPException(
            status_code=400,
            detail=error_detail(OIDC_INVALID_PRESET, preset=preset),
        )

    oidc_core.save_config(
        db,
        enabled=payload.enabled if payload.enabled is not None else cfg.enabled,
        preset=preset,
        button_label=(
            payload.button_label
            if payload.button_label is not None
            else cfg.button_label
        ),
        issuer=payload.issuer if payload.issuer is not None else cfg.issuer,
        client_id=(
            payload.client_id if payload.client_id is not None else cfg.client_id
        ),
        client_secret=payload.client_secret,  # None = keep
        scopes=payload.scopes if payload.scopes is not None else cfg.scopes,
        allow_signup=(
            payload.allow_signup
            if payload.allow_signup is not None
            else cfg.allow_signup
        ),
        disable_password_login=(
            payload.disable_password_login
            if payload.disable_password_login is not None
            else cfg.disable_password_login
        ),
    )
    db.commit()
    # Fresh admin input supersedes anything we cached from the prior
    # configuration. Nothing persists in memory from the previous
    # issuer so the next login attempt re-fetches discovery.
    oidc_core.invalidate_discovery_cache()
    return _to_response(oidc_core.load_config(db))


@router.post(
    "/test",
    response_model=OIDCTestResponse,
    summary="Probe the OIDC discovery document",
    description=(
        "Fetch `<issuer>/.well-known/openid-configuration` and return "
        "the discovered endpoints so the admin can verify the IdP is "
        "reachable before saving the configuration. Admin role "
        "required. Scope: `admin:read`."
    ),
    response_description="Discovery probe result",
)
def test_discovery(
    payload: OIDCTestRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
) -> OIDCTestResponse:
    ensure_any_admin(db, user.id)

    issuer = (payload.issuer or "").strip()
    if not issuer:
        return OIDCTestResponse(
            ok=False,
            error=error_detail(OIDC_DISCOVERY_FAILED, reason="empty issuer")["message"],
        )

    try:
        disc = oidc_core.fetch_discovery(issuer, force=True)
    except oidc_core.DiscoveryError as exc:
        return OIDCTestResponse(ok=False, error=str(exc))

    return OIDCTestResponse(
        ok=True,
        issuer=disc.issuer,
        authorization_endpoint=disc.authorization_endpoint,
        token_endpoint=disc.token_endpoint,
        userinfo_endpoint=disc.userinfo_endpoint,
        jwks_uri=disc.jwks_uri,
    )
