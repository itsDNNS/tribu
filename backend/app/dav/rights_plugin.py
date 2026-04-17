"""Radicale rights plugin gated by Tribu PAT scopes.

Radicale's stock ``owner_only`` plugin gives the authenticated user full
read/write access to every collection under ``/<user>/``. That means a
PAT with only ``calendar:read`` could still write to calendars and
address books once it passed the auth admission gate. This plugin
tightens that by reading the PAT scopes captured by the auth plugin
(on a ``threading.local``) and returning only the permissions the
scopes actually grant:

* ``*`` -> ``rRwW`` (full).
* any ``calendar:write`` / ``contacts:write`` -> ``rRwW`` (full).
* any ``calendar:read`` / ``contacts:read`` -> ``rR`` (read only).
* otherwise -> ``""`` (denied).

Per-protocol differentiation (e.g. a token with only ``calendar:read``
should still be blocked from the address book) requires knowing each
collection's tag (VCALENDAR vs VADDRESSBOOK). That knowledge lives in
the storage plugin and is enforced in Phase B / C.
"""
from __future__ import annotations

import threading
from typing import Set

from radicale.rights import BaseRights


# Thread-local context populated by the auth plugin for each request.
_context = threading.local()


def remember_scopes(user: str, scopes: Set[str]) -> None:
    """Record the authenticated user's PAT scopes for the current thread."""
    _context.user = user
    _context.scopes = set(scopes)


def forget_scopes() -> None:
    for attr in ("user", "scopes"):
        if hasattr(_context, attr):
            delattr(_context, attr)


READ_SCOPES = {"calendar:read", "calendar:write", "contacts:read", "contacts:write"}
WRITE_SCOPES = {"calendar:write", "contacts:write"}


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
        if "*" in scopes or (scopes & WRITE_SCOPES):
            return "rRwW"
        if scopes & READ_SCOPES:
            return "rR"
        return ""
