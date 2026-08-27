"""REST adapter for the shared Task domain service."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.errors import (
    ADULT_REQUIRED,
    ASSIGNEE_NOT_FAMILY_MEMBER,
    INVALID_PRIORITY,
    INVALID_RECURRENCE,
    INVALID_STATUS,
    NO_FAMILY_ACCESS,
    TASK_NOT_FOUND,
    error_detail,
)
from app.core.scopes import require_scope
from app.core.task_service import (
    VALID_STATUSES,
    TaskDomainError,
    create_task as create_task_domain,
    delete_task as delete_task_domain,
    update_task as update_task_domain,
)
from app.database import get_db
from app.models import Task, User
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE, PaginatedTasks, TaskCreate, TaskResponse, TaskUpdate


router = APIRouter(prefix="/tasks", tags=["tasks"], responses={**AUTH_RESPONSES})

_ERROR_CODES = {
    "task_not_found": TASK_NOT_FOUND,
    "no_family_access": NO_FAMILY_ACCESS,
    "adult_required": ADULT_REQUIRED,
    "invalid_priority": INVALID_PRIORITY,
    "invalid_status": INVALID_STATUS,
    "invalid_recurrence": INVALID_RECURRENCE,
    "assignee_not_family_member": ASSIGNEE_NOT_FAMILY_MEMBER,
}


def _translate_error(exc: TaskDomainError) -> HTTPException:
    code = _ERROR_CODES.get(exc.code)
    if code is None:
        detail = {"code": exc.code, "message": exc.safe_reason}
    else:
        detail = error_detail(code, **exc.params)
    return HTTPException(status_code=exc.status_code, detail=detail)


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
    reward_only: bool = Query(False, description="Return only open tasks with a token reward configured"),
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
    if reward_only:
        base = base.filter(Task.status == "open", Task.token_reward_amount.isnot(None), Task.token_reward_amount > 0)
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
    try:
        return create_task_domain(db, user, payload.model_dump())
    except TaskDomainError as exc:
        raise _translate_error(exc) from exc


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
    try:
        return update_task_domain(db, user, task_id, payload.model_dump(exclude_unset=True))
    except TaskDomainError as exc:
        raise _translate_error(exc) from exc


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
    try:
        delete_task_domain(db, user, task_id)
    except TaskDomainError as exc:
        raise _translate_error(exc) from exc
    return {"status": "deleted", "task_id": task_id}
