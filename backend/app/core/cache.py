import json
import logging
import os
from typing import Any, Callable

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL")

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not REDIS_URL:
        return None
    try:
        import redis
        _client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        return _client
    except Exception as e:
        logger.warning("Failed to create Valkey client: %s", e)
        return None


def ping() -> bool:
    client = _get_client()
    if not client:
        return False
    try:
        return client.ping()
    except Exception:
        return False


def get_or_set(key: str, ttl: int, loader: Callable[[], Any]) -> Any:
    client = _get_client()
    if client:
        try:
            cached = client.get(key)
            if cached is not None:
                return json.loads(cached)
        except Exception as e:
            logger.debug("Cache get failed for %s: %s", key, e)

    result = loader()

    if client and result is not None:
        try:
            client.setex(key, ttl, json.dumps(result, default=str))
        except Exception as e:
            logger.debug("Cache set failed for %s: %s", key, e)

    return result


def invalidate(*keys: str):
    client = _get_client()
    if not client or not keys:
        return
    try:
        client.delete(*keys)
    except Exception as e:
        logger.debug("Cache invalidate failed: %s", e)


def invalidate_pattern(pattern: str):
    client = _get_client()
    if not client:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                client.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.debug("Cache invalidate_pattern failed for %s: %s", pattern, e)
