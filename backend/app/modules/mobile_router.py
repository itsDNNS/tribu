"""Mobile-oriented aggregate endpoints.

The native app work starts with backend contracts that are stable and small.
This module keeps those contracts separate from the web dashboard so mobile
clients do not need to stitch together screen-shaped web responses.
"""

from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.errors import error_detail, INSUFFICIENT_SCOPE
from app.core.recurrence import expand_event
from app.core.utils import utcnow
from app.database import get_db
from app.models import CalendarEvent, Membership, Notification, QuickCaptureItem, ShoppingItem, ShoppingList, Task, User
from app.schemas import AUTH_RESPONSES


router = APIRouter(prefix="/mobile", tags=["mobile"], responses={**AUTH_RESPONSES})

MOBILE_DAILY_REQUIRED_SCOPES = {
    "calendar:read",
    "tasks:read",
    "shopping:read",
    "quick_capture:read",
    "families:read",
    "profile:read",
}


class MobileDailySync(BaseModel):
    scope: str = Field("mobile_daily", description="Snapshot contract identifier")
    generated_at: datetime = Field(..., description="Server timestamp when the snapshot was generated")


class MobileDailyMember(BaseModel):
    user_id: int
    display_name: str
    color: Optional[str] = None


class MobileDailyAgendaEvent(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    all_day: bool = False
    assigned_to: list[int] = Field(default_factory=list)
    color: Optional[str] = None
    category: Optional[str] = None
    recurrence: Optional[str] = None


class MobileDailyTask(BaseModel):
    id: int
    title: str
    priority: str
    due_date: datetime
    due_state: str
    assigned_to_user_id: Optional[int] = None


class MobileDailyShoppingList(BaseModel):
    id: int
    name: str
    item_count: int
    checked_count: int
    open_count: int


class MobileDailyCount(BaseModel):
    open_count: int = 0


class MobileDailyNotificationCount(BaseModel):
    unread_count: int = 0


class MobileDailySnapshot(BaseModel):
    family_id: int
    date: date
    server_time: datetime
    sync: MobileDailySync
    members: list[MobileDailyMember]
    agenda: list[MobileDailyAgendaEvent]
    tasks: list[MobileDailyTask]
    shopping_lists: list[MobileDailyShoppingList]
    quick_capture: MobileDailyCount
    notifications: MobileDailyNotificationCount


def require_mobile_daily_scopes(request: Request):
    pat_scopes = getattr(request.state, "pat_scopes", None)
    if pat_scopes is None or "*" in pat_scopes:
        return
    missing = sorted(MOBILE_DAILY_REQUIRED_SCOPES - set(pat_scopes))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_detail(INSUFFICIENT_SCOPE, scope=",".join(missing)),
        )


def _day_bounds(snapshot_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(snapshot_date, time.min)
    return start, start + timedelta(days=1)


def _event_overlaps_day(row: dict, start: datetime, end: datetime) -> bool:
    starts_at = row["starts_at"]
    ends_at = row.get("ends_at")
    if starts_at >= end:
        return False
    if ends_at is None:
        return starts_at >= start
    return ends_at > start


def _recurring_expansion_start(event: CalendarEvent, start: datetime) -> datetime:
    if event.starts_at and event.ends_at and event.ends_at > event.starts_at:
        return start - (event.ends_at - event.starts_at)
    return start


def _agenda_for_day(db: Session, family_id: int, start: datetime, end: datetime) -> list[MobileDailyAgendaEvent]:
    non_recurring = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.family_id == family_id,
            CalendarEvent.recurrence.is_(None),
            CalendarEvent.starts_at < end,
        )
        .filter((CalendarEvent.ends_at > start) | (CalendarEvent.ends_at.is_(None) & (CalendarEvent.starts_at >= start)))
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
    occurrences: list[dict] = []
    for event in non_recurring:
        occurrences.extend(row for row in expand_event(event, start, end) if _event_overlaps_day(row, start, end))
    for event in recurring:
        expansion_start = _recurring_expansion_start(event, start)
        occurrences.extend(row for row in expand_event(event, expansion_start, end) if _event_overlaps_day(row, start, end))
    occurrences.sort(key=lambda row: row["starts_at"])
    return [
        MobileDailyAgendaEvent(
            id=row["id"],
            title=row["title"],
            starts_at=row["starts_at"],
            ends_at=row.get("ends_at"),
            all_day=row.get("all_day") or False,
            assigned_to=row.get("assigned_to") or [],
            color=row.get("color"),
            category=row.get("category"),
            recurrence=row.get("recurrence"),
        )
        for row in occurrences
    ]


