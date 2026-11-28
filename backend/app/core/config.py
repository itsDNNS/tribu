import os

from app.core.versioning import resolve_app_version
from app.security import JWT_EXPIRE_HOURS

VERSION = resolve_app_version()

COOKIE_NAME = "tribu_token"
COOKIE_MAX_AGE = JWT_EXPIRE_HOURS * 3600
REFRESH_COOKIE_NAME = "tribu_refresh"
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
REFRESH_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "auto").strip().lower()


def env_int(name: str, default: int) -> int:
    """A positive whole number from an environment variable; ``default`` when it is unset, not a number or below 1."""
    try:
        value = int(os.getenv(name) or default)
    except ValueError:
        return default
    return value if value > 0 else default


def env_list(name: str) -> list[str]:
    """The comma- or semicolon-separated values of an environment variable, without blanks."""
    return [part.strip() for part in os.getenv(name, "").replace(";", ",").split(",") if part.strip()]
