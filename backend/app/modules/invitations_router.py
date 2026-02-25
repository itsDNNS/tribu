import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.deps import current_user, ensure_family_admin
from app.core.scopes import require_scope
from app.core.config import COOKIE_NAME, COOKIE_MAX_AGE, COOKIE_SECURE
from app.database import get_db
from app.models import (
    AuditLog, Family, FamilyInvitation, Membership, SystemSetting, User,
)
from app.schemas import (
    BaseUrlUpdate, InvitationCreate, InvitationResponse,
    InviteInfoResponse, RegisterWithInviteRequest,
)
from app.security import create_access_token, hash_password

from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Admin endpoints (authenticated, family-scoped)
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/families", tags=["invitations"])


def _audit(db, family_id, admin_id, action, target_user_id=None, details=None):
    db.add(AuditLog(family_id=family_id, admin_user_id=admin_id, action=action,
                     target_user_id=target_user_id, details=details))


def _get_base_url(db: Session, request: Request) -> str:
    row = db.query(SystemSetting).filter(SystemSetting.key == "base_url").first()
    if row and row.value:
        return row.value.rstrip("/")
    env_val = os.getenv("BASE_URL", "")
    if env_val:
        return env_val.rstrip("/")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    return f"{scheme}://{host}"


def _invitation_to_response(inv: FamilyInvitation, base_url: str) -> InvitationResponse:
    return InvitationResponse(
        id=inv.id,
        family_id=inv.family_id,
        token=inv.token,
        invite_url=f"{base_url}/invite/{inv.token}",
        role_preset=inv.role_preset,
        is_adult_preset=inv.is_adult_preset,
        max_uses=inv.max_uses,
        use_count=inv.use_count,
        expires_at=inv.expires_at,
        revoked=inv.revoked,
        created_by_user_id=inv.created_by_user_id,
        created_at=inv.created_at,
    )


@router.post("/{family_id}/invitations", response_model=InvitationResponse)
def create_invitation(
    family_id: int,
    payload: InvitationCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    if payload.role_preset not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be admin or member")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=payload.expires_in_days)

    invitation = FamilyInvitation(
        family_id=family_id,
        token=token,
        created_by_user_id=user.id,
        role_preset=payload.role_preset,
        is_adult_preset=payload.is_adult_preset,
        max_uses=payload.max_uses,
        expires_at=expires_at,
    )
    db.add(invitation)
    _audit(db, family_id, user.id, "invite_created",
           details={"role_preset": payload.role_preset, "expires_in_days": payload.expires_in_days})
    db.commit()
    db.refresh(invitation)

    base_url = _get_base_url(db, request)
    return _invitation_to_response(invitation, base_url)


@router.get("/{family_id}/invitations", response_model=list[InvitationResponse])
def list_invitations(
    family_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)

    invitations = (
        db.query(FamilyInvitation)
        .filter(FamilyInvitation.family_id == family_id)
        .order_by(FamilyInvitation.created_at.desc())
        .all()
    )
    base_url = _get_base_url(db, request)
    return [_invitation_to_response(inv, base_url) for inv in invitations]


@router.delete("/{family_id}/invitations/{invite_id}")
def revoke_invitation(
    family_id: int,
    invite_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    invitation = (
        db.query(FamilyInvitation)
        .filter(FamilyInvitation.id == invite_id, FamilyInvitation.family_id == family_id)
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden")

    invitation.revoked = True
    _audit(db, family_id, user.id, "invite_revoked",
           details={"invite_id": invite_id, "token": invitation.token[:8] + "..."})
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------

public_router = APIRouter(tags=["invitations"])


@public_router.get("/invitations/{token}", response_model=InviteInfoResponse)
def get_invite_info(
    token: str,
    db: Session = Depends(get_db),
):
    invitation = db.query(FamilyInvitation).filter(FamilyInvitation.token == token).first()
    if not invitation:
        return InviteInfoResponse(family_name="", valid=False, role_preset="member", is_adult_preset=False)

    now = datetime.utcnow()
    valid = (
        not invitation.revoked
        and invitation.expires_at > now
        and (invitation.max_uses is None or invitation.use_count < invitation.max_uses)
    )

    family = db.query(Family).filter(Family.id == invitation.family_id).first()
    family_name = family.name if family else ""

    return InviteInfoResponse(
        family_name=family_name if valid else "",
        valid=valid,
        role_preset=invitation.role_preset,
        is_adult_preset=invitation.is_adult_preset,
    )


@public_router.post("/auth/register-with-invite")
@limiter.limit("10/minute")
def register_with_invite(
    request: Request,
    payload: RegisterWithInviteRequest,
    db: Session = Depends(get_db),
):
    # Lock the invitation row to prevent race conditions
    invitation = (
        db.query(FamilyInvitation)
        .filter(FamilyInvitation.token == payload.token)
        .with_for_update()
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=400, detail="Ungültiger Einladungslink")

    now = datetime.utcnow()
    if invitation.revoked:
        raise HTTPException(status_code=400, detail="Einladung wurde widerrufen")
    if invitation.expires_at <= now:
        raise HTTPException(status_code=400, detail="Einladung ist abgelaufen")
    if invitation.max_uses is not None and invitation.use_count >= invitation.max_uses:
        raise HTTPException(status_code=400, detail="Einladung wurde bereits vollständig genutzt")

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-Mail existiert bereits")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    db.flush()

    membership = Membership(
        user_id=user.id,
        family_id=invitation.family_id,
        role=invitation.role_preset,
        is_adult=invitation.is_adult_preset,
    )
    db.add(membership)

    invitation.use_count += 1

    _audit(db, invitation.family_id, None, "invite_used",
           target_user_id=user.id,
           details={"email": user.email, "invite_id": invitation.id})
    db.commit()

    token = create_access_token(user_id=user.id, email=user.email)
    response = JSONResponse(content={"status": "ok"})
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


# ---------------------------------------------------------------------------
# Admin settings (BASE_URL)
# ---------------------------------------------------------------------------

settings_router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


@settings_router.get("/base-url")
def get_base_url(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.query(SystemSetting).filter(SystemSetting.key == "base_url").first()
    saved = row.value if row else ""
    env_val = os.getenv("BASE_URL", "")
    effective = _get_base_url(db, request)
    return {"saved": saved, "env": env_val, "effective": effective}


@settings_router.put("/base-url")
def set_base_url(
    payload: BaseUrlUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Only allow admins of at least one family
    memberships = db.query(Membership).filter(
        Membership.user_id == user.id, Membership.role == "admin"
    ).all()
    if not memberships:
        raise HTTPException(status_code=403, detail="Admin-Berechtigung erforderlich")

    row = db.query(SystemSetting).filter(SystemSetting.key == "base_url").first()
    if row:
        row.value = payload.base_url
    else:
        db.add(SystemSetting(key="base_url", value=payload.base_url))
    db.commit()
    return {"status": "ok", "base_url": payload.base_url}
