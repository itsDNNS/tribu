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

from typing import Optional

from radicale.auth import BaseAuth
from radicale.log import logger

from app.core.clock import utcnow
from app.core.scopes import has_scope, parse_scopes
from app.database import SessionLocal
from app.models import PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_pat, pat_lookup_key, verify_pat
from .rights_plugin import remember_scopes


DAV_SCOPES = ("calendar:read", "calendar:write", "contacts:read", "contacts:write")


def _record_dav_failure(pat: PersonalAccessToken, reason: str) -> None:
    pat.last_dav_failure_at = utcnow()
    pat.last_dav_failure_reason = reason


def _record_dav_success(pat: PersonalAccessToken) -> None:
    pat.last_dav_success_at = utcnow()
    pat.last_dav_failure_at = None
    pat.last_dav_failure_reason = None


class Auth(BaseAuth):
    """Radicale auth plugin backed by Tribu's PAT table.

    The login string is the user's email; the password is the raw PAT
    the client was given (``tribu_pat_…``). An authenticated user is
    represented to Radicale by their email, which Radicale uses as
    the collection namespace root (``/<email>/…``).
    """

    def _login(self, login: str, password: str) -> str:
        # The ``password`` argument here carries a Personal Access
        # Token (``tribu_pat_<random>``), not a user-chosen secret.
        # PATs are high-entropy random bytes generated via
        # ``secrets.token_urlsafe`` and are already stored hashed in
        # the database, so SHA-256 via ``hash_pat`` is the correct
        # comparison primitive. We rebind to ``token`` before hashing
        # so nothing named ``password`` flows into the hash function;
        # computationally expensive KDFs are only appropriate for
        # low-entropy user passwords, which is not this code path.
        if not login or not password:
            return ""
        token = password
        if not token.startswith(PAT_PREFIX):
            return ""
        with _session() as db:
            pat: Optional[PersonalAccessToken] = (
                db.query(PersonalAccessToken)
                .filter(PersonalAccessToken.token_lookup == pat_lookup_key(token))
                .first()
            )
            if pat is None:
                return ""
            if pat.expires_at is not None and pat.expires_at < utcnow():
                _record_dav_failure(pat, "token_expired")
                db.commit()
                return ""
            if not verify_pat(token, pat.token_hash):
                _record_dav_failure(pat, "auth_failed")
                db.commit()
                return ""
            user = db.query(User).filter(User.id == pat.user_id).first()
            if user is None:
                _record_dav_failure(pat, "auth_failed")
                db.commit()
                return ""
            if (user.email or "").casefold() != (login or "").casefold():
                _record_dav_failure(pat, "auth_failed")
                db.commit()
                return ""
            granted = parse_scopes(pat.scopes or "")
            if not any(has_scope(granted, s) for s in DAV_SCOPES):
                logger.info("DAV PAT for %r lacks any DAV scope", user.email)
                _record_dav_failure(pat, "scope_mismatch")
                db.commit()
                return ""
            # Lazy-migrate legacy SHA-256 rows to bcrypt. token_lookup
            # already matches (migration 0027 backfilled it from
            # token_hash), so nothing more to write on the index side.
            if not pat.token_hash.startswith("$2"):
                pat.token_hash = hash_pat(token)
            pat.last_used_at = utcnow()
            _record_dav_success(pat)
            db.commit()
            # Hand the scope set to the rights plugin. The two plugins
            # run back-to-back on the same thread per request, so a
            # threading.local context is the narrowest handoff that
            # does not require patching Radicale's plugin contract.
            remember_scopes(user.email, user.id, granted)
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
