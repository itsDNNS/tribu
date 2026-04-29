from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import cache
from app.core.clock import utcnow
from app.core.calendar_subscriptions import (
    IcsSubscriptionError,
    fetch_ics_text,
    hostname_from_url,
    validate_subscription_url,
)
from app.core.deps import current_user, current_user_via_token_param, ensure_adult, ensure_family_membership, to_utc_naive
from app.core.ics_utils import events_to_ics, ics_to_event_dicts
from app.core.recurrence import VALID_RECURRENCES, expand_event
from app.core.scopes import require_scope
from app.core.webhooks import dispatch_webhook_event
from app.database import get_db
from app.models import CalendarEvent, CalendarSubscription, CalendarSubscriptionSync, Membership, Notification, User
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE, CalendarEventCreate, CalendarEventResponse, CalendarEventUpdate, CalendarIcsImport, CalendarIcsSubscribe, CalendarSubscriptionCreate, CalendarSubscriptionResponse, PaginatedCalendarEvents
from app.core.errors import error_detail, EVENT_NOT_FOUND, END_BEFORE_START, INVALID_RECURRENCE

router = APIRouter(prefix="/calendar", tags=["calendar"], responses={**AUTH_RESPONSES})


@router.get(
    "/events",
    response_model=PaginatedCalendarEvents,
    summary="List calendar events",
    description="Return paginated calendar events for a family, with optional date range filtering and recurrence expansion. Scope: `calendar:read`.",
    response_description="Paginated list of calendar events",
)
def list_calendar_events(
    family_id: int,
    range_start: Optional[datetime] = Query(None),
    range_end: Optional[datetime] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_family_membership(db, user.id, family_id)

    if range_start and range_end:
        range_start = to_utc_naive(range_start)
        range_end = to_utc_naive(range_end)

        non_recurring = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.recurrence.is_(None),
                CalendarEvent.starts_at < range_end,
            )
            .filter(
                (CalendarEvent.ends_at >= range_start) | (CalendarEvent.ends_at.is_(None) & (CalendarEvent.starts_at >= range_start))
            )
            .all()
        )
        recurring = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.recurrence.isnot(None),
            )
            .all()
        )

        all_occurrences = []
        for ev in non_recurring:
            all_occurrences.extend(expand_event(ev, range_start, range_end))
        for ev in recurring:
            all_occurrences.extend(expand_event(ev, range_start, range_end))

        all_occurrences.sort(key=lambda o: o["starts_at"])
        total = len(all_occurrences)
        page = all_occurrences[offset:offset + limit]

        items = [CalendarEventResponse(**o) for o in page]
        return PaginatedCalendarEvents(items=items, total=total, offset=offset, limit=limit)

    base = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id)
    total = base.count()
    items = base.order_by(CalendarEvent.starts_at.asc()).offset(offset).limit(limit).all()
    return PaginatedCalendarEvents(items=items, total=total, offset=offset, limit=limit)


@router.get(
    "/events/export.ics",
    summary="Export calendar as ICS",
    description="Download all family calendar events as an ICS file. Adult only. Scope: `calendar:read`.",
    response_description="ICS file download",
)
def export_calendar_ics(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_adult(db, user.id, family_id)
    events = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).all()
    ics_text = events_to_ics(events)
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=tribu-calendar.ics"},
    )


@router.get(
    "/events/feed.ics",
    summary="Calendar subscription feed",
    description="ICS feed URL for calendar app subscriptions. Supports `?token=` query parameter for authentication. Scope: `calendar:read`.",
    response_description="ICS calendar feed",
)
def calendar_feed_ics(
    family_id: int,
    user: User = Depends(current_user_via_token_param),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_family_membership(db, user.id, family_id)
    events = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).all()
    ics_text = events_to_ics(events)
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={"Content-Disposition": "inline; filename=tribu-calendar.ics"},
    )

def _subscription_label(source_name: str | None, source_url: str) -> str:
    return (source_name or "").strip() or hostname_from_url(source_url) or source_url


def _safe_subscription_error(exc: Exception) -> str:
    if isinstance(exc, IcsSubscriptionError):
        return str(exc)
    return "Could not fetch subscription URL"


