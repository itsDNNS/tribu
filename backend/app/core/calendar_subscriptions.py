"""Safe HTTP(S) fetch for external ICS subscription URLs.

Used by the calendar subscribe-ics endpoint. The helper enforces three
guarantees so a tenant-supplied URL cannot become a server-side request
oracle:

* Only ``http`` and ``https`` schemes resolve. ``file://`` and friends
  raise before any I/O happens.
* Redirects are not followed. An external feed URL that 302s to a
  different host would otherwise let an attacker steer Tribu's outbound
  request after validation.
* The response body is capped (1 MiB) so a hostile endpoint cannot
  exhaust memory by streaming gigabytes.

Errors surface as ``IcsSubscriptionError`` whose message is short and
user-safe; the caller maps them to a 400 without echoing transport
internals back to the API consumer.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import urllib.parse


_MAX_ICS_BYTES = 1024 * 1024  # 1 MiB
_FETCH_TIMEOUT = 10.0
_USER_AGENT = "tribu-calendar-subscription/1.0"


class IcsSubscriptionError(Exception):
    """Raised by ``fetch_ics_text`` for any user-visible fetch failure.

    Messages are always short, generic strings — the router relays them
    verbatim to the API caller, so they must never embed network or
    parser internals.
    """


def _parse_subscription_url(url: str) -> urllib.parse.ParseResult:
    if not url or not url.strip():
        raise IcsSubscriptionError("Subscription URL is required")
    try:
        parsed = urllib.parse.urlparse(url.strip())
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        raise IcsSubscriptionError("Subscription URL is invalid") from None
    if parsed.scheme not in ("http", "https"):
        raise IcsSubscriptionError("Subscription URL must use http or https")
    if not parsed.netloc or not hostname:
        raise IcsSubscriptionError("Subscription URL is missing a host")
    return parsed


def validate_subscription_url(url: str) -> str:
    """Return the trimmed URL or raise ``IcsSubscriptionError``."""
    return urllib.parse.urlunparse(_parse_subscription_url(url))


def _is_disallowed_ip(raw_ip: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw_ip)
    except ValueError:
        return True
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or getattr(ip, "is_site_local", False)
        or not ip.is_global
    )


def _public_addrinfo(parsed: urllib.parse.ParseResult) -> tuple[int, int, int, tuple]:
    """Resolve once and return a public route target for the outbound request."""
    hostname = parsed.hostname
    if not hostname:
        raise IcsSubscriptionError("Subscription URL is missing a host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError:
        raise IcsSubscriptionError("Subscription URL host could not be resolved") from None
    if not addresses:
        raise IcsSubscriptionError("Subscription URL host could not be resolved")

    public_addresses = []
    for family, socktype, proto, _canonname, sockaddr in addresses:
        if family not in (socket.AF_INET, socket.AF_INET6):
            continue
        if _is_disallowed_ip(sockaddr[0]):
            continue
        public_addresses.append((family, socktype, proto, sockaddr))

    if not public_addresses:
        raise IcsSubscriptionError("Subscription URL host is not allowed")
    return public_addresses[0]


def hostname_from_url(url: str) -> str:
    """Return the hostname for default labels, or empty string on failure."""
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except ValueError:
        return ""


def _read_limited_response(resp: http.client.HTTPResponse, max_bytes: int) -> bytes:
    body = resp.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise IcsSubscriptionError(
            f"Subscription feed exceeds {max_bytes} bytes; refusing to import"
        )
    return body


def fetch_ics_text(
    url: str,
    *,
    max_bytes: int = _MAX_ICS_BYTES,
    timeout: float = _FETCH_TIMEOUT,
) -> str:
    """Fetch ``url`` and return its body as text.

    Raises ``IcsSubscriptionError`` for invalid URLs, transport errors,
    timeouts, oversize bodies, and decoding failures. The exception
    message is safe to relay to API users.
    """
    target = validate_subscription_url(url)
    parsed = _parse_subscription_url(target)
    family, socktype, proto, sockaddr = _public_addrinfo(parsed)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = urllib.parse.urlunparse(("", "", parsed.path or "/", parsed.params, parsed.query, ""))
    headers = {"Accept": "text/calendar, text/plain", "User-Agent": _USER_AGENT}
    if parsed.port:
        headers["Host"] = f"{host}:{port}"
    else:
        headers["Host"] = host

    sock = None
    conn = None
    try:
        sock = socket.socket(family, socktype, proto)
        sock.settimeout(timeout)
        sock.connect(sockaddr)
        if parsed.scheme == "https":
            context = ssl.create_default_context()
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            sock = context.wrap_socket(sock, server_hostname=host)
            conn = http.client.HTTPSConnection(host, port=port, timeout=timeout)
        else:
            conn = http.client.HTTPConnection(host, port=port, timeout=timeout)
        conn.sock = sock
        sock = None
        conn.request("GET", path, headers=headers)
        resp = conn.getresponse()
        if 300 <= resp.status < 400:
            raise IcsSubscriptionError("Subscription URL redirects are not allowed")
        if resp.status >= 400:
            raise IcsSubscriptionError(f"Subscription URL returned HTTP {resp.status}")
        body = _read_limited_response(resp, max_bytes)
    except IcsSubscriptionError:
        raise
    except TimeoutError:
        raise IcsSubscriptionError("Subscription URL timed out") from None
    except (OSError, http.client.HTTPException, ssl.SSLError):
        raise IcsSubscriptionError("Subscription URL is unreachable") from None
    finally:
        if conn is not None:
            conn.close()
        if sock is not None:
            sock.close()

    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return body.decode("latin-1")
        except UnicodeDecodeError:
            raise IcsSubscriptionError(
                "Subscription feed is not valid UTF-8 or Latin-1 text"
            ) from None
