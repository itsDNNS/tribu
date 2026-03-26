from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import (
    CalendarEvent, Contact, FamilyBirthday, ShoppingItem, ShoppingList, Task, User,
)

router = APIRouter(prefix="/search", tags=["Search"])

MAX_PER_MODULE = 5


@router.get(
    "",
    summary="Global search across all modules",
    description="Search events, tasks, shopping items, contacts, and birthdays by keyword.",
)
def global_search(
    family_id: int = Query(...),
    q: str = Query(..., min_length=1, max_length=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_membership(db, user.id, family_id)
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    results = {}

    # Calendar events
    events = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.family_id == family_id,
            or_(
                CalendarEvent.title.ilike(pattern),
                CalendarEvent.description.ilike(pattern),
                CalendarEvent.category.ilike(pattern),
            ),
        )
        .order_by(CalendarEvent.starts_at.desc())
        .limit(MAX_PER_MODULE)
        .all()
    )
    if events:
        results["calendar"] = [
            {"id": e.id, "title": e.title, "starts_at": e.starts_at.isoformat() if e.starts_at else None, "color": e.color}
            for e in events
        ]

    # Tasks
    tasks = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            or_(Task.title.ilike(pattern), Task.description.ilike(pattern)),
        )
        .order_by(Task.created_at.desc())
        .limit(MAX_PER_MODULE)
        .all()
    )
    if tasks:
        results["tasks"] = [
            {"id": t.id, "title": t.title, "status": t.status}
            for t in tasks
        ]

    # Shopping items (join through list for family_id)
    items = (
        db.query(ShoppingItem)
        .join(ShoppingList, ShoppingItem.list_id == ShoppingList.id)
        .filter(
            ShoppingList.family_id == family_id,
            or_(ShoppingItem.name.ilike(pattern), ShoppingItem.spec.ilike(pattern)),
        )
        .limit(MAX_PER_MODULE)
        .all()
    )
    if items:
        results["shopping"] = [
            {"id": i.id, "name": i.name, "list_id": i.list_id, "checked": i.checked}
            for i in items
        ]

    # Contacts
    contacts = (
        db.query(Contact)
        .filter(
            Contact.family_id == family_id,
            or_(
                Contact.full_name.ilike(pattern),
                Contact.email.ilike(pattern),
                Contact.phone.ilike(pattern),
            ),
        )
        .limit(MAX_PER_MODULE)
        .all()
    )
    if contacts:
        results["contacts"] = [
            {"id": c.id, "full_name": c.full_name}
            for c in contacts
        ]

    # Birthdays
    birthdays = (
        db.query(FamilyBirthday)
        .filter(
            FamilyBirthday.family_id == family_id,
            FamilyBirthday.person_name.ilike(pattern),
        )
        .limit(MAX_PER_MODULE)
        .all()
    )
    if birthdays:
        results["birthdays"] = [
            {"id": b.id, "person_name": b.person_name, "month": b.month, "day": b.day}
            for b in birthdays
        ]

    return results
