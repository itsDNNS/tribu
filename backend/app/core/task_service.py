"""Shared Task domain service used by REST and DAV.

This module owns authorization, validation, completion transitions, activity,
rewards, recurrence, transaction boundaries, and task webhooks. Protocol
adapters are deliberately limited to translating input/output and errors.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable, Mapping, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.activity import record_activity
from app.core.clock import local_wall_now, to_local_wall_naive, utcnow
from app.core.webhooks import dispatch_webhook_event
from app.models import Membership, RewardCurrency, Task, TokenTransaction, User


VALID_PRIORITIES = {"low", "normal", "high"}
VALID_STATUSES = {"open", "done"}
FIRST_WEEKDAY_RECURRENCES = {
    "monthly_first_monday": 0,
    "monthly_first_tuesday": 1,
    "monthly_first_wednesday": 2,
    "monthly_first_thursday": 3,
    "monthly_first_friday": 4,
    "monthly_first_saturday": 5,
    "monthly_first_sunday": 6,
}
VALID_RECURRENCES = {"daily", "weekly", "monthly", "yearly", *FIRST_WEEKDAY_RECURRENCES.keys()}


class TaskDomainError(Exception):
    """Base for controlled task-domain failures."""

    status_code = 400
    code = "invalid_task"
    safe_reason = "Task request rejected"

    def __init__(self, *, params: Mapping[str, object] | None = None):
        super().__init__(self.safe_reason)
        self.params = dict(params or {})


class TaskNotFoundError(TaskDomainError):
    status_code = 404
    code = "task_not_found"
    safe_reason = "Task not found"


class TaskFamilyAccessError(TaskDomainError):
    status_code = 403
    code = "no_family_access"
    safe_reason = "Task family access denied"


class TaskAdultRequiredError(TaskDomainError):
    status_code = 403
    code = "adult_required"
    safe_reason = "Task write access denied"


class TaskValidationError(TaskDomainError):
    def __init__(self, code: str, *, params: Mapping[str, object] | None = None):
        self.code = code
        super().__init__(params=params)


class TaskConflictError(TaskDomainError):
    status_code = 409
    code = "task_conflict"
    safe_reason = "Task write conflict"


BeforeCommit = Callable[[Task], None]


def _membership(db: Session, user_id: int, family_id: int) -> Membership:
    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user_id, Membership.family_id == family_id)
        .first()
    )
    if membership is None:
        raise TaskFamilyAccessError()
    return membership


def _require_adult(db: Session, user_id: int, family_id: int) -> Membership:
    membership = _membership(db, user_id, family_id)
    if not membership.is_adult:
        raise TaskAdultRequiredError()
    return membership


def _validate_assignee(db: Session, family_id: int, assignee_id: int | None) -> None:
    if assignee_id is None:
        return
    exists = (
        db.query(Membership.id)
        .filter(Membership.user_id == assignee_id, Membership.family_id == family_id)
        .first()
    )
    if exists is None:
        raise TaskValidationError("assignee_not_family_member")


def _validate_values(values: Mapping[str, Any]) -> None:
    if "title" in values and (not isinstance(values["title"], str) or not values["title"].strip()):
        raise TaskValidationError("invalid_title")
    if "title" in values and len(values["title"].strip()) > 240:
        raise TaskValidationError("invalid_title")
    if "priority" in values and values["priority"] not in VALID_PRIORITIES:
        raise TaskValidationError("invalid_priority", params={"priority": values["priority"]})
    if "status" in values and values["status"] not in VALID_STATUSES:
        raise TaskValidationError("invalid_status", params={"status": values["status"]})
    if "recurrence" in values and values["recurrence"] is not None and values["recurrence"] not in VALID_RECURRENCES:
        raise TaskValidationError("invalid_recurrence", params={"recurrence": values["recurrence"]})


def _first_weekday_of_month(year: int, month: int, weekday: int, base_time: datetime) -> datetime:
    first_day = datetime(year, month, 1, base_time.hour, base_time.minute, base_time.second, base_time.microsecond)
    return first_day + timedelta(days=(weekday - first_day.weekday()) % 7)


def _compute_next_due(current_due: Optional[datetime], recurrence: str) -> datetime:
    base = current_due if current_due else local_wall_now(utcnow())
    if recurrence == "daily":
        return base + timedelta(days=1)
    if recurrence == "weekly":
        return base + timedelta(weeks=1)
    if recurrence == "monthly":
        return base + relativedelta(months=1)
    if recurrence in FIRST_WEEKDAY_RECURRENCES:
        year, month = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
        return _first_weekday_of_month(year, month, FIRST_WEEKDAY_RECURRENCES[recurrence], base)
    if recurrence == "yearly":
        return base + relativedelta(years=1)
    return base


def _webhook_data(task: Task) -> dict[str, object]:
    return {
        "task_id": task.id,
        "title": task.title,
        "status": task.status,
        "assigned_to_user_id": task.assigned_to_user_id,
    }


def dispatch_task_webhook(
    db: Session,
    task: Task,
    event_type: str,
    *,
    extra: Mapping[str, object] | None = None,
) -> None:
    data = _webhook_data(task)
    data.update(extra or {})
    dispatch_webhook_event(db, family_id=task.family_id, event_type=event_type, data=data)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise TaskConflictError() from exc


def create_task(
    db: Session,
    actor: User,
    values: Mapping[str, Any],
    *,
    before_commit: BeforeCommit | None = None,
    commit: bool = True,
    webhook_extra: Mapping[str, object] | None = None,
) -> Task:
    values = dict(values)
    family_id = int(values["family_id"])
    _require_adult(db, actor.id, family_id)
    _validate_values(values)
    _validate_assignee(db, family_id, values.get("assigned_to_user_id"))

    due_date = to_local_wall_naive(values.get("due_date"))
    due_is_date = bool(values.get("due_is_date", False)) if due_date is not None else False
    status = values.get("status", "open")
    task = Task(
        family_id=family_id,
        title=values["title"].strip(),
        description=values.get("description"),
        status=status,
        priority=values.get("priority", "normal"),
        due_date=due_date,
        due_is_date=due_is_date,
        recurrence=values.get("recurrence"),
        assigned_to_user_id=values.get("assigned_to_user_id"),
        created_by_user_id=actor.id,
        token_reward_amount=values.get("token_reward_amount") or None,
        token_require_confirmation=values.get("token_require_confirmation", True),
        completed_at=(values.get("completed_at") or utcnow()) if status == "done" else None,
    )
    db.add(task)
    db.flush()
    record_activity(
        db,
        family_id=family_id,
        actor_user_id=actor.id,
        actor_display_name=actor.display_name,
        action="created",
        object_type="task",
        object_id=task.id,
        object_label=task.title,
        verb="created",
        object_kind="task",
    )
    if before_commit is not None:
        before_commit(task)
    if commit:
        _commit(db)
        db.refresh(task)
        dispatch_task_webhook(db, task, "task.created", extra=webhook_extra)
    return task


_EDITABLE_FIELDS = {
    "title",
    "description",
    "status",
    "priority",
    "due_date",
    "due_is_date",
    "recurrence",
    "assigned_to_user_id",
    "token_reward_amount",
    "token_require_confirmation",
}


def _normalized_changes(task: Task, changes: Mapping[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for name, value in changes.items():
        if name not in _EDITABLE_FIELDS and name != "completed_at":
            continue
        if value is None and name in {
            "title", "status", "priority", "due_is_date", "token_require_confirmation"
        }:
            # These fields are not nullable. Preserve the historical PATCH
            # behavior where an explicit null meant "leave unchanged" while
            # nullable task fields below can now be deliberately cleared.
            continue
        if name == "due_date":
            value = to_local_wall_naive(value)
        elif name == "token_reward_amount":
            value = value or None
        elif name == "title" and isinstance(value, str):
            value = value.strip()
        normalized[name] = value
    if "due_date" in normalized and "due_is_date" not in normalized:
        # REST date-time edits retain historical timed semantics unless the
        # caller explicitly opts into date-only precision.
        normalized["due_is_date"] = False
    return normalized


def _actual_domain_changes(task: Task, changes: Mapping[str, Any]) -> set[str]:
    actual: set[str] = set()
    for name, value in changes.items():
        if name == "completed_at":
            continue
        if name in _EDITABLE_FIELDS and getattr(task, name) != value:
            actual.add(name)
    return actual


def _award_reward_once(db: Session, task: Task, actor: User) -> None:
    if not task.token_reward_amount or not task.assigned_to_user_id:
        return
    already_awarded = (
        db.query(TokenTransaction.id)
        .filter(TokenTransaction.source_task_id == task.id)
        .first()
    )
    if already_awarded is not None:
        return
    currency = db.query(RewardCurrency).filter(RewardCurrency.family_id == task.family_id).first()
    if currency is None:
        return
    auto_confirm = not task.token_require_confirmation
    db.add(TokenTransaction(
        family_id=task.family_id,
        currency_id=currency.id,
        user_id=task.assigned_to_user_id,
        kind="earn",
        amount=task.token_reward_amount,
        status="confirmed" if auto_confirm else "pending",
        source_task_id=task.id,
        confirmed_by_user_id=actor.id if auto_confirm else None,
        confirmed_at=utcnow() if auto_confirm else None,
    ))


def _create_next_occurrence(db: Session, task: Task) -> Task:
    next_task = Task(
        family_id=task.family_id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=_compute_next_due(task.due_date, task.recurrence),
        due_is_date=task.due_is_date,
        recurrence=task.recurrence,
        assigned_to_user_id=task.assigned_to_user_id,
        created_by_user_id=task.created_by_user_id,
        token_reward_amount=task.token_reward_amount,
        token_require_confirmation=task.token_require_confirmation,
    )
    db.add(next_task)
    return next_task


def update_task(
    db: Session,
    actor: User,
    task_id: int,
    changes: Mapping[str, Any],
    *,
    before_commit: BeforeCommit | None = None,
) -> Task:
    # PostgreSQL row locking makes the open->done transition and reward
    # existence check one serialized decision. SQLite serializes writes at the
    # database level; DAV additionally holds Radicale's process write lock.
    task = db.query(Task).filter(Task.id == task_id).with_for_update().first()
    if task is None:
        raise TaskNotFoundError()
    membership = _membership(db, actor.id, task.family_id)
    normalized = _normalized_changes(task, changes)
    _validate_values(normalized)
    if "assigned_to_user_id" in normalized:
        _validate_assignee(db, task.family_id, normalized["assigned_to_user_id"])

    actual = _actual_domain_changes(task, normalized)
    if not membership.is_adult:
        if task.assigned_to_user_id != actor.id or actual - {"status"}:
            raise TaskAdultRequiredError()

    was_done = task.status == "done"
    for name in _EDITABLE_FIELDS - {"status"}:
        if name in normalized:
            setattr(task, name, normalized[name])
    if task.due_date is None:
        task.due_is_date = False

    if "status" in normalized:
        task.status = normalized["status"]
        if not was_done and task.status == "done":
            task.completed_at = normalized.get("completed_at") or utcnow()
            _award_reward_once(db, task, actor)
            if task.recurrence:
                _create_next_occurrence(db, task)
            record_activity(
                db,
                family_id=task.family_id,
                actor_user_id=actor.id,
                actor_display_name=actor.display_name,
                action="completed",
                object_type="task",
                object_id=task.id,
                object_label=task.title,
                verb="completed",
                object_kind="task",
            )
        elif was_done and task.status == "open":
            task.completed_at = None

    if before_commit is not None:
        before_commit(task)
    _commit(db)
    db.refresh(task)
    dispatch_task_webhook(db, task, "task.updated")
    return task


def delete_task(db: Session, actor: User, task_id: int) -> None:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise TaskNotFoundError()
    _require_adult(db, actor.id, task.family_id)
    db.delete(task)
    _commit(db)
