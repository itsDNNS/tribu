"""Shared storage for request rate limits.

Each backend worker would otherwise count on its own, so several workers would
multiply every limit (for example login attempts). With Valkey configured, all
workers share the counters and fall back to in-memory counting while Valkey is
unreachable.

Limits count per client address: when the request comes from a trusted proxy
(loopback or ``TRUSTED_PROXY_CIDRS``), the last ``X-Forwarded-For`` hop that
isn't a trusted proxy, otherwise the direct peer.
"""

import ipaddress
import logging
import os

from fastapi import Request

from app.core.config import env_list

logger = logging.getLogger(__name__)


def limiter_storage_options() -> dict:
    url = os.getenv("REDIS_URL")
    if not url:
        return {}
    return {"storage_uri": url, "in_memory_fallback_enabled": True}


def _trusted_proxy_networks() -> list[ipaddress._BaseNetwork]:
    networks = ["127.0.0.0/8", "::1/128", *env_list("TRUSTED_PROXY_CIDRS")]
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
    """The client's address: from a trusted proxy, the last ``X-Forwarded-For`` hop that isn't one.

    Proxies append to the header, so only the hops on the right were added by
    them; anything further left may come from the client.
    """
    address = request.client.host if request.client else ""
    if _client_ip_is_trusted_proxy(address):
        for hop in reversed(request.headers.get("x-forwarded-for", "").split(",")):
            hop = hop.strip()
            try:
                ipaddress.ip_address(hop)
            except ValueError:
                break
            address = hop
            if not _client_ip_is_trusted_proxy(hop):
                break
    return address or "unknown"