def _tasks_due_for_day(db: Session, family_id: int, start: datetime, end: datetime) -> list[MobileDailyTask]:
    rows = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status == "open",
            Task.due_date.isnot(None),
            Task.due_date < end,
        )
        .order_by(Task.due_date.asc(), Task.id.asc())
        .all()
    )
    return [
        MobileDailyTask(
            id=task.id,
            title=task.title,
            priority=task.priority,
            due_date=task.due_date,
            due_state="overdue" if task.due_date < start else "today",
            assigned_to_user_id=task.assigned_to_user_id,
        )
        for task in rows
    ]


def _shopping_summaries(db: Session, family_id: int) -> list[MobileDailyShoppingList]:
    lists = db.query(ShoppingList).filter(ShoppingList.family_id == family_id).order_by(ShoppingList.created_at.asc(), ShoppingList.id.asc()).all()
    summaries: list[MobileDailyShoppingList] = []
    for shopping_list in lists:
        items = db.query(ShoppingItem).filter(ShoppingItem.list_id == shopping_list.id).all()
        item_count = len(items)
        checked_count = sum(1 for item in items if item.checked)
        summaries.append(MobileDailyShoppingList(
            id=shopping_list.id,
            name=shopping_list.name,
            item_count=item_count,
            checked_count=checked_count,
            open_count=item_count - checked_count,
        ))
    return summaries


@router.get(
    "/daily",
    response_model=MobileDailySnapshot,
    summary="Get mobile daily snapshot",
    description=(
        "Return the family-scoped data a native mobile Today screen needs in one authenticated request. "
        "Personal Access Tokens must include calendar, tasks, shopping, quick capture, families, and profile read scopes."
    ),
    response_description="Mobile daily snapshot",
)
def mobile_daily_snapshot(
    family_id: int,
    snapshot_date: date | None = Query(None, alias="date"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=Depends(require_mobile_daily_scopes),
):
    ensure_family_membership(db, user.id, family_id)
    day = snapshot_date or date.today()
    start, end = _day_bounds(day)

    memberships = (
        db.query(Membership)
        .filter(Membership.family_id == family_id)
        .join(User, User.id == Membership.user_id)
        .order_by(User.display_name.asc(), User.id.asc())
        .all()
    )
    members = [
        MobileDailyMember(
            user_id=membership.user.id,
            display_name=membership.user.display_name,
            color=membership.color,
        )
        for membership in memberships
    ]

    open_quick_capture = db.query(QuickCaptureItem).filter(
        QuickCaptureItem.family_id == family_id,
        QuickCaptureItem.status == "open",
    ).count()
    unread_notifications = db.query(Notification).filter(
        Notification.family_id == family_id,
        Notification.user_id == user.id,
        Notification.read.is_(False),
    ).count()
    generated_at = utcnow()

    return MobileDailySnapshot(
        family_id=family_id,
        date=day,
        server_time=generated_at,
        sync=MobileDailySync(generated_at=generated_at),
        members=members,
        agenda=_agenda_for_day(db, family_id, start, end),
        tasks=_tasks_due_for_day(db, family_id, start, end),
        shopping_lists=_shopping_summaries(db, family_id),
        quick_capture=MobileDailyCount(open_count=open_quick_capture),
        notifications=MobileDailyNotificationCount(unread_count=unread_notifications),
    )