def _sync_history(subscription: CalendarSubscription, limit: int = 5) -> list[CalendarSubscriptionSync]:
    return sorted(subscription.syncs or [], key=lambda row: row.started_at, reverse=True)[:limit]


def _subscription_response(subscription: CalendarSubscription) -> CalendarSubscriptionResponse:
    return CalendarSubscriptionResponse(
        id=subscription.id,
        family_id=subscription.family_id,
        name=subscription.name,
        source_url=subscription.source_url,
        status=subscription.status,
        last_synced_at=subscription.last_synced_at,
        last_sync_status=subscription.last_sync_status,
        last_sync_error=subscription.last_sync_error,
        last_created=subscription.last_created or 0,
        last_updated=subscription.last_updated or 0,
        last_skipped=subscription.last_skipped or 0,
        created_by_user_id=subscription.created_by_user_id,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
        sync_history=_sync_history(subscription),
    )


def _refresh_calendar_subscription(
    db: Session,
    *,
    subscription: CalendarSubscription,
    user_id: int,
) -> tuple[int, int, int, list[dict]]:
    started_at = utcnow()
    created = 0
    updated = 0
    skipped = 0
    errors: list[dict] = []
    status = "success"
    error_summary = None

    try:
        ics_text = fetch_ics_text(subscription.source_url)
        valid_events, errors = ics_to_event_dicts(
            ics_text,
            subscription.family_id,
            user_id,
            source_type="subscription",
            source_name=subscription.name,
            source_url=subscription.source_url,
        )
        MAX_EVENTS = 500
        now = utcnow()
        for event_dict in valid_events[:MAX_EVENTS]:
            event_dict["subscription_id"] = subscription.id
            event_dict["source_name"] = subscription.name
            event_dict["source_url"] = subscription.source_url
            event_dict["last_synced_at"] = now
            event_dict["sync_status"] = "ok"
            ical_uid = event_dict.get("ical_uid")
            existing = None
            if ical_uid:
                existing = (
                    db.query(CalendarEvent)
                    .filter(
                        CalendarEvent.family_id == subscription.family_id,
                        CalendarEvent.ical_uid == ical_uid,
                    )
                    .first()
                )
            if existing:
                owned_by_this_feed = (
                    existing.source_type == "subscription"
                    and (existing.subscription_id == subscription.id or (existing.subscription_id is None and existing.source_url == subscription.source_url))
                )
                if not owned_by_this_feed:
                    skipped += 1
                    errors.append({
                        "index": created + updated + skipped,
                        "summary": event_dict.get("title", ""),
                        "error": "VEVENT UID already exists as a non-subscription or different-feed event; skipped to avoid overwriting it",
                    })
                    continue
                for key, value in event_dict.items():
                    if key in {"imported_at", "created_by_user_id"}:
                        continue
                    setattr(existing, key, value)
                updated += 1
            else:
                db.add(CalendarEvent(**event_dict))
                created += 1
        if len(valid_events) > MAX_EVENTS:
            skipped += len(valid_events) - MAX_EVENTS
            errors.append({"index": MAX_EVENTS, "summary": "", "error": f"Only the first {MAX_EVENTS} events were processed"})
        if errors:
            status = "partial" if created or updated else "failed"
            error_summary = errors[0].get("error")
    except Exception as exc:
        status = "failed"
        error_summary = _safe_subscription_error(exc)
        errors = [{"index": 0, "summary": "", "error": error_summary}]

    finished_at = utcnow()
    subscription.last_synced_at = finished_at
    subscription.last_sync_status = status
    subscription.last_sync_error = error_summary
    subscription.last_created = created
    subscription.last_updated = updated
    subscription.last_skipped = skipped
    subscription.updated_at = finished_at
    db.add(CalendarSubscriptionSync(
        subscription_id=subscription.id,
        family_id=subscription.family_id,
        started_at=started_at,
        finished_at=finished_at,
        status=status,
        created=created,
        updated=updated,
        skipped=skipped,
        error_count=len(errors),
        error_summary=error_summary,
    ))
    db.commit()
    db.refresh(subscription)
    if created or updated:
        cache.invalidate_pattern(f"tribu:dashboard:{subscription.family_id}:*")
    return created, updated, skipped, errors


