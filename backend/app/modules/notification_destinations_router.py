from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_admin
from app.core.notification_destinations import (
    destination_response,
    provider_status,
    redact_target_url,
    send_test_notification,
)
from app.core.scopes import require_scope
from app.core.utils import audit_log, ensure_any_admin
from app.database import get_db
from app.models import NotificationDestination, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    NotificationDestinationCreate,
    NotificationDestinationProviderStatusResponse,
    NotificationDestinationResponse,
    NotificationDestinationTestResponse,
    NotificationDestinationUpdate,
)

router = APIRouter(prefix="/notification-destinations", tags=["notification-destinations"], responses={**AUTH_RESPONSES})


def _get_destination_or_404(db: Session, destination_id: int) -> NotificationDestination:
    destination = db.query(NotificationDestination).filter(NotificationDestination.id == destination_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Notification destination not found")
    return destination


def _audit_details(destination: NotificationDestination, action: str) -> dict:
    return {
        "destination_id": destination.id,
        "action": action,
        "provider": destination.provider,
        "url_redacted": redact_target_url(destination.target_url_secret),
        "events": destination.events or [],
        "active": destination.active,
    }


@router.get(
    "",
    response_model=list[NotificationDestinationResponse],
    summary="List notification destinations",
    description="Return Apprise-backed household notification destinations for a family. Admin only. Scope: `admin:read`.",
)
def list_destinations(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
):
    ensure_family_admin(db, user.id, family_id)
    rows = (
        db.query(NotificationDestination)
        .filter(NotificationDestination.family_id == family_id)
        .order_by(NotificationDestination.created_at.desc(), NotificationDestination.id.desc())
        .all()
    )
    return [destination_response(row) for row in rows]


@router.get(
    "/provider/status",
    response_model=NotificationDestinationProviderStatusResponse,
    summary="Get notification destination provider status",
    description="Return redacted Apprise availability and allowlist metadata. Admin only. Scope: `admin:read`.",
)
def get_provider_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
):
    ensure_any_admin(db, user.id)
    return provider_status()


@router.post(
    "",
    response_model=NotificationDestinationResponse,
    summary="Create notification destination",
    description="Create an Apprise-backed household notification destination. Admin only. Scope: `admin:write`.",
)
def create_destination(
    payload: NotificationDestinationCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    ensure_family_admin(db, user.id, payload.family_id)
    destination = NotificationDestination(
        family_id=payload.family_id,
        name=payload.name.strip(),
        provider="apprise",
        target_url_secret=payload.target_url_secret,
        events=payload.events,
        active=payload.active,
        respect_quiet_hours=payload.respect_quiet_hours,
        created_by_user_id=user.id,
    )
    db.add(destination)
    db.flush()
    audit_log(db, payload.family_id, user.id, "notification_destination_created", details=_audit_details(destination, "created"))
    db.commit()
    db.refresh(destination)
    return destination_response(destination)


@router.patch(
    "/{destination_id}",
    response_model=NotificationDestinationResponse,
    summary="Update notification destination",
    description="Update an Apprise-backed household notification destination. Admin only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def update_destination(
    destination_id: int,
    payload: NotificationDestinationUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    destination = _get_destination_or_404(db, destination_id)
    ensure_family_admin(db, user.id, destination.family_id)
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and payload.name is not None:
        destination.name = payload.name.strip()
    if "target_url_secret" in updates and payload.target_url_secret:
        destination.target_url_secret = payload.target_url_secret
    if "events" in updates and payload.events is not None:
        destination.events = payload.events
    if "active" in updates and payload.active is not None:
        destination.active = payload.active
    if "respect_quiet_hours" in updates and payload.respect_quiet_hours is not None:
        destination.respect_quiet_hours = payload.respect_quiet_hours
    action = "enabled" if "active" in updates and destination.active else "updated"
    if "active" in updates and not destination.active:
        action = "disabled"
    audit_log(db, destination.family_id, user.id, f"notification_destination_{action}", details=_audit_details(destination, action))
    db.commit()
    db.refresh(destination)
    return destination_response(destination)


@router.delete(
    "/{destination_id}",
    summary="Delete notification destination",
    description="Delete an Apprise-backed household notification destination. Admin only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_destination(
    destination_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    destination = _get_destination_or_404(db, destination_id)
    ensure_family_admin(db, user.id, destination.family_id)
    family_id = destination.family_id
    details = _audit_details(destination, "deleted")
    db.delete(destination)
    audit_log(db, family_id, user.id, "notification_destination_deleted", details=details)
    db.commit()
    return {"status": "deleted", "destination_id": destination_id}


@router.post(
    "/{destination_id}/test",
    response_model=NotificationDestinationTestResponse,
    summary="Send test notification destination message",
    description="Send a short test message to one Apprise-backed destination. Admin only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def test_destination(
    destination_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    destination = _get_destination_or_404(db, destination_id)
    ensure_family_admin(db, user.id, destination.family_id)
    audit_log(db, destination.family_id, user.id, "notification_destination_tested", details=_audit_details(destination, "tested"))
    db.commit()
    delivery = send_test_notification(destination.id)
    if delivery is None:
        raise HTTPException(status_code=404, detail="Notification destination not found")
    return {"status": delivery.status, "error": delivery.last_error}
