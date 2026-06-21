"""Broadcast helpers for shopping WebSocket events.

Shopping endpoints are sync `def` functions running in a threadpool, so they
can't directly `await` the async ConnectionManager methods. We capture the
event loop reference at startup and use `asyncio.run_coroutine_threadsafe`.
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any, Literal

from app.core.ws_manager import manager

logger = logging.getLogger(__name__)

_loop: asyncio.AbstractEventLoop | None = None
ShoppingBroadcastScope = Literal["list", "family"]


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def _fire(coro_factory: Callable[[], Any]):
    """Schedule a coroutine on the captured event loop (fire-and-forget)."""
    if _loop is None:
        logger.debug("WS broadcast skipped: no event loop set")
        return
    asyncio.run_coroutine_threadsafe(coro_factory(), _loop)


def broadcast_shopping_event(
    scope: ShoppingBroadcastScope,
    scope_id: int,
    event_type: str,
    payload: dict[str, Any],
):
    """Broadcast a shopping WebSocket event to a list or family scope."""
    event = {"type": event_type, **payload}
    if scope == "list":
        _fire(lambda: manager.broadcast(scope_id, event))
        return
    if scope == "family":
        _fire(lambda: manager.broadcast_to_family(scope_id, event))
        return
    raise ValueError(f"Unsupported shopping broadcast scope: {scope}")