def _classify_ics_preview(
    db: Session,
    *,
    family_id: int,
    valid_events: list[dict],
    errors: list[dict],
    source_type: str,
    normalized_url: str | None = None,
    max_events: int = 500,
    sample_limit: int = 10,
) -> dict:
    """Classify an ICS import/refresh without mutating calendar rows."""
    would_create = 0
    would_update = 0
    would_skip = 0
    preview_errors = list(errors)
    sample_events: list[dict] = []

    for event_dict in valid_events[:max_events]:
        outcome = "create"
        ical_uid = event_dict.get("ical_uid")
        existing = None
        if ical_uid:
            existing = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id == family_id,
                    CalendarEvent.ical_uid == ical_uid,
                )
                .first()
            )

        if existing:
            if source_type == "import":
                if existing.source_type != "import":
                    outcome = "skip"
                    would_skip += 1
                    preview_errors.append({
                        "index": would_create + would_update + would_skip,
                        "summary": event_dict.get("title", ""),
                        "error": "VEVENT UID already exists as a non-imported event; skipped to avoid overwriting a local or synced event",
                    })
                else:
                    outcome = "update"
                    would_update += 1
            else:
                owned_by_this_feed = (
                    existing.source_type == "subscription"
                    and existing.source_url == normalized_url
                )
                if not owned_by_this_feed:
                    outcome = "skip"
                    would_skip += 1
                    preview_errors.append({
                        "index": would_create + would_update + would_skip,
                        "summary": event_dict.get("title", ""),
                        "error": "VEVENT UID already exists as a non-subscription or different-feed event; skipped to avoid overwriting it",
                    })
                else:
                    outcome = "update"
                    would_update += 1
        else:
            would_create += 1

        if len(sample_events) < sample_limit:
            sample_events.append({
                "title": event_dict.get("title", ""),
                "starts_at": event_dict.get("starts_at"),
                "ends_at": event_dict.get("ends_at"),
                "ical_uid": ical_uid,
                "outcome": outcome,
            })

    if len(valid_events) > max_events:
        preview_errors.append({
            "index": max_events,
            "summary": "",
            "error": f"Only the first {max_events} events would be processed",
        })

    return {
        "status": "ok",
        "would_create": would_create,
        "would_update": would_update,
        "would_skip": would_skip,
        "errors": preview_errors,
        "sample_events": sample_events,
    }



@router.post(
    "/events/import-ics/preview",
    summary="Preview events from ICS",
    description="Parse ICS text and classify what would be created, updated, or skipped without mutating calendar rows. Adult only. Scope: `calendar:write`.",
    response_description="Preview result with would-create/update/skip counts and errors",
)
def preview_import_calendar_ics(
    payload: CalendarIcsImport,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    valid_events, errors = ics_to_event_dicts(
        payload.ics_text,
        payload.family_id,
        user.id,
        source_type="import",
        source_name=payload.source_name,
        source_url=payload.source_url,
    )
    return _classify_ics_preview(
        db,
        family_id=payload.family_id,
        valid_events=valid_events,
        errors=errors,
        source_type="import",
    )

@router.post(
    "/events/import-ics",
    summary="Import events from ICS",
    description="Parse ICS text and create calendar events (max 500). Adult only. Scope: `calendar:write`.",
    response_description="Import result with created count and errors",
)
def import_calendar_ics(
    payload: CalendarIcsImport,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    valid_events, errors = ics_to_event_dicts(
        payload.ics_text,
        payload.family_id,
        user.id,
        source_type="import",
        source_name=payload.source_name,
        source_url=payload.source_url,
    )

    MAX_EVENTS = 500
    created = 0
    updated = 0
    skipped = 0
    for event_dict in valid_events[:MAX_EVENTS]:
        ical_uid = event_dict.get("ical_uid")
        existing = None
        if ical_uid:
            existing = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id == payload.family_id,
                    CalendarEvent.ical_uid == ical_uid,
                )
                .first()
            )
        if existing:
            if existing.source_type != "import":
                skipped += 1
                errors.append({
                    "index": created + updated + skipped,
                    "summary": event_dict.get("title", ""),
                    "error": "VEVENT UID already exists as a non-imported event; skipped to avoid overwriting a local or synced event",
                })
                continue
            for key, value in event_dict.items():
                if key in {"imported_at", "created_by_user_id"}:
                    continue
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(CalendarEvent(**event_dict))
            created += 1

    db.commit()
    if created or updated:
        cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return {"status": "ok", "created": created, "updated": updated, "skipped": skipped, "errors": errors}



