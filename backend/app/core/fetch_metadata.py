"""Block cookie-authenticated requests that another site starts.

SameSite=Lax cookies still travel with requests from other apps on the
same host or a sibling subdomain, because browsers treat those as the
same site. Fetch Metadata headers tell them apart. Requests without
these headers (native apps, DAV and calendar clients, older browsers)
and requests that carry no session cookie are not affected.
"""

from collections.abc import Container, Mapping

from app.core.config import COOKIE_NAME, REFRESH_COOKIE_NAME, env_list

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _configured_origins() -> set[str]:
    # Origins an admin listed for direct backend access may use the session cookie.
    return set(env_list("CORS_ALLOWED_ORIGINS"))


def is_foreign_cookie_request(method: str, headers: Mapping[str, str], cookies: Container[str]) -> bool:
    if COOKIE_NAME not in cookies and REFRESH_COOKIE_NAME not in cookies:
        return False
    if headers.get("sec-fetch-site") in (None, "same-origin", "none"):
        return False
    if headers.get("origin") in _configured_origins():
        return False
    # Following a link or an OIDC redirect back to Tribu is a top-level GET navigation.
    return not (method in SAFE_METHODS and headers.get("sec-fetch-mode") == "navigate")
