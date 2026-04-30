"""Display-device endpoints (issue #172).

Two surfaces in one router:

1. Admin-facing CRUD under ``/families/{family_id}/display-devices``
   — gated by ``ensure_family_admin`` and ``current_user``. Creating a
   device returns the plaintext token exactly once; listing never
   exposes it again.

2. Display-runtime endpoints under ``/display/me`` and
   ``/display/dashboard`` — gated by ``current_display_device``, which
   only accepts ``tribu_display_...`` bearer tokens. The token is
   bound to a single family at creation time, so the display does not
   pass ``family_id`` on these calls and cannot widen its view.

The display dashboard is a *curated* projection of the family
state. It deliberately excludes member emails, admin metadata, and
audit fragments so a token leak from a wall tablet does not leak
account identifiers.
"""

from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.core.clock import utcnow
from app.core.deps import current_display_device, current_user, ensure_family_admin, next_birthday_date
from app.core.errors import DISPLAY_DEVICE_NOT_FOUND, error_detail
from app.core.recurrence import expand_event
from app.core.scopes import require_scope
from app.core.display_layouts import normalize_config
from app.database import get_db
from app.models import CalendarEvent, DisplayDevice, Family, FamilyBirthday, Membership, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    DisplayDashboardBirthday,
    DisplayDashboardEvent,
    DisplayDashboardMember,
    DisplayDashboardResponse,
    DisplayDeviceCreate,
    DisplayDeviceCreatedResponse,
    DisplayDeviceResponse,
    DisplayDeviceUpdate,
    DisplayDeviceConfig,
    DisplayMeResponse,
)
from app.security import generate_display_token


admin_router = APIRouter(prefix="/families", tags=["display"], responses={**AUTH_RESPONSES})
display_router = APIRouter(prefix="/display", tags=["display"], responses={**AUTH_RESPONSES})


def _device_config(device: DisplayDevice) -> DisplayDeviceConfig:
    config = normalize_config(
        mode=device.display_mode,
        refresh_interval_seconds=device.refresh_interval_seconds,
        layout_preset=device.layout_preset,
        layout_config=device.layout_config,
    )
    return DisplayDeviceConfig(**config)


# ---------------------------------------------------------------------------
# Admin CRUD (user-authenticated, family-admin gated)
# ---------------------------------------------------------------------------


@admin_router.get(
    "/{family_id}/display-devices",
    response_model=List[DisplayDeviceResponse],
    summary="List display devices for a family",
    description=(
        "Return all display devices bound to this family, including revoked ones. "
        "Admin role required. Plaintext tokens are NEVER included — they are only "
        "returned once at creation. Scope: `families:read`."
    ),
    response_description="List of display device metadata (no plaintext tokens)",
)
def list_display_devices(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)
    return (
        db.query(DisplayDevice)
        .filter(DisplayDevice.family_id == family_id)
        .order_by(DisplayDevice.created_at.desc())
        .all()
    )


