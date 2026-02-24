from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.database import get_db
from app.models import User, UserNavOrder
from app.schemas import NavOrderResponse, NavOrderUpdate

router = APIRouter(prefix="/nav", tags=["nav"])

DEFAULT_NAV_ORDER = ["dashboard", "calendar", "shopping", "tasks", "contacts", "notifications", "settings"]
KNOWN_KEYS = {"dashboard", "calendar", "shopping", "tasks", "contacts", "notifications", "settings", "admin"}


@router.get("/order", response_model=NavOrderResponse)
def get_nav_order(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if not row:
        return NavOrderResponse(nav_order=DEFAULT_NAV_ORDER)
    return NavOrderResponse(nav_order=row.nav_order)


@router.put("/order", response_model=NavOrderResponse)
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
    return NavOrderResponse(nav_order=row.nav_order)
