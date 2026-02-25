import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user
from app.database import get_db
from app.models import Notification, NotificationPreference, User
from app.schemas import NotificationPreferenceResponse, NotificationPreferenceUpdate, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows


@router.get("/unread-count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    def _load():
        return {"count": db.query(Notification).filter(Notification.user_id == user.id, Notification.read == False).count()}
    return cache.get_or_set(f"tribu:notif_count:{user.id}", 15, _load)


@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.post("/read-all")
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read == False).update({"read": True})
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.delete("/{notification_id}")
def delete_notification(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notif)
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.get("/stream")
async def notification_stream(user: User = Depends(current_user)):
    user_id = user.id

    async def event_generator():
        from app.database import SessionLocal

        last_id = 0
        try:
            while True:
                db = SessionLocal()
                try:
                    query = (
                        db.query(Notification)
                        .filter(Notification.user_id == user_id, Notification.id > last_id)
                        .order_by(Notification.id.asc())
                        .all()
                    )
                    for notif in query:
                        data = NotificationResponse.model_validate(notif).model_dump_json()
                        yield f"data: {data}\n\n"
                        last_id = notif.id
                finally:
                    db.close()
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            return

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/preferences", response_model=NotificationPreferenceResponse)
def get_preferences(user: User = Depends(current_user), db: Session = Depends(get_db)):
    def _load():
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
        if not pref:
            return {"reminders_enabled": True, "reminder_minutes": 30, "quiet_start": None, "quiet_end": None}
        return NotificationPreferenceResponse.model_validate(pref).model_dump()
    data = cache.get_or_set(f"tribu:notif_prefs:{user.id}", 600, _load)
    return NotificationPreferenceResponse(**data)


@router.put("/preferences", response_model=NotificationPreferenceResponse)
def update_preferences(
    payload: NotificationPreferenceUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
    if not pref:
        pref = NotificationPreference(user_id=user.id)
        db.add(pref)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pref, field, value)

    db.commit()
    db.refresh(pref)
    cache.invalidate(f"tribu:notif_prefs:{user.id}")
    return pref
