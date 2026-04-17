"""Broadcast helpers for shopping WebSocket events.

Shopping endpoints are sync `def` functions running in a threadpool, so they
can't directly `await` the async ConnectionManager methods. We capture the
event loop reference at startup and use `asyncio.run_coroutine_threadsafe`.
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from app.core.ws_manager import manager

logger = logging.getLogger(__name__)

_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def _fire(coro_factory: Callable[[], Any]):
    """Schedule a coroutine on the captured event loop (fire-and-forget)."""
    if _loop is None:
        logger.debug("WS broadcast skipped: no event loop set")
        return
    asyncio.run_coroutine_threadsafe(coro_factory(), _loop)


def broadcast_item_added(list_id: int, item: dict):
    _fire(lambda: manager.broadcast(list_id, {"type": "item_added", "item": item}))


def broadcast_item_updated(list_id: int, item: dict):
    _fire(lambda: manager.broadcast(list_id, {"type": "item_updated", "item": item}))


def broadcast_item_deleted(list_id: int, item_id: int):
    _fire(lambda: manager.broadcast(list_id, {"type": "item_deleted", "item_id": item_id}))


def broadcast_items_cleared(list_id: int, deleted_count: int):
    _fire(lambda: manager.broadcast(list_id, {"type": "items_cleared", "list_id": list_id, "deleted_count": deleted_count}))


def broadcast_list_created(family_id: int, list_data: dict):
    _fire(lambda: manager.broadcast_to_family(family_id, {"type": "list_created", "list": list_data}))


def broadcast_list_deleted(family_id: int, list_id: int):
    _fire(lambda: manager.broadcast_to_family(family_id, {"type": "list_deleted", "list_id": list_id}))
