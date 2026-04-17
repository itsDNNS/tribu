"""Radicale auth plugin that validates Personal Access Tokens.

DAV clients (iOS Calendar, iOS Contacts, DAVx5 on Android) authenticate
via HTTP Basic Auth. They send the user's email as ``login`` and the
Personal Access Token as ``password``. This plugin validates the
token against ``personal_access_tokens`` and confirms the token's
owner matches the login email. It also enforces scope: the token
must carry at least one of ``calendar:read``, ``calendar:write``,
``contacts:read``, ``contacts:write`` (or the ``*`` wildcard). This
is a coarse gate; per-collection scope enforcement lands with the
storage plugin in the next phases.
"""
from __future__ import annotations

import hashlib
from typing import Optional

from radicale.auth import BaseAuth
from radicale.log import logger

from app.core.clock import utcnow
from app.core.scopes import has_scope, parse_scopes
from app.database import SessionLocal
from app.dav import rights_plugin
from app.models import PersonalAccessToken, User
from app.security import PAT_PREFIX


DAV_SCOPES = ("calendar:read", "calendar:write", "contacts:read", "contacts:write")


class Auth(BaseAuth):
    """Radicale auth plugin backed by Tribu's PAT table.

    The login string is the user's email; the password is the raw PAT
    the client was given (``tribu_pat_…``). An authenticated user is
    represented to Radicale by their email, which Radicale uses as
    the collection namespace root (``/<email>/…``).
    """

    def _login(self, login: str, password: str) -> str:
        if not login or not password:
            return ""
        if not password.startswith(PAT_PREFIX):
            return ""
        token_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        with _session() as db:
            pat: Optional[PersonalAccessToken] = (
                db.query(PersonalAccessToken)
                .filter(PersonalAccessToken.token_hash == token_hash)
                .first()
            )
            if pat is None:
                return ""
            if pat.expires_at is not None and pat.expires_at < utcnow():
                return ""
            user = db.query(User).filter(User.id == pat.user_id).first()
            if user is None:
                return ""
            if (user.email or "").casefold() != (login or "").casefold():
                return ""
            granted = parse_scopes(pat.scopes or "")
            if not any(has_scope(granted, s) for s in DAV_SCOPES):
                logger.info("DAV PAT for %r lacks any DAV scope", user.email)
                return ""
            pat.last_used_at = utcnow()
            db.commit()
            # Hand the scope set to the rights plugin. The two plugins
            # run back-to-back on the same thread per request, so a
            # threading.local context is the narrowest handoff that
            # does not require patching Radicale's plugin contract.
            rights_plugin.remember_scopes(user.email, granted)
            return user.email


def _session():
    """Thin context manager around ``SessionLocal`` for the auth plugin."""
    class _Ctx:
        def __enter__(self):
            self._db = SessionLocal()
            return self._db

        def __exit__(self, exc_type, exc, tb):
            self._db.close()
            return False

    return _Ctx()
