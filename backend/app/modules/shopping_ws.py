"""WebSocket endpoint for real-time shopping list sync."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.ws_manager import manager
from app.database import SessionLocal
from app.models import Membership, ShoppingList
from app.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _auth_and_check(ws: WebSocket, list_id: int) -> tuple[int, int] | None:
    """Extract user from JWT cookie, verify family membership.

    Returns (user_id, family_id) or None on failure.
    """
    token = ws.cookies.get("tribu_token")
    if not token:
        return None

    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        return None

    db: Session = SessionLocal()
    try:
        sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
        if not sl:
            return None
        membership = db.query(Membership).filter(
            Membership.user_id == user_id,
            Membership.family_id == sl.family_id,
        ).first()
        if not membership:
            return None
        return user_id, sl.family_id
    finally:
        db.close()


@router.websocket("/ws/shopping/{list_id}")
async def shopping_ws(ws: WebSocket, list_id: int):
    result = _auth_and_check(ws, list_id)
    if result is None:
        await ws.accept()
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id, family_id = result
    await ws.accept()
    conn_id = manager.connect(list_id, ws, user_id, family_id)

    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WS error for conn=%s", conn_id, exc_info=True)
    finally:
        manager.disconnect(list_id, conn_id)
