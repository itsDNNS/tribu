import os

from app.security import JWT_EXPIRE_HOURS

VERSION = "0.8.0"

COOKIE_NAME = "tribu_token"
COOKIE_MAX_AGE = JWT_EXPIRE_HOURS * 3600
COOKIE_SECURE = os.getenv("SECURE_COOKIES", "false").lower() == "true"
