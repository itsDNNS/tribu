from datetime import datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership, to_utc_naive
from app.database import get_db
from app.models import Membership, Task, User
from app.schemas import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])

VALID_PRIORITIES = {"low", "normal", "high"}
VALID_STATUSES = {"open", "done"}
VALID_RECURRENCES = {"daily", "weekly", "monthly", "yearly"}


def _compute_next_due(current_due: Optional[datetime], recurrence: str) -> datetime:
    base = current_due if current_due else datetime.utcnow()
    if recurrence == "daily":
        return base + timedelta(days=1)
    if recurrence == "weekly":
        return base + timedelta(weeks=1)
    if recurrence == "monthly":
        return base + relativedelta(months=1)
    if recurrence == "yearly":
        return base + relativedelta(years=1)
    return base


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    family_id: int,
    status: Optional[str] = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, family_id)
    query = db.query(Task).filter(Task.family_id == family_id)
    if status is not None:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Ungültiger Status: {status}")
        query = query.filter(Task.status == status)
    return query.order_by(Task.created_at.desc()).all()


@router.post("", response_model=TaskResponse)
def create_task(
    payload: TaskCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, payload.family_id)

    if payload.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Ungültige Priorität: {payload.priority}")
    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=f"Ungültige Wiederholung: {payload.recurrence}")
    if payload.assigned_to_user_id is not None:
        member = db.query(Membership).filter(
            Membership.user_id == payload.assigned_to_user_id,
            Membership.family_id == payload.family_id,
        ).first()
        if not member:
            raise HTTPException(status_code=400, detail="Zugewiesener Benutzer ist kein Familienmitglied")

    task = Task(
        family_id=payload.family_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=to_utc_naive(payload.due_date),
        recurrence=payload.recurrence,
        assigned_to_user_id=payload.assigned_to_user_id,
        created_by_user_id=user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")

    ensure_family_membership(db, user.id, task.family_id)

    if payload.priority is not None:
        if payload.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Ungültige Priorität: {payload.priority}")
        task.priority = payload.priority
    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Ungültiger Status: {payload.status}")
    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=f"Ungültige Wiederholung: {payload.recurrence}")
    if payload.assigned_to_user_id is not None:
        member = db.query(Membership).filter(
            Membership.user_id == payload.assigned_to_user_id,
            Membership.family_id == task.family_id,
        ).first()
        if not member:
            raise HTTPException(status_code=400, detail="Zugewiesener Benutzer ist kein Familienmitglied")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.due_date is not None:
        task.due_date = to_utc_naive(payload.due_date)
    if payload.recurrence is not None:
        task.recurrence = payload.recurrence
    if payload.assigned_to_user_id is not None:
        task.assigned_to_user_id = payload.assigned_to_user_id

    # Recurring logic: when completing a recurring task, create next instance
    next_task = None
    if payload.status is not None:
        task.status = payload.status
        if payload.status == "done":
            task.completed_at = datetime.utcnow()
            if task.recurrence:
                next_task = Task(
                    family_id=task.family_id,
                    title=task.title,
                    description=task.description,
                    priority=task.priority,
                    due_date=_compute_next_due(task.due_date, task.recurrence),
                    recurrence=task.recurrence,
                    assigned_to_user_id=task.assigned_to_user_id,
                    created_by_user_id=task.created_by_user_id,
                )
                db.add(next_task)

    db.commit()
    db.refresh(task)
    if next_task:
        db.refresh(next_task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Aufgabe nicht gefunden")

    ensure_family_membership(db, user.id, task.family_id)
    db.delete(task)
    db.commit()
    return {"status": "deleted", "task_id": task_id}
