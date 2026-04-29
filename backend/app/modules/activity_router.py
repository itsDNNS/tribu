from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import HouseholdActivity, User
from app.schemas import AUTH_RESPONSES, HouseholdActivityEntry, PaginatedHouseholdActivity

router = APIRouter(prefix="/activity", tags=["activity"], responses={**AUTH_RESPONSES})


@router.get(
    "",
    response_model=PaginatedHouseholdActivity,
    summary="List household activity",
    description="Return recent public-safe activity for a family. Scope: `activity:read`.",
    response_description="Paginated household activity feed",
)
def list_activity(
    family_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("activity:read"),
):
    ensure_family_membership(db, user.id, family_id)
    base = db.query(HouseholdActivity).filter(HouseholdActivity.family_id == family_id)
    total = base.count()
    rows = (
        base
        .order_by(HouseholdActivity.created_at.desc(), HouseholdActivity.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        HouseholdActivityEntry(
            id=activity.id,
            actor_display_name=activity.actor_display_name,
            action=activity.action,
            object_type=activity.object_type,
            summary=activity.summary,
            created_at=activity.created_at,
        )
        for activity in rows
    ]
    return PaginatedHouseholdActivity(items=items, total=total, offset=offset, limit=limit)
