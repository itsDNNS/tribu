from datetime import datetime, timedelta

from app.core.utils import utcnow
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult, ensure_family_membership, to_utc_naive
from app.core.activity import record_activity
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Membership, RewardCurrency, Task, TokenTransaction, User
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE, PaginatedTasks, TaskCreate, TaskResponse, TaskUpdate
from app.core.errors import error_detail, TASK_NOT_FOUND, INVALID_STATUS, INVALID_PRIORITY, INVALID_RECURRENCE, ASSIGNEE_NOT_FAMILY_MEMBER, ADULT_REQUIRED

router = APIRouter(prefix="/tasks", tags=["tasks"], responses={**AUTH_RESPONSES})

VALID_PRIORITIES = {"low", "normal", "high"}
VALID_STATUSES = {"open", "done"}
VALID_RECURRENCES = {"daily", "weekly", "monthly", "yearly"}


def _compute_next_due(current_due: Optional[datetime], recurrence: str) -> datetime:
    base = current_due if current_due else utcnow()
    if recurrence == "daily":
        return base + timedelta(days=1)
    if recurrence == "weekly":
        return base + timedelta(weeks=1)
    if recurrence == "monthly":
        return base + relativedelta(months=1)
    if recurrence == "yearly":
        return base + relativedelta(years=1)
    return base


@router.get(
    "",
    response_model=PaginatedTasks,
    summary="List tasks",
    description="Return paginated tasks for a family. Children only see tasks assigned to them. Scope: `tasks:read`.",
    response_description="Paginated list of tasks",
)
def list_tasks(
    family_id: int,
    status: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:read"),
):
    membership = ensure_family_membership(db, user.id, family_id)
    base = db.query(Task).filter(Task.family_id == family_id)
    if not membership.is_adult:
        base = base.filter(Task.assigned_to_user_id == user.id)
    if status is not None:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_STATUS, status=status))
        base = base.filter(Task.status == status)
    total = base.count()
    items = base.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    return PaginatedTasks(items=items, total=total, offset=offset, limit=limit)


@router.post(
    "",
    response_model=TaskResponse,
    summary="Create a task",
    description="Create a new task with optional recurrence and assignment. Adult only. Scope: `tasks:write`.",
    response_description="The created task",
)
def create_task(
    payload: TaskCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    ensure_adult(db, user.id, payload.family_id)

    if payload.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_PRIORITY, priority=payload.priority))
    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_RECURRENCE, recurrence=payload.recurrence))
    if payload.assigned_to_user_id is not None:
        member = db.query(Membership).filter(
            Membership.user_id == payload.assigned_to_user_id,
            Membership.family_id == payload.family_id,
        ).first()
        if not member:
            raise HTTPException(status_code=400, detail=error_detail(ASSIGNEE_NOT_FAMILY_MEMBER))

    task = Task(
        family_id=payload.family_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=to_utc_naive(payload.due_date),
        recurrence=payload.recurrence,
        assigned_to_user_id=payload.assigned_to_user_id,
        created_by_user_id=user.id,
        token_reward_amount=payload.token_reward_amount,
        token_require_confirmation=payload.token_require_confirmation,
    )
    db.add(task)
    db.flush()
    record_activity(
        db,
        family_id=task.family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="created",
        object_type="task",
        object_id=task.id,
        object_label=task.title,
        verb="created",
        object_kind="task",
    )
    db.commit()
    db.refresh(task)
    return task


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update a task",
    description="Partially update a task. Children can only toggle status on tasks assigned to them. Completing a recurring task auto-creates the next occurrence. Scope: `tasks:write`.",
    response_description="The updated task",
    responses={**NOT_FOUND_RESPONSE},
)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=error_detail(TASK_NOT_FOUND))

    membership = ensure_family_membership(db, user.id, task.family_id)
    if not membership.is_adult:
        if task.assigned_to_user_id != user.id:
            raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
        fields = payload.model_dump(exclude_unset=True)
        if set(fields.keys()) - {"status"}:
            raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))

    if payload.priority is not None:
        if payload.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_PRIORITY, priority=payload.priority))
        task.priority = payload.priority
    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_STATUS, status=payload.status))
    if payload.recurrence is not None and payload.recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_RECURRENCE, recurrence=payload.recurrence))
    if payload.assigned_to_user_id is not None:
        member = db.query(Membership).filter(
            Membership.user_id == payload.assigned_to_user_id,
            Membership.family_id == task.family_id,
        ).first()
        if not member:
            raise HTTPException(status_code=400, detail=error_detail(ASSIGNEE_NOT_FAMILY_MEMBER))

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
    if payload.token_reward_amount is not None:
        task.token_reward_amount = payload.token_reward_amount or None
    if payload.token_require_confirmation is not None:
        task.token_require_confirmation = payload.token_require_confirmation

    next_task = None
    was_done = task.status == "done"
    if payload.status is not None:
        task.status = payload.status
        if payload.status == "done":
            task.completed_at = utcnow()
            if task.token_reward_amount and task.assigned_to_user_id:
                currency = db.query(RewardCurrency).filter(RewardCurrency.family_id == task.family_id).first()
                if currency:
                    auto_confirm = not task.token_require_confirmation
                    txn = TokenTransaction(
                        family_id=task.family_id, currency_id=currency.id,
                        user_id=task.assigned_to_user_id, kind="earn",
                        amount=task.token_reward_amount,
                        status="confirmed" if auto_confirm else "pending",
                        source_task_id=task.id,
                        confirmed_by_user_id=user.id if auto_confirm else None,
                        confirmed_at=utcnow() if auto_confirm else None,
                    )
                    db.add(txn)
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
                    token_reward_amount=task.token_reward_amount,
                    token_require_confirmation=task.token_require_confirmation,
                )
                db.add(next_task)
        if payload.status == "done" and not was_done:
            record_activity(
                db,
                family_id=task.family_id,
                actor_user_id=user.id,
                actor_display_name=user.display_name,
                action="completed",
                object_type="task",
                object_id=task.id,
                object_label=task.title,
                verb="completed",
                object_kind="task",
            )

    db.commit()
    db.refresh(task)
    if next_task:
        db.refresh(next_task)
    return task


@router.delete(
    "/{task_id}",
    summary="Delete a task",
    description="Permanently delete a task. Adult only. Scope: `tasks:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_task(
    task_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("tasks:write"),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=error_detail(TASK_NOT_FOUND))

    ensure_adult(db, user.id, task.family_id)
    db.delete(task)
    db.commit()
    return {"status": "deleted", "task_id": task_id}
