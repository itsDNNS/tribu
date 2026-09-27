"""Shared storage for request rate limits.

Each backend worker would otherwise count on its own, so several workers would
multiply every limit (for example login attempts). With Valkey configured, all
workers share the counters and fall back to in-memory counting while Valkey is
unreachable.
"""

import os


def limiter_storage_options() -> dict:
    url = os.getenv("REDIS_URL")
    if not url:
        return {}
    return {"storage_uri": url, "in_memory_fallback_enabled": True}
