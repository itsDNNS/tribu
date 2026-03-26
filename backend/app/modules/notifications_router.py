import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user
from app.core.push import get_vapid_public_key
from app.database import get_db
from app.models import Notification, NotificationPreference, PushSubscription, User
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE, ErrorResponse, NotificationPreferenceResponse, NotificationPreferenceUpdate, NotificationResponse, PushSubscriptionCreate, PushUnsubscribe
from app.core.errors import error_detail, NOTIFICATION_NOT_FOUND

router = APIRouter(prefix="/notifications", tags=["notifications"], responses={**AUTH_RESPONSES})


@router.get(
    "",
    response_model=list[NotificationResponse],
    summary="List notifications",
    description="Return paginated notifications for the current user, newest first.",
    response_description="List of notifications",
)
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


@router.get(
    "/unread-count",
    summary="Get unread notification count",
    description="Return the number of unread notifications for the current user.",
    response_description="Object with unread count",
)
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    def _load():
        return {"count": db.query(Notification).filter(Notification.user_id == user.id, Notification.read == False).count()}
    return cache.get_or_set(f"tribu:notif_count:{user.id}", 15, _load)


@router.patch(
    "/{notification_id}/read",
    summary="Mark notification as read",
    description="Mark a single notification as read.",
    response_description="Confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail=error_detail(NOTIFICATION_NOT_FOUND))
    notif.read = True
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.post(
    "/read-all",
    summary="Mark all notifications as read",
    description="Mark all unread notifications as read for the current user.",
    response_description="Confirmation",
)
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read == False).update({"read": True})
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.delete(
    "/{notification_id}",
    summary="Delete a notification",
    description="Permanently delete a notification.",
    response_description="Confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_notification(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail=error_detail(NOTIFICATION_NOT_FOUND))
    db.delete(notif)
    db.commit()
    cache.invalidate(f"tribu:notif_count:{user.id}")
    return {"status": "ok"}


@router.get(
    "/stream",
    summary="Stream notifications (SSE)",
    description="Server-Sent Events stream that pushes new notifications in real time. The connection polls every 5 seconds and emits `data:` frames as JSON.",
    response_description="SSE event stream (text/event-stream)",
)
async def notification_stream(
    user: User = Depends(current_user),
    last_event_id: int = Query(0, alias="lastEventId"),
):
    user_id = user.id

    async def event_generator():
        from app.database import SessionLocal

        last_id = last_event_id
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
                        yield f"id: {notif.id}\nevent: notification_new\ndata: {data}\n\n"
                        last_id = notif.id
                finally:
                    db.close()
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            return

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get(
    "/push/vapid-key",
    summary="Get VAPID public key",
    description="Return the VAPID public key for push subscription. Returns null if push is not configured.",
    response_description="VAPID public key or null",
)
def vapid_key():
    key = get_vapid_public_key()
    return {"vapid_key": key}


@router.post(
    "/push/subscribe",
    summary="Register push subscription",
    description="Register a browser push subscription for the current user. Upserts on endpoint.",
    response_description="Confirmation",
)
def push_subscribe(
    payload: PushSubscriptionCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).first()
    if existing:
        existing.user_id = user.id
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
    else:
        sub = PushSubscription(
            user_id=user.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
        )
        db.add(sub)

    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
    if not pref:
        pref = NotificationPreference(user_id=user.id, push_enabled=True)
        db.add(pref)
    else:
        pref.push_enabled = True

    db.commit()
    cache.invalidate(f"tribu:notif_prefs:{user.id}")
    return {"status": "ok"}


@router.post(
    "/push/unsubscribe",
    summary="Unregister push subscription",
    description="Remove a browser push subscription. Disables push if no subscriptions remain.",
    response_description="Confirmation",
)
def push_unsubscribe(
    payload: PushUnsubscribe,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(PushSubscription).filter(
        PushSubscription.endpoint == payload.endpoint,
        PushSubscription.user_id == user.id,
    ).first()
    if sub:
        db.delete(sub)

    remaining = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    if remaining <= (1 if sub else 0):
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
        if pref:
            pref.push_enabled = False

    db.commit()
    cache.invalidate(f"tribu:notif_prefs:{user.id}")
    return {"status": "ok"}


@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Get notification preferences",
    description="Return the current user's notification preferences (reminders, quiet hours).",
    response_description="Notification preferences",
)
def get_preferences(user: User = Depends(current_user), db: Session = Depends(get_db)):
    def _load():
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
        if not pref:
            return {"reminders_enabled": True, "reminder_minutes": 30, "quiet_start": None, "quiet_end": None, "push_enabled": False}
        return NotificationPreferenceResponse.model_validate(pref).model_dump()
    data = cache.get_or_set(f"tribu:notif_prefs:{user.id}", 600, _load)
    return NotificationPreferenceResponse(**data)


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Update notification preferences",
    description="Update the current user's notification preferences. Creates default preferences if none exist.",
    response_description="Updated notification preferences",
)
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
