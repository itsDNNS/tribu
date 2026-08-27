"""Radicale rights plugin gated by Tribu PAT scopes.

Radicale's stock ``owner_only`` plugin gives the authenticated user full
read/write access to every collection under ``/<user>/``. That means a
PAT with only ``calendar:read`` could still write to calendars and
address books once it passed the auth admission gate. This plugin
tightens that by reading the PAT scopes captured by the auth plugin
(on a ``threading.local``) and returning only the permissions the
scopes actually grant:

* ``*`` -> ``rRwW`` for the existing calendar/contact collections only.
* any ``calendar:write`` / ``contacts:write`` -> ``rRwW`` (full).
* any ``calendar:read`` / ``contacts:read`` -> ``rR`` (read only).
* otherwise -> ``""`` (denied).

Collection prefixes distinguish calendar from contact access. Family IDs
captured by the auth plugin ensure those permissions never extend beyond
the authenticated user's memberships.
"""
from __future__ import annotations

import threading
from typing import Set

from radicale.rights import BaseRights


# Thread-local context populated by the auth plugin for each request.
_context = threading.local()


def remember_scopes(
    user: str,
    user_id: int,
    scopes: Set[str],
    family_ids: Set[int],
) -> None:
    """Record the authenticated user's DAV context for the current thread.

    The storage plugin reads ``user_id`` out of the same context when it
    needs to stamp ``created_by_user_id`` on a row written via PUT.
    """
    _context.user = user
    _context.user_id = user_id
    _context.scopes = set(scopes)
    _context.family_ids = {int(family_id) for family_id in family_ids}


def current_user_id() -> int:
    """Return the authenticated principal's user id for the current thread.

    Raises ``RuntimeError`` if the auth plugin has not populated the
    context, which means the caller reached here without going through
    auth (should never happen in a correctly wired Radicale pipeline).
    """
    user_id = getattr(_context, "user_id", None)
    if user_id is None:
        raise RuntimeError("DAV request has no authenticated user in context")
    return user_id


def current_user_login() -> str:
    """Return the authenticated principal email for the current thread."""
    user = getattr(_context, "user", None)
    if not user:
        raise RuntimeError("DAV request has no authenticated user in context")
    return str(user)


def current_scopes() -> Set[str]:
    """Return a defensive copy of the authenticated PAT's literal scopes."""
    return set(getattr(_context, "scopes", set()))


def forget_scopes() -> None:
    for attr in ("user", "user_id", "scopes", "family_ids"):
        if hasattr(_context, attr):
            delattr(_context, attr)


CALENDAR_READ_SCOPES = {"calendar:read", "calendar:write"}
CALENDAR_WRITE_SCOPES = {"calendar:write"}
CONTACTS_READ_SCOPES = {"contacts:read", "contacts:write"}
CONTACTS_WRITE_SCOPES = {"contacts:write"}
TASK_READ_SCOPES = {"tasks:read", "tasks:write"}
TASK_WRITE_SCOPES = {"tasks:write"}


def _collection_family(segment: str) -> tuple[str | None, int | None]:
    """Parse an exact Tribu collection segment into kind and family id."""
    for prefix, kind in (("cal-", "calendar"), ("book-", "contacts"), ("task-", "tasks")):
        if not segment.startswith(prefix):
            continue
        suffix = segment[len(prefix) :]
        if not suffix or not suffix.isascii() or not suffix.isdecimal():
            return None, None
        try:
            return kind, int(suffix)
        except ValueError:
            # Python limits extremely long integer conversions. Treat
            # such untrusted path segments like every other invalid ID.
            return None, None
    return None, None


class Rights(BaseRights):
    def authorization(self, user: str, path: str) -> str:  # noqa: D401
        if not user:
            return ""
        ctx_user = getattr(_context, "user", None)
        if ctx_user is None or ctx_user.casefold() != user.casefold():
            return ""
        parts = [p for p in path.split("/") if p]
        # Only the authenticated principal may enter their own namespace.
        if parts and parts[0].casefold() != user.casefold():
            return ""
        scopes: Set[str] = getattr(_context, "scopes", set())
        if not parts:
            # Root discovery is read-only for anyone authenticated.
            return "R"
        if len(parts) == 1:
            # The principal home itself carries no data. Always let
            # Radicale auto-provision it so a read-only client still
            # gets a usable PROPFIND on first contact; actual
            # collection writes are gated below.
            return "RW"
        collection = parts[1] if len(parts) > 1 else ""
        kind, family_id = _collection_family(collection)
        family_ids: Set[int] = getattr(_context, "family_ids", set())
        if kind is None or family_id is None or family_id not in family_ids:
            return ""
        if kind == "tasks":
            # Deliberately literal: legacy wildcard PATs must never discover
            # or access VTODO collections.
            if scopes & TASK_WRITE_SCOPES:
                return "rRwW"
            if scopes & TASK_READ_SCOPES:
                return "rR"
            return ""

        if "*" in scopes:
            return "rRwW"

        if kind == "calendar":
            if scopes & CALENDAR_WRITE_SCOPES:
                return "rRwW"
            if scopes & CALENDAR_READ_SCOPES:
                return "rR"
            return ""
        if kind == "contacts":
            if scopes & CONTACTS_WRITE_SCOPES:
                return "rRwW"
            if scopes & CONTACTS_READ_SCOPES:
                return "rR"
            return ""
        return ""
