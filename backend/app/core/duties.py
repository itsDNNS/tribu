"""Weekly duties: a default person per weekday, exceptions per date.

The weekly pattern (DutySlot) and the changes for single dates
(DutyException) stay separate. Real tasks are created for the next
HORIZON_DAYS days only, so a change entered months ahead lives as an
exception until its date comes into range. Each task remembers its duty
and date, which keeps creation idempotent and lets a later change of the
pattern or an exception update the still open task.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import local_wall_now, utcnow
from app.models import Duty, DutyException, DutySlot, Membership, Task

logger = logging.getLogger(__name__)

HORIZON_DAYS = 7


@dataclass(frozen=True)
class Occurrence:
    duty: Duty
    date: date
    default_assignee_id: Optional[int]
    assignee_id: Optional[int]
    skipped: bool
    is_exception: bool

    @property
    def due_date(self) -> datetime:
        return datetime.combine(self.date, self.duty.due_time or time(0, 0))


def occurrences(duty: Duty, start: date, days: int) -> list[Occurrence]:
    """The duty's dates in [start, start + days), with exceptions applied."""
    slots = {slot.weekday: slot.assigned_to_user_id for slot in duty.slots}
    exceptions = {
        exc.date: exc for exc in duty.exceptions if start <= exc.date < start + timedelta(days=days)
    }
    result = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        if day.weekday() not in slots:
            continue
        default = slots[day.weekday()]
        exc = exceptions.get(day)
        result.append(Occurrence(
            duty=duty,
            date=day,
            default_assignee_id=default,
            assignee_id=None if exc and exc.skipped else (exc.assigned_to_user_id if exc else default),
            skipped=bool(exc and exc.skipped),
            is_exception=exc is not None,
        ))
    return result


def _member_ids(db: Session, family_id: int) -> set[int]:
    return {row.user_id for row in db.query(Membership.user_id).filter(Membership.family_id == family_id)}


# What a change to a duty rewrites on its open tasks.
TITLE, DUE, PEOPLE = "title", "due", "people"


def sync_duty_tasks(
    db: Session,
    duty: Duty,
    *,
    update: frozenset[str] = frozenset(),
    now: datetime | None = None,
) -> list[tuple[Task, str]]:
    """Create the missing tasks of one duty in the horizon, and rewrite open ones.

    ``update`` names what changed (TITLE, DUE, PEOPLE), so a new title does
    not move a task someone rescheduled by hand; PEOPLE also removes open
    tasks of dates that left the pattern or were skipped. The periodic job
    passes nothing and only creates tasks. Done tasks are never touched.
    Returns (task, webhook event) pairs to dispatch after the commit.
    """
    now = now or local_wall_now(utcnow())
    today = now.date()
    members = _member_ids(db, duty.family_id)
    tasks = {
        task.duty_date: task
        for task in db.query(Task).filter(Task.duty_id == duty.id, Task.duty_date >= today)
    }
    changed: list[tuple[Task, str]] = []
    wanted = set()
    for occ in occurrences(duty, today, HORIZON_DAYS):
        if occ.skipped:
            continue
        wanted.add(occ.date)
        values = {
            TITLE: {"title": duty.title},
            DUE: {"due_date": occ.due_date, "due_is_date": duty.due_time is None},
            PEOPLE: {"assigned_to_user_id": occ.assignee_id if occ.assignee_id in members else None},
        }
        task = tasks.get(occ.date)
        if task is None:
            if duty.due_time is not None and occ.due_date < now:
                continue
            task = Task(
                family_id=duty.family_id,
                created_by_user_id=duty.created_by_user_id,
                duty_id=duty.id,
                duty_date=occ.date,
                **values[TITLE], **values[DUE], **values[PEOPLE],
            )
            try:
                with db.begin_nested():
                    db.add(task)
                    db.flush()
            except IntegrityError:
                # Another worker created the same date's task first.
                continue
            changed.append((task, "task.created"))
        elif task.status == "open":
            fields = {name: value for key in update for name, value in values[key].items()}
            if any(getattr(task, name) != value for name, value in fields.items()):
                for name, value in fields.items():
                    setattr(task, name, value)
                changed.append((task, "task.updated"))
    if PEOPLE in update:
        for day, task in tasks.items():
            if day not in wanted and task.status == "open":
                db.delete(task)
    return changed


def dispatch_task_events(db: Session, changed: list[tuple[Task, str]]) -> None:
    from app.core.task_service import dispatch_task_webhook  # noqa: PLC0415 - task_service imports this module

    for task, event in changed:
        dispatch_task_webhook(db, task, event)


def remember_task_change(db: Session, task: Task, *, deleted: bool = False) -> None:
    """Keep a duty task's reassignment or deletion as an exception for its date.

    Without it the next sync would put the default person back, or create
    the deleted task again.
    """
    if task.duty_id is None or task.duty_date is None or task.duty_date < local_wall_now(utcnow()).date():
        return
    exc = (
        db.query(DutyException)
        .filter(DutyException.duty_id == task.duty_id, DutyException.date == task.duty_date)
        .first()
    )
    slot = (
        db.query(DutySlot)
        .filter(DutySlot.duty_id == task.duty_id, DutySlot.weekday == task.duty_date.weekday())
        .first()
    )
    if not deleted and slot is not None and slot.assigned_to_user_id == task.assigned_to_user_id:
        if exc is not None:
            db.delete(exc)
        return
    if exc is None:
        exc = DutyException(duty_id=task.duty_id, date=task.duty_date)
        db.add(exc)
    exc.skipped = deleted
    exc.assigned_to_user_id = None if deleted else task.assigned_to_user_id


def sync_all_duties(db: Session) -> int:
    """Create the tasks that came into the horizon since the last run."""
    now = local_wall_now(utcnow())
    created = 0
    for duty in db.query(Duty).order_by(Duty.id).all():
        try:
            changed = sync_duty_tasks(db, duty, now=now)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Creating tasks for duty %s failed", duty.id)
            continue
        dispatch_task_events(db, changed)
        created += len(changed)
    return created


def forget_member(db: Session, family_id: int, user_id: int) -> None:
    """Take a person who left the family out of its duties and their open tasks."""
    duty_ids = [duty_id for (duty_id,) in db.query(Duty.id).filter(Duty.family_id == family_id)]
    if not duty_ids:
        return
    for model in (DutySlot, DutyException):
        db.query(model).filter(
            model.duty_id.in_(duty_ids), model.assigned_to_user_id == user_id,
        ).update({"assigned_to_user_id": None}, synchronize_session=False)
    db.query(Task).filter(
        Task.duty_id.in_(duty_ids), Task.status == "open", Task.assigned_to_user_id == user_id,
    ).update({"assigned_to_user_id": None}, synchronize_session=False)
