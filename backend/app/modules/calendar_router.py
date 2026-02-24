from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership, to_utc_naive
from app.core.ics_utils import events_to_ics, ics_to_event_dicts
from app.core.recurrence import VALID_RECURRENCES, expand_event
from app.core.scopes import require_scope
from app.database import get_db
from app.models import CalendarEvent, User
from app.schemas import CalendarEventCreate, CalendarEventResponse, CalendarEventUpdate, CalendarIcsImport, PaginatedCalendarEvents

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events", response_model=PaginatedCalendarEvents)
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

        # Fetch: non-recurring in range + all recurring events
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

    # Fallback: no range — original behavior
    base = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id)
    total = base.count()
    items = base.order_by(CalendarEvent.starts_at.asc()).offset(offset).limit(limit).all()
    return PaginatedCalendarEvents(items=items, total=total, offset=offset, limit=limit)


@router.get("/events/export.ics")
def export_calendar_ics(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_family_membership(db, user.id, family_id)
    events = db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).all()
    ics_text = events_to_ics(events)
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=tribu-calendar.ics"},
    )


@router.post("/events/import-ics")
def import_calendar_ics(
    payload: CalendarIcsImport,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    valid_events, errors = ics_to_event_dicts(payload.ics_text, payload.family_id, user.id)

    MAX_EVENTS = 500
    created = 0
    for event_dict in valid_events[:MAX_EVENTS]:
        db.add(CalendarEvent(**event_dict))
        created += 1

    db.commit()
    return {"status": "ok", "created": created, "errors": errors}


@router.post("/events", response_model=CalendarEventResponse)
def create_calendar_event(
    payload: CalendarEventCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)

    starts_at = to_utc_naive(payload.starts_at)
    ends_at = to_utc_naive(payload.ends_at)
    if ends_at and ends_at < starts_at:
        raise HTTPException(status_code=400, detail="Ende muss nach dem Start liegen")

    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=f"Ungueltige Wiederholung: {payload.recurrence}")

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
        created_by_user_id=user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/events/{event_id}", response_model=CalendarEventResponse)
def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")

    ensure_family_membership(db, user.id, event.family_id)

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
            raise HTTPException(status_code=400, detail=f"Ungueltige Wiederholung: {payload.recurrence}")
        else:
            event.recurrence = payload.recurrence
    if payload.recurrence_end is not None:
        event.recurrence_end = to_utc_naive(payload.recurrence_end)

    if event.ends_at and event.ends_at < event.starts_at:
        raise HTTPException(status_code=400, detail="Ende muss nach dem Start liegen")

    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}")
def delete_calendar_event(
    event_id: int,
    occurrence_date: Optional[str] = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:write"),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")

    ensure_family_membership(db, user.id, event.family_id)

    if occurrence_date and event.recurrence:
        # Add date to exclusion list instead of deleting
        excluded = list(event.excluded_dates or [])
        if occurrence_date not in excluded:
            excluded.append(occurrence_date)
        event.excluded_dates = excluded
        db.commit()
        return {"status": "occurrence_excluded", "event_id": event_id, "excluded_date": occurrence_date}

    db.delete(event)
    db.commit()
    return {"status": "deleted", "event_id": event_id}