@router.post(
    "/events/subscribe-ics/preview",
    summary="Preview subscribing to an external ICS URL",
    description="Fetch an external `.ics` URL once and classify what would be created, updated, or skipped without mutating calendar rows. Adult only. Scope: `calendar:write`.",
    response_description="Preview result with would-create/update/skip counts and errors",
)
def preview_subscribe_calendar_ics(
    payload: CalendarIcsSubscribe,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)

    try:
        normalized_url = validate_subscription_url(payload.source_url)
    except IcsSubscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        ics_text = fetch_ics_text(normalized_url)
    except IcsSubscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not fetch subscription URL")

    label = (payload.source_name or "").strip() or hostname_from_url(normalized_url) or normalized_url
    valid_events, errors = ics_to_event_dicts(
        ics_text,
        payload.family_id,
        user.id,
        source_type="subscription",
        source_name=label,
        source_url=normalized_url,
    )
    return _classify_ics_preview(
        db,
        family_id=payload.family_id,
        valid_events=valid_events,
        errors=errors,
        source_type="subscription",
        normalized_url=normalized_url,
    )

@router.post(
    "/events/subscribe-ics",
    summary="Subscribe to (or refresh) an external ICS URL",
    description=(
        "Fetch an external `.ics` URL once and store its events as "
        "`source_type=\"subscription\"`. Calling the endpoint again with the "
        "same URL refreshes the same rows by VEVENT UID. This is a manual "
        "subscribe/refresh — Tribu does not poll the feed in the background. "
        "Adult only. Scope: `calendar:write`."
    ),
    response_description="Subscription result with created/updated/skipped counts and errors",
)
def subscribe_calendar_ics(
    payload: CalendarIcsSubscribe,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)

    try:
        normalized_url = validate_subscription_url(payload.source_url)
    except IcsSubscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        ics_text = fetch_ics_text(normalized_url)
    except IcsSubscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        # Belt-and-braces: never let a transport library quirk surface
        # a stack trace or internal host/port to the API caller.
        raise HTTPException(status_code=400, detail="Could not fetch subscription URL")

    label = (payload.source_name or "").strip() or hostname_from_url(normalized_url) or normalized_url

    valid_events, errors = ics_to_event_dicts(
        ics_text,
        payload.family_id,
        user.id,
        source_type="subscription",
        source_name=label,
        source_url=normalized_url,
    )

    MAX_EVENTS = 500
    created = 0
    updated = 0
    skipped = 0
    for event_dict in valid_events[:MAX_EVENTS]:
        ical_uid = event_dict.get("ical_uid")
        existing = None
        if ical_uid:
            existing = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id == payload.family_id,
                    CalendarEvent.ical_uid == ical_uid,
                )
                .first()
            )
        if existing:
            owned_by_this_feed = (
                existing.source_type == "subscription"
                and existing.source_url == normalized_url
            )
            if not owned_by_this_feed:
                skipped += 1
                errors.append({
                    "index": created + updated + skipped,
                    "summary": event_dict.get("title", ""),
                    "error": "VEVENT UID already exists as a non-subscription or different-feed event; skipped to avoid overwriting it",
                })
                continue
            for key, value in event_dict.items():
                if key in {"imported_at", "created_by_user_id"}:
                    continue
                setattr(existing, key, value)
            updated += 1
        else:
            db.add(CalendarEvent(**event_dict))
            created += 1

    db.commit()
    if created or updated:
        cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return {"status": "ok", "created": created, "updated": updated, "skipped": skipped, "errors": errors}


