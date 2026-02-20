from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership, next_birthday_date
from app.database import get_db
from app.models import CalendarEvent, FamilyBirthday, User
from app.schemas import DashboardSummary, UpcomingBirthday

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, family_id)

    now = datetime.utcnow()
    next_events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.family_id == family_id, CalendarEvent.starts_at >= now)
        .order_by(CalendarEvent.starts_at.asc())
        .limit(8)
        .all()
    )

    birthdays = db.query(FamilyBirthday).filter(FamilyBirthday.family_id == family_id).all()
    today = date.today()
    upcoming = []
    for b in birthdays:
        occurs_on = next_birthday_date(b.month, b.day, today)
        days_until = (occurs_on - today).days
        if days_until <= 28:
            upcoming.append(
                UpcomingBirthday(
                    person_name=b.person_name,
                    occurs_on=occurs_on.isoformat(),
                    days_until=days_until,
                )
            )

    upcoming.sort(key=lambda x: x.days_until)

    return DashboardSummary(
        family_id=family_id,
        next_events=next_events,
        upcoming_birthdays=upcoming,
    )
