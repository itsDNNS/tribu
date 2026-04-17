"""Build a ready-to-mount Radicale WSGI application.

Phase A uses Radicale's ``multifilesystem`` storage in a configurable
folder so the HTTP plumbing, PAT auth plugin, and scope-aware rights
plugin can be exercised end-to-end. The follow-up phases replace the
storage type with a custom plugin that projects Tribu's
``calendar_events`` and ``contacts`` tables.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from radicale.app import Application
from radicale.config import Configuration, DEFAULT_CONFIG_SCHEMA

from .auth_plugin import Auth
from .caldav_storage import Storage as CalDAVStorage
from .rights_plugin import Rights


DEFAULT_STORAGE_FOLDER = "./radicale-data"

logger = logging.getLogger(__name__)


def _resolve_storage_folder() -> str:
    """Pick a safe-by-default storage folder and warn if it is unset.

    Radicale's storage folder must not be world-readable because it
    holds raw iCalendar/vCard payloads. We default to a project-local
    directory (``./radicale-data``) that Docker volumes and backup
    tooling can mount, and log a warning when no explicit
    ``DAV_STORAGE_FOLDER`` is configured so operators notice.
    """
    configured = os.environ.get("DAV_STORAGE_FOLDER")
    if configured:
        return configured
    logger.warning(
        "DAV_STORAGE_FOLDER is not set; falling back to %r. Override "
        "this in production so the DAV payloads live on a persistent "
        "and permission-restricted volume.",
        DEFAULT_STORAGE_FOLDER,
    )
    return DEFAULT_STORAGE_FOLDER


def _prepare_storage_folder(folder: str) -> None:
    path = Path(folder)
    path.mkdir(parents=True, exist_ok=True)
    try:
        path.chmod(0o700)
    except PermissionError:
        # On bind-mounted volumes chmod may fail; do not abort startup,
        # just let Radicale's folder_umask keep new files restricted.
        logger.info("Could not chmod 0700 on %s (continuing)", folder)


def _build_configuration() -> Configuration:
    storage_folder = _resolve_storage_folder()
    _prepare_storage_folder(storage_folder)

    configuration = Configuration(DEFAULT_CONFIG_SCHEMA)
    configuration.update({
        "auth": {
            # Pass the class itself. Radicale supports str_or_callable here
            # so no setuptools entry point or module string is needed.
            "type": Auth,
            "cache_logins": False,
            # Keep the realm human-readable in client dialogs.
            "realm": "Tribu",
            # iOS Calendar/Contacts sends URL-encoded user names
            # (``user%40example.com``). Turn them back into plain
            # ``user@example.com`` before the auth plugin sees them.
            "urldecode_username": True,
        },
        "rights": {
            # Scope-aware rights plugin: maps PAT scopes to Radicale
            # read/write permissions so a ``calendar:read`` token can
            # only read.
            "type": Rights,
        },
        "storage": {
            # DB-backed storage plugin that surfaces each Tribu family
            # the authenticated user belongs to as one CalDAV
            # calendar collection. ``filesystem_folder`` stays set as
            # Radicale's schema insists on a filesystem path; the
            # plugin never writes to it.
            "type": CalDAVStorage,
            "filesystem_folder": storage_folder,
            "folder_umask": "0o077",
        },
        "logging": {
            "level": os.environ.get("DAV_LOG_LEVEL", "warning"),
        },
    }, "tribu-dav", privileged=True)
    return configuration


def build_radicale_app() -> Application:
    """Instantiate the embedded Radicale application."""
    return Application(_build_configuration())
