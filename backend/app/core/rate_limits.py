"""Shared storage for request rate limits.

Each backend worker would otherwise count on its own, so several workers would
multiply every limit (for example login attempts). With Valkey configured, all
workers share the counters and fall back to in-memory counting while Valkey is
unreachable.

Limits count per client address: the first ``X-Forwarded-For`` hop when the
request comes from a trusted proxy (loopback or ``TRUSTED_PROXY_CIDRS``),
otherwise the direct peer.
"""

import ipaddress
import logging
import os

from fastapi import Request

logger = logging.getLogger(__name__)


def limiter_storage_options() -> dict:
    url = os.getenv("REDIS_URL")
    if not url:
        return {}
    return {"storage_uri": url, "in_memory_fallback_enabled": True}


def _trusted_proxy_networks() -> list[ipaddress._BaseNetwork]:
    raw_networks = os.getenv("TRUSTED_PROXY_CIDRS", "").replace(";", ",").split(",")
    networks = ["127.0.0.0/8", "::1/128", *(value.strip() for value in raw_networks if value.strip())]
    parsed = []
    for value in networks:
        try:
            parsed.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid TRUSTED_PROXY_CIDRS entry")
    return parsed


def _client_ip_is_trusted_proxy(client_host: str | None) -> bool:
    if not client_host:
        return False
    try:
        client_ip = ipaddress.ip_address(client_host)
    except ValueError:
        return False
    return any(client_ip in network for network in _trusted_proxy_networks())


def rate_limit_key(request: Request) -> str:
    client_host = request.client.host if request.client else ""
    if _client_ip_is_trusted_proxy(client_host):
        forwarded_for = request.headers.get("x-forwarded-for", "")
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            try:
                ipaddress.ip_address(first_hop)
                return first_hop
            except ValueError:
                pass
    return client_host or "unknown"