@admin_router.post(
    "/{family_id}/display-devices",
    response_model=DisplayDeviceCreatedResponse,
    summary="Create a display device",
    description=(
        "Mint a new display device for this family. The plaintext bearer token "
        "is returned exactly once — pair it with the device immediately. Admin "
        "role required. Scope: `families:write`."
    ),
    response_description="Token value (shown once) and device metadata",
)
def create_display_device(
    family_id: int,
    payload: DisplayDeviceCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    plain, token_hash, lookup_key = generate_display_token()
    config = normalize_config(
        mode=payload.display_mode,
        refresh_interval_seconds=payload.refresh_interval_seconds,
        layout_preset=payload.layout_preset,
        layout_config=payload.layout_config,
    )
    device = DisplayDevice(
        family_id=family_id,
        name=payload.name,
        token_hash=token_hash,
        token_lookup=lookup_key,
        created_by_user_id=user.id,
        display_mode=config["display_mode"],
        refresh_interval_seconds=config["refresh_interval_seconds"],
        layout_preset=config["layout_preset"],
        layout_config=config["layout_config"],
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    return DisplayDeviceCreatedResponse(
        token=plain,
        device=DisplayDeviceResponse.model_validate(device),
    )


@admin_router.patch(
    "/{family_id}/display-devices/{device_id}",
    response_model=DisplayDeviceResponse,
    summary="Update a display device",
    response_description="Updated display device metadata (no plaintext token)",
    responses={**NOT_FOUND_RESPONSE},
)
def update_display_device(
    family_id: int,
    device_id: int,
    payload: DisplayDeviceUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    device = (
        db.query(DisplayDevice)
        .filter(DisplayDevice.id == device_id, DisplayDevice.family_id == family_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))
    if device.revoked_at is not None:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        device.name = data["name"]
    if {"display_mode", "refresh_interval_seconds", "layout_preset", "layout_config"} & data.keys():
        config = normalize_config(
            mode=data.get("display_mode", device.display_mode),
            refresh_interval_seconds=data.get("refresh_interval_seconds", device.refresh_interval_seconds),
            layout_preset=data.get("layout_preset", device.layout_preset),
            layout_config=data.get(
                "layout_config",
                None if {"display_mode", "layout_preset"} & data.keys() else device.layout_config,
            ),
        )
        device.display_mode = config["display_mode"]
        device.refresh_interval_seconds = config["refresh_interval_seconds"]
        device.layout_preset = config["layout_preset"]
        device.layout_config = config["layout_config"]
    db.commit()
    db.refresh(device)
    return DisplayDeviceResponse.model_validate(device)


@admin_router.delete(
    "/{family_id}/display-devices/{device_id}",
    summary="Revoke a display device",
    description=(
        "Soft-revoke the display device by stamping ``revoked_at``. The token "
        "stops authenticating immediately but the row is preserved for audit. "
        "Admin role required. Scope: `families:write`."
    ),
    response_description="Revocation confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def revoke_display_device(
    family_id: int,
    device_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    device = (
        db.query(DisplayDevice)
        .filter(
            DisplayDevice.id == device_id,
            DisplayDevice.family_id == family_id,
        )
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))
    if device.revoked_at is None:
        device.revoked_at = utcnow()
        db.commit()
    return {"status": "revoked", "device_id": device_id}


# ---------------------------------------------------------------------------
# Display runtime (display-token authenticated, family bound by the token)
# ---------------------------------------------------------------------------


@display_router.get(
    "/me",
    response_model=DisplayMeResponse,
    summary="Get current display device identity",
    description=(
        "Return the identity of the display device backing this token. Bound "
        "to a single family at creation time; no user/email data is returned."
    ),
    response_description="Display device identity",
)
def display_me(
    device: DisplayDevice = Depends(current_display_device),
    db: Session = Depends(get_db),
):
    family = db.query(Family).filter(Family.id == device.family_id).first()
    family_name = family.name if family else ""
    return DisplayMeResponse(
        device_id=device.id,
        family_id=device.family_id,
        family_name=family_name,
        name=device.name,
        config=_device_config(device),
    )


@display_router.get(
    "/dashboard",
    response_model=DisplayDashboardResponse,
    summary="Get the shared-home display dashboard",
    description=(
        "Return a curated, read-only dashboard for the family this display "
        "is bound to: members (no emails), upcoming events (14 days), and "
        "upcoming birthdays (28 days). The display token determines the "
        "family — there is no ``family_id`` query parameter."
    ),
    response_description="Display dashboard payload",
)
def display_dashboard(
    device: DisplayDevice = Depends(current_display_device),
    db: Session = Depends(get_db),
):
    family = db.query(Family).filter(Family.id == device.family_id).first()
    family_name = family.name if family else ""

    memberships = (
        db.query(Membership)
        .options(joinedload(Membership.user))
        .filter(Membership.family_id == device.family_id)
        .all()
    )
    members = [
        DisplayDashboardMember(
            display_name=m.user.display_name,
            color=m.color,
        )
        for m in memberships
        if m.user
    ]

    now = utcnow()
    range_end = now + timedelta(days=14)

    non_recurring = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.family_id == device.family_id,
            CalendarEvent.recurrence.is_(None),
            CalendarEvent.starts_at >= now,
            CalendarEvent.starts_at < range_end,
        )
        .all()
    )
    recurring = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.family_id == device.family_id,
            CalendarEvent.recurrence.isnot(None),
        )
        .all()
    )
    occurrences = []
    for ev in non_recurring:
        occurrences.extend(expand_event(ev, now, range_end))
    for ev in recurring:
        occurrences.extend(expand_event(ev, now, range_end))
    occurrences.sort(key=lambda o: o["starts_at"])
    next_events = [
        DisplayDashboardEvent(
            title=o["title"],
            starts_at=o["starts_at"],
            ends_at=o.get("ends_at"),
            all_day=bool(o.get("all_day", False)),
            occurrence_date=o.get("occurrence_date"),
            color=o.get("color"),
            category=o.get("category"),
            icon=o.get("icon"),
        )
        for o in occurrences[:8]
    ]

    today = date.today()
    birthdays = (
        db.query(FamilyBirthday)
        .filter(FamilyBirthday.family_id == device.family_id)
        .all()
    )
    upcoming_birthdays: list[DisplayDashboardBirthday] = []
    for b in birthdays:
        occurs_on = next_birthday_date(b.month, b.day, today)
        days_until = (occurs_on - today).days
        if days_until <= 28:
            upcoming_birthdays.append(DisplayDashboardBirthday(
                person_name=b.person_name,
                occurs_on=occurs_on.isoformat(),
                days_until=days_until,
            ))
    upcoming_birthdays.sort(key=lambda x: x.days_until)

    return DisplayDashboardResponse(
        family_id=device.family_id,
        family_name=family_name,
        device_name=device.name,
        members=members,
        next_events=next_events,
        upcoming_birthdays=upcoming_birthdays,
        config=_device_config(device),
    )
