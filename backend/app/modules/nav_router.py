from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user
from app.database import get_db
from app.models import User, UserNavOrder
from app.schemas import AUTH_RESPONSES, ErrorResponse, NavOrderResponse, NavOrderUpdate

router = APIRouter(prefix="/nav", tags=["nav"], responses={**AUTH_RESPONSES})

DEFAULT_NAV_ORDER = ["dashboard", "calendar", "shopping", "tasks", "contacts", "notifications", "settings"]
KNOWN_KEYS = {"dashboard", "calendar", "shopping", "tasks", "contacts", "notifications", "settings", "admin"}


@router.get(
    "/order",
    response_model=NavOrderResponse,
    summary="Get navigation order",
    description="Return the current user's custom navigation bar order, or the default if not set.",
    response_description="Navigation bar order",
)
def get_nav_order(user: User = Depends(current_user), db: Session = Depends(get_db)):
    def _load():
        row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
        if not row:
            return {"nav_order": DEFAULT_NAV_ORDER}
        return {"nav_order": row.nav_order}
    data = cache.get_or_set(f"tribu:nav_order:{user.id}", 600, _load)
    return NavOrderResponse(**data)


@router.put(
    "/order",
    response_model=NavOrderResponse,
    summary="Update navigation order",
    description="Save a custom navigation bar order for the current user.",
    response_description="Updated navigation bar order",
)
def update_nav_order(payload: NavOrderUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    invalid = [k for k in payload.nav_order if k not in KNOWN_KEYS]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unknown nav keys: {', '.join(invalid)}")

    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if row:
        row.nav_order = payload.nav_order
    else:
        row = UserNavOrder(user_id=user.id, nav_order=payload.nav_order)
        db.add(row)
    db.commit()
    cache.invalidate(f"tribu:nav_order:{user.id}")
    return NavOrderResponse(nav_order=row.nav_order)
