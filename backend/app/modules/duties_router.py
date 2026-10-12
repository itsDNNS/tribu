"""Weekly duties: a default person per weekday and exceptions per date."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.clock import local_today, local_wall_now
from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.duties import DUE, HORIZON_DAYS, PEOPLE, TITLE, dispatch_task_events, occurrences, sync_duty_tasks
from app.core.errors import ASSIGNEE_NOT_FAMILY_MEMBER, DUTY_NOT_FOUND, INVALID_DUTY_DATE, error_detail
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Duty, DutyException, DutySlot, Membership, Task, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    DutyCreate,
    DutyExceptionInput,
    DutyOccurrenceResponse,
    DutyResponse,
    DutyUpdate,
)


router = APIRouter(prefix="/duties", tags=["duties"], responses={**AUTH_RESPONSES})

# How far from today dates may be planned or looked at.
MAX_DAYS_AWAY = 730


def _get_duty(db: Session, duty_id: int, user: User, *, write: bool) -> Duty:
    duty = db.query(Duty).filter(Duty.id == duty_id).first()
    if duty is None:
        raise HTTPException(status_code=404, detail=error_detail(DUTY_NOT_FOUND))
    (ensure_adult if write else ensure_family_membership)(db, user.id, duty.family_id)
    return duty


def _validate_assignees(db: Session, family_id: int, user_ids) -> None:
    wanted = {uid for uid in user_ids if uid is not None}
    if not wanted:
        return
    members = {
        row.user_id
        for row in db.query(Membership.user_id).filter(Membership.family_id == family_id, Membership.user_id.in_(wanted))
    }
    if wanted - members:
        raise HTTPException(status_code=400, detail=error_detail(ASSIGNEE_NOT_FAMILY_MEMBER))


def _response(duty: Duty, today: date) -> DutyResponse:
    return DutyResponse(
        id=duty.id,
        family_id=duty.family_id,
        title=duty.title,
        due_time=duty.due_time,
        slots=duty.slots,
        exceptions=[exc for exc in duty.exceptions if exc.date >= today],
    )


def _check_range(day: date) -> None:
    if abs((day - local_today()).days) > MAX_DAYS_AWAY:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_DUTY_DATE, date=day.isoformat()))


def _save_and_sync(db: Session, duty: Duty, update=frozenset()) -> DutyResponse:
    db.flush()
    db.refresh(duty)
    changed = sync_duty_tasks(db, duty, update=frozenset(update))
    db.commit()
    dispatch_task_events(db, changed)
    db.refresh(duty)
    return _response(duty, local_today())


@router.get(
    "",
    response_model=list[DutyResponse],
    summary="List weekly duties",
    description="Return a family's weekly duties with their weekly pattern and the exceptions from today on. Scope: `tasks:read`.",
    response_description="Weekly duties",
)
def list_duties(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:read"),
):
    ensure_family_membership(db, user.id, family_id)
    today = local_today()
    duties = db.query(Duty).filter(Duty.family_id == family_id).order_by(Duty.due_time.is_(None), Duty.due_time, Duty.title).all()
    return [_response(duty, today) for duty in duties]


@router.get(
    "/week",
    response_model=list[DutyOccurrenceResponse],
    summary="Duties of one week",
    description="Return every duty date in the seven days from `start`, with the person who does it and the task created for it. Scope: `tasks:read`.",
    response_description="Duty dates in date order",
)
def list_week(
    family_id: int,
    start: date = Query(..., description="First day of the seven days"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:read"),
):
    ensure_family_membership(db, user.id, family_id)
    _check_range(start)
    duties = db.query(Duty).filter(Duty.family_id == family_id).all()
    tasks = {
        (task.duty_id, task.duty_date): task
        for task in db.query(Task).filter(
            Task.family_id == family_id,
            Task.duty_id.isnot(None),
            Task.duty_date >= start,
            Task.duty_date < start + timedelta(days=7),
        )
    }
    result = []
    for duty in duties:
        created = local_wall_now(duty.created_at).date()
        for occ in occurrences(duty, start, 7):
            if occ.date < created:
                continue
            task = tasks.get((duty.id, occ.date))
            result.append(DutyOccurrenceResponse(
                duty_id=duty.id,
                title=duty.title,
                date=occ.date,
                due_time=duty.due_time,
                # Once a task exists it says who does (or did) it.
                assigned_to_user_id=task.assigned_to_user_id if task else occ.assignee_id,
                default_assigned_to_user_id=occ.default_assignee_id,
                skipped=occ.skipped,
                is_exception=occ.is_exception,
                task_id=task.id if task else None,
                task_status=task.status if task else None,
            ))
    result.sort(key=lambda occ: (occ.date, occ.due_time is None, occ.due_time or "", occ.title))
    return result


@router.post(
    "",
    response_model=DutyResponse,
    summary="Create a weekly duty",
    description=f"Create a weekly duty and its tasks for the next {HORIZON_DAYS} days. Adult only. Scope: `tasks:write`.",
    response_description="The created duty",
)
def create_duty(
    payload: DutyCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    _validate_assignees(db, payload.family_id, [slot.assigned_to_user_id for slot in payload.slots])
    duty = Duty(
        family_id=payload.family_id,
        title=payload.title.strip(),
        due_time=payload.due_time,
        created_by_user_id=user.id,
        slots=[DutySlot(weekday=slot.weekday, assigned_to_user_id=slot.assigned_to_user_id) for slot in payload.slots],
    )
    db.add(duty)
    return _save_and_sync(db, duty)


@router.patch(
    "/{duty_id}",
    response_model=DutyResponse,
    summary="Update a weekly duty",
    description="Change a duty's title, time or weekly pattern. Open tasks of the coming days follow; exceptions stay. Adult only. Scope: `tasks:write`.",
    response_description="The updated duty",
    responses={**NOT_FOUND_RESPONSE},
)
def update_duty(
    duty_id: int,
    payload: DutyUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    duty = _get_duty(db, duty_id, user, write=True)
    changes = payload.model_dump(exclude_unset=True)
    update = set()
    if changes.get("title") is not None and changes["title"].strip() != duty.title:
        duty.title = changes["title"].strip()
        update.add(TITLE)
    if "due_time" in changes and changes["due_time"] != duty.due_time:
        duty.due_time = changes["due_time"]
        update.add(DUE)
    if payload.slots is not None:
        update.add(PEOPLE)
        _validate_assignees(db, duty.family_id, [slot.assigned_to_user_id for slot in payload.slots])
        # Update rows in place: replacing them would insert before deleting
        # and trip the unique weekday per duty.
        existing = {slot.weekday: slot for slot in duty.slots}
        wanted = {slot.weekday: slot.assigned_to_user_id for slot in payload.slots}
        for weekday, slot in existing.items():
            if weekday in wanted:
                slot.assigned_to_user_id = wanted[weekday]
            else:
                duty.slots.remove(slot)
        for weekday, assignee in wanted.items():
            if weekday not in existing:
                duty.slots.append(DutySlot(weekday=weekday, assigned_to_user_id=assignee))
    return _save_and_sync(db, duty, update)


@router.delete(
    "/{duty_id}",
    summary="Delete a weekly duty",
    description="Delete a duty and its open tasks from today on. Done tasks stay. Adult only. Scope: `tasks:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_duty(
    duty_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    duty = _get_duty(db, duty_id, user, write=True)
    db.query(Task).filter(
        Task.duty_id == duty.id, Task.status == "open", Task.duty_date >= local_today(),
    ).delete(synchronize_session=False)
    db.delete(duty)
    db.commit()
    return {"status": "deleted", "duty_id": duty_id}


def _check_date(duty: Duty, day: date) -> None:
    _check_range(day)
    if day < local_today() or day.weekday() not in {slot.weekday for slot in duty.slots}:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_DUTY_DATE, date=day.isoformat()))


@router.put(
    "/{duty_id}/exceptions/{day}",
    response_model=DutyResponse,
    summary="Change one date of a duty",
    description="Give one date of a duty to someone else, or skip it, without changing the weekly pattern. Adult only. Scope: `tasks:write`.",
    response_description="The duty with its exceptions",
    responses={**NOT_FOUND_RESPONSE},
)
def put_exception(
    duty_id: int,
    day: date,
    payload: DutyExceptionInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    duty = _get_duty(db, duty_id, user, write=True)
    _check_date(duty, day)
    _validate_assignees(db, duty.family_id, [payload.assigned_to_user_id])
    exc = next((exc for exc in duty.exceptions if exc.date == day), None)
    default = next(slot.assigned_to_user_id for slot in duty.slots if slot.weekday == day.weekday())
    if not payload.skipped and payload.assigned_to_user_id == default:
        # The default person on that date is no exception.
        if exc is not None:
            duty.exceptions.remove(exc)
    else:
        if exc is None:
            exc = DutyException(date=day)
            duty.exceptions.append(exc)
        exc.skipped = payload.skipped
        exc.assigned_to_user_id = None if payload.skipped else payload.assigned_to_user_id
    return _save_and_sync(db, duty, {PEOPLE})


@router.delete(
    "/{duty_id}/exceptions/{day}",
    response_model=DutyResponse,
    summary="Undo a change to one date",
    description="Give a date back to the weekly pattern. Adult only. Scope: `tasks:write`.",
    response_description="The duty with its exceptions",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_exception(
    duty_id: int,
    day: date,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    duty = _get_duty(db, duty_id, user, write=True)
    duty.exceptions = [exc for exc in duty.exceptions if exc.date != day]
    return _save_and_sync(db, duty, {PEOPLE})
