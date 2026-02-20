from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership, to_utc_naive
from app.database import get_db
from app.models import CalendarEvent, User
from app.schemas import CalendarEventCreate, CalendarEventResponse, CalendarEventUpdate

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events", response_model=list[CalendarEventResponse])
def list_calendar_events(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, family_id)
    return db.query(CalendarEvent).filter(CalendarEvent.family_id == family_id).order_by(CalendarEvent.starts_at.asc()).all()


@router.post("/events", response_model=CalendarEventResponse)
def create_calendar_event(
    payload: CalendarEventCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, payload.family_id)

    starts_at = to_utc_naive(payload.starts_at)
    ends_at = to_utc_naive(payload.ends_at)
    if ends_at and ends_at < starts_at:
        raise HTTPException(status_code=400, detail="Ende muss nach dem Start liegen")

    event = CalendarEvent(
        family_id=payload.family_id,
        title=payload.title,
        description=payload.description,
        starts_at=starts_at,
        ends_at=ends_at,
        all_day=payload.all_day,
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

    if event.ends_at and event.ends_at < event.starts_at:
        raise HTTPException(status_code=400, detail="Ende muss nach dem Start liegen")

    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}")
def delete_calendar_event(
    event_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")

    ensure_family_membership(db, user.id, event.family_id)
    db.delete(event)
    db.commit()
    return {"status": "deleted", "event_id": event_id}
