"""Build the ready-to-mount Radicale WSGI application."""
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
    """Folder handed to Radicale's ``filesystem_folder`` setting.

    Radicale's configuration schema requires a filesystem path, but Tribu's
    storage plugin keeps all calendar and contact data in the database and
    never writes to it, so the folder needs no persistent volume.
    ``DAV_STORAGE_FOLDER`` can still move it elsewhere.
    """
    return os.environ.get("DAV_STORAGE_FOLDER") or DEFAULT_STORAGE_FOLDER


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
            # Families own their DAV collections. Item DELETE remains
            # available, but Radicale rejects collection DELETE before
            # it reaches storage.
            "permit_delete_collection": False,
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
