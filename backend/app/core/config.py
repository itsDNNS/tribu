import os

from app.core.versioning import resolve_app_version
from app.security import JWT_EXPIRE_HOURS

VERSION = resolve_app_version()

COOKIE_NAME = "tribu_token"
COOKIE_MAX_AGE = JWT_EXPIRE_HOURS * 3600
COOKIE_SECURE = os.getenv("SECURE_COOKIES", "false").lower() == "true"
