"""Build a ready-to-mount Radicale WSGI application.

Phase A uses Radicale's ``multifilesystem`` storage in a configurable
folder (``DAV_STORAGE_FOLDER``, defaults to ``/tmp/tribu-dav``) so the
HTTP plumbing and PAT auth plugin can be exercised end-to-end. The
follow-up phases replace the storage type with a custom plugin that
projects Tribu's ``calendar_events`` and ``contacts`` tables.
"""
from __future__ import annotations

import os
from pathlib import Path

from radicale.app import Application
from radicale.config import Configuration, DEFAULT_CONFIG_SCHEMA

from .auth_plugin import Auth


DEFAULT_STORAGE_FOLDER = "/tmp/tribu-dav"


def _build_configuration() -> Configuration:
    storage_folder = os.environ.get("DAV_STORAGE_FOLDER", DEFAULT_STORAGE_FOLDER)
    Path(storage_folder).mkdir(parents=True, exist_ok=True)

    configuration = Configuration(DEFAULT_CONFIG_SCHEMA)
    configuration.update({
        "auth": {
            # Pass the class itself. Radicale supports str_or_callable here
            # so no setuptools entry point or module string is needed.
            "type": Auth,
            "cache_logins": False,
            # Keep the realm human-readable in client dialogs.
            "realm": "Tribu",
        },
        "rights": {
            # Each authenticated user only sees their own collection tree
            # (/<user>/...). Family-scoped sharing lands with the storage
            # plugin.
            "type": "owner_only",
        },
        "storage": {
            "type": "multifilesystem",
            "filesystem_folder": storage_folder,
        },
        "logging": {
            "level": os.environ.get("DAV_LOG_LEVEL", "warning"),
        },
    }, "tribu-dav", privileged=True)
    return configuration


def build_radicale_app() -> Application:
    """Instantiate the embedded Radicale application."""
    return Application(_build_configuration())
