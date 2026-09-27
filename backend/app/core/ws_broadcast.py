"""Broadcast helpers for shopping WebSocket events.

Shopping endpoints are sync `def` functions running in a threadpool, so they
can't directly `await` the async ConnectionManager methods. We capture the
event loop reference at startup and use `asyncio.run_coroutine_threadsafe`.

With several backend workers, a client's WebSocket lives in one process while
the change may be saved by another. When Valkey is available, events are
therefore published on a channel that every worker relays to its own
connections; without Valkey they go to this process' connections only.
"""

import asyncio
import json
import logging
import os
from collections.abc import Callable
from typing import Any, Literal

from app.core.ws_manager import manager

logger = logging.getLogger(__name__)

CHANNEL = "tribu:shopping-events"
RELAY_RETRY_SECONDS = 5

_loop: asyncio.AbstractEventLoop | None = None
_relay_ready = False

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


async def _deliver(scope: str, scope_id: int, event: dict[str, Any]):
    if scope == "list":
        await manager.broadcast(scope_id, event)
    elif scope == "family":
        await manager.broadcast_to_family(scope_id, event)


def _publish(scope: str, scope_id: int, event: dict[str, Any]) -> bool:
    if not _relay_ready:
        return False
    from app.core import cache

    client = cache._get_client()
    if client is None:
        return False
    try:
        client.publish(CHANNEL, json.dumps({"scope": scope, "id": scope_id, "event": event}))
        return True
    except Exception:
        logger.warning("Shopping event could not be published; delivering locally only")
        return False


def broadcast_shopping_event(
    scope: ShoppingBroadcastScope,
    scope_id: int,
    event_type: str,
    payload: dict[str, Any],
):
    """Broadcast a shopping WebSocket event to a list or family scope."""
    if scope not in ("list", "family"):
        raise ValueError(f"Unsupported shopping broadcast scope: {scope}")
    event = {"type": event_type, **payload}
    if _publish(scope, scope_id, event):
        return
    _fire(lambda: _deliver(scope, scope_id, event))


async def relay_events():
    """Deliver events published by any worker to this worker's connections."""
    global _relay_ready
    url = os.getenv("REDIS_URL")
    if not url:
        return
    import redis.asyncio as aioredis

    while True:
        client = aioredis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        pubsub = client.pubsub()
        try:
            await pubsub.subscribe(CHANNEL)
            _relay_ready = True
            logger.info("Shopping events relayed through Valkey")
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    await _deliver(data["scope"], int(data["id"]), data["event"])
                except Exception:
                    logger.exception("Could not relay a shopping event")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Valkey relay unavailable (%s); retrying in %ss", exc, RELAY_RETRY_SECONDS)
        finally:
            _relay_ready = False
            try:
                await pubsub.aclose()
                await client.aclose()
            except Exception:
                pass
        await asyncio.sleep(RELAY_RETRY_SECONDS)
