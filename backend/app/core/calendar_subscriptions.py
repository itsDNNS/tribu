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

import urllib.error
import urllib.parse
import urllib.request


_MAX_ICS_BYTES = 1024 * 1024  # 1 MiB
_FETCH_TIMEOUT = 10.0
_USER_AGENT = "tribu-calendar-subscription/1.0"


class IcsSubscriptionError(Exception):
    """Raised by ``fetch_ics_text`` for any user-visible fetch failure.

    Messages are always short, generic strings — the router relays them
    verbatim to the API caller, so they must never embed network or
    parser internals.
    """


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code, "Redirect not allowed", headers, fp
        )


_strict_opener = urllib.request.build_opener(
    urllib.request.HTTPHandler(),
    urllib.request.HTTPSHandler(),
    _NoRedirectHandler(),
)


def validate_subscription_url(url: str) -> str:
    """Return the trimmed URL or raise ``IcsSubscriptionError``."""
    if not url or not url.strip():
        raise IcsSubscriptionError("Subscription URL is required")
    trimmed = url.strip()
    parsed = urllib.parse.urlparse(trimmed)
    if parsed.scheme not in ("http", "https"):
        raise IcsSubscriptionError("Subscription URL must use http or https")
    if not parsed.netloc:
        raise IcsSubscriptionError("Subscription URL is missing a host")
    return trimmed


def hostname_from_url(url: str) -> str:
    """Return the hostname for default labels, or empty string on failure."""
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except ValueError:
        return ""


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
    req = urllib.request.Request(
        target,
        headers={"Accept": "text/calendar, text/plain", "User-Agent": _USER_AGENT},
    )
    try:
        with _strict_opener.open(req, timeout=timeout) as resp:
            body = resp.read(max_bytes + 1)
    except urllib.error.HTTPError as exc:
        raise IcsSubscriptionError(
            f"Subscription URL returned HTTP {exc.code}"
        ) from exc
    except urllib.error.URLError:
        raise IcsSubscriptionError("Subscription URL is unreachable") from None
    except TimeoutError:
        raise IcsSubscriptionError("Subscription URL timed out") from None
    except OSError:
        raise IcsSubscriptionError("Subscription URL is unreachable") from None

    if len(body) > max_bytes:
        raise IcsSubscriptionError(
            f"Subscription feed exceeds {max_bytes} bytes; refusing to import"
        )

    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return body.decode("latin-1")
        except UnicodeDecodeError:
            raise IcsSubscriptionError(
                "Subscription feed is not valid UTF-8 or Latin-1 text"
            ) from None
