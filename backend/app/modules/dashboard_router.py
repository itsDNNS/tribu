from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_family_membership, next_birthday_date
from app.core.recurrence import expand_event
from app.core.scopes import require_scope
from app.database import get_db
from app.models import CalendarEvent, FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, ErrorResponse, CalendarEventResponse, DashboardSummary, UpcomingBirthday

router = APIRouter(prefix="/dashboard", tags=["dashboard"], responses={**AUTH_RESPONSES})


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Get dashboard summary",
    description="Return upcoming events (14 days) and birthdays (28 days) for a family. Scope: `calendar:read`.",
    response_description="Dashboard summary with events and birthdays",
)
def dashboard_summary(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("calendar:read"),
):
    ensure_family_membership(db, user.id, family_id)

    def _load():
        now = datetime.now(UTC)
        range_end = now + timedelta(days=14)

        non_recurring = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.recurrence.is_(None),
                CalendarEvent.starts_at >= now,
                CalendarEvent.starts_at < range_end,
            )
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

        all_occurrences = []
        for ev in non_recurring:
            all_occurrences.extend(expand_event(ev, now, range_end))
        for ev in recurring:
            all_occurrences.extend(expand_event(ev, now, range_end))

        all_occurrences.sort(key=lambda o: o["starts_at"])
        next_events = [CalendarEventResponse(**o).model_dump() for o in all_occurrences[:8]]

        birthdays = db.query(FamilyBirthday).filter(FamilyBirthday.family_id == family_id).all()
        today = date.today()
        upcoming = []
        for b in birthdays:
            occurs_on = next_birthday_date(b.month, b.day, today)
            days_until = (occurs_on - today).days
            if days_until <= 28:
                upcoming.append({
                    "person_name": b.person_name,
                    "occurs_on": occurs_on.isoformat(),
                    "days_until": days_until,
                })

        upcoming.sort(key=lambda x: x["days_until"])

        return {
            "family_id": family_id,
            "next_events": next_events,
            "upcoming_birthdays": upcoming,
        }

    key = f"tribu:dashboard:{family_id}:{date.today()}"
    data = cache.get_or_set(key, 60, _load)
    return DashboardSummary(**data)