@router.get(
    "/subscriptions",
    response_model=list[CalendarSubscriptionResponse],
    summary="List managed calendar subscriptions",
    description="Return stored external ICS feeds and recent refresh history. Adult only. Scope: `calendar:read`.",
)
def list_calendar_subscriptions(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_adult(db, user.id, family_id)
    subscriptions = (
        db.query(CalendarSubscription)
        .filter(CalendarSubscription.family_id == family_id)
        .order_by(CalendarSubscription.created_at.desc())
        .all()
    )
    return [_subscription_response(subscription) for subscription in subscriptions]


@router.post(
    "/subscriptions",
    response_model=CalendarSubscriptionResponse,
    summary="Create or refresh a managed calendar subscription",
    description="Store an external ICS feed and refresh it immediately. Adult only. Scope: `calendar:write`.",
)
def create_calendar_subscription(
    payload: CalendarSubscriptionCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    try:
        normalized_url = validate_subscription_url(payload.source_url)
    except IcsSubscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    subscription = (
        db.query(CalendarSubscription)
        .filter(
            CalendarSubscription.family_id == payload.family_id,
            CalendarSubscription.source_url == normalized_url,
        )
        .first()
    )
    if subscription:
        subscription.name = _subscription_label(payload.source_name or subscription.name, normalized_url)
        subscription.status = "active"
        subscription.updated_at = utcnow()
    else:
        subscription = CalendarSubscription(
            family_id=payload.family_id,
            name=_subscription_label(payload.source_name, normalized_url),
            source_url=normalized_url,
            status="active",
            created_by_user_id=user.id,
        )
        db.add(subscription)
    db.flush()
    _refresh_calendar_subscription(db, subscription=subscription, user_id=user.id)
    return _subscription_response(subscription)


@router.post(
    "/subscriptions/{subscription_id}/refresh",
    response_model=CalendarSubscriptionResponse,
    summary="Refresh a managed calendar subscription",
    description="Fetch a stored external ICS feed now and update its owned events. Adult only. Scope: `calendar:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def refresh_calendar_subscription(
    subscription_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    subscription = db.query(CalendarSubscription).filter(CalendarSubscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    ensure_adult(db, user.id, subscription.family_id)
    _refresh_calendar_subscription(db, subscription=subscription, user_id=user.id)
    return _subscription_response(subscription)


@router.delete(
    "/subscriptions/{subscription_id}",
    summary="Delete a managed calendar subscription",
    description="Remove the stored feed record. Imported events remain in the calendar with their source metadata. Adult only. Scope: `calendar:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_calendar_subscription(
    subscription_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    subscription = db.query(CalendarSubscription).filter(CalendarSubscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    ensure_adult(db, user.id, subscription.family_id)
    family_id = subscription.family_id
    db.query(CalendarEvent).filter(CalendarEvent.subscription_id == subscription.id).update({CalendarEvent.subscription_id: None})
    db.delete(subscription)
    db.commit()
    return {"status": "deleted", "subscription_id": subscription_id, "family_id": family_id}


@router.post(
    "/events",
    response_model=CalendarEventResponse,
    summary="Create a calendar event",
    description="Create a new calendar event with optional recurrence. Adult only. Scope: `calendar:write`.",
    response_description="The created calendar event",
)
def create_calendar_event(
    payload: CalendarEventCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_adult(db, user.id, payload.family_id)

    starts_at = to_utc_naive(payload.starts_at)
    ends_at = to_utc_naive(payload.ends_at)
    if ends_at and ends_at < starts_at:
        raise HTTPException(status_code=400, detail=error_detail(END_BEFORE_START))

    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_RECURRENCE, recurrence=payload.recurrence))

    recurrence_end = to_utc_naive(payload.recurrence_end) if payload.recurrence_end else None

    event = CalendarEvent(
        family_id=payload.family_id,
        title=payload.title,
        description=payload.description,
        starts_at=starts_at,
        ends_at=ends_at,
        all_day=payload.all_day,
        recurrence=payload.recurrence,
        recurrence_end=recurrence_end,
        assigned_to=payload.assigned_to,
        color=payload.color,
        category=payload.category,
        created_by_user_id=user.id,
    )
    db.add(event)
    db.flush()

    _create_assignment_notifications(db, event, user.id)

    db.commit()
    db.refresh(event)
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    dispatch_webhook_event(
        db,
        family_id=event.family_id,
        event_type="calendar.event.created",
        data={"event_id": event.id, "title": event.title, "starts_at": event.starts_at.isoformat(), "all_day": event.all_day},
    )
    return event


@router.patch(
    "/events/{event_id}",
    response_model=CalendarEventResponse,
    summary="Update a calendar event",
    description="Partially update an existing calendar event. Adult only. Scope: `calendar:write`.",
    response_description="The updated calendar event",
    responses={**NOT_FOUND_RESPONSE},
)
def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail=error_detail(EVENT_NOT_FOUND))

    ensure_adult(db, user.id, event.family_id)

    if payload.title is not None:
        event.title = payload.title
    if payload.description is not None:
        event.description = payload.description
    if payload.starts_at is not None:
        event.starts_at = to_utc_naive(payload.starts_at)
    if payload.ends_at is not None:
        event.ends_at = to_utc_naive(payload.ends_at)
    if payload.all_day is not None:
        event.all_day = payload.all_day

    if payload.recurrence is not None:
        if payload.recurrence == "":
            event.recurrence = None
            event.recurrence_end = None
        elif payload.recurrence not in VALID_RECURRENCES:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_RECURRENCE, recurrence=payload.recurrence))
        else:
            event.recurrence = payload.recurrence
    if payload.recurrence_end is not None:
        event.recurrence_end = to_utc_naive(payload.recurrence_end)

    if payload.assigned_to is not None:
        old_assigned = event.assigned_to
        event.assigned_to = payload.assigned_to
        if payload.assigned_to != old_assigned:
            _create_assignment_notifications(db, event, user.id)
    if payload.color is not None:
        event.color = payload.color or None
    if payload.category is not None:
        event.category = payload.category or None

    if event.ends_at and event.ends_at < event.starts_at:
        raise HTTPException(status_code=400, detail=error_detail(END_BEFORE_START))

    db.commit()
    db.refresh(event)
    cache.invalidate_pattern(f"tribu:dashboard:{event.family_id}:*")
    return event


@router.delete(
    "/events/{event_id}",
    summary="Delete a calendar event",
    description="Delete a calendar event or exclude a single occurrence from a recurring series. Adult only. Scope: `calendar:write`.",
    response_description="Deletion or exclusion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_calendar_event(
    event_id: int,
    occurrence_date: Optional[str] = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail=error_detail(EVENT_NOT_FOUND))

    ensure_adult(db, user.id, event.family_id)

    family_id = event.family_id

    if occurrence_date and event.recurrence:
        excluded = list(event.excluded_dates or [])
        if occurrence_date not in excluded:
            excluded.append(occurrence_date)
        event.excluded_dates = excluded
        db.commit()
        cache.invalidate_pattern(f"tribu:dashboard:{family_id}:*")
        return {"status": "occurrence_excluded", "event_id": event_id, "excluded_date": occurrence_date}

    db.delete(event)
    db.commit()
    cache.invalidate_pattern(f"tribu:dashboard:{family_id}:*")
    return {"status": "deleted", "event_id": event_id}


def _create_assignment_notifications(db: Session, event: CalendarEvent, actor_user_id: int):
    """Create notifications for members assigned to an event."""
    assigned = event.assigned_to
    if not assigned:
        return

    if assigned == "all":
        member_rows = db.query(Membership).filter(Membership.family_id == event.family_id).all()
        user_ids = [m.user_id for m in member_rows]
    elif isinstance(assigned, list):
        user_ids = assigned
    else:
        return

    for uid in user_ids:
        if uid == actor_user_id:
            continue
        db.add(Notification(
            user_id=uid,
            family_id=event.family_id,
            type="event_assigned",
            title=event.title,
            body=None,
            link=f"/calendar?event={event.id}",
        ))
