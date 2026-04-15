"""Tests for PAT scope enforcement on all authenticated endpoints.

Verifies that every endpoint that was previously missing require_scope()
now has the correct scope parameter in its function signature.
"""

import inspect

import pytest


def _get_scope_string(func):
    """Extract the scope string from a require_scope() default parameter."""
    params = inspect.signature(func).parameters
    assert "_scope" in params, f"{func.__name__} is missing _scope parameter"
    default = params["_scope"].default
    # require_scope() returns Depends(_check), _check has scope in closure
    closure = default.dependency.__closure__
    return closure[0].cell_contents if closure else None


class TestBackupRouterScopes:
    def test_get_config_scope(self):
        from app.modules.backup_router import get_config
        assert _get_scope_string(get_config) == "admin:read"

    def test_update_config_scope(self):
        from app.modules.backup_router import update_config
        assert _get_scope_string(update_config) == "admin:write"

    def test_trigger_backup_scope(self):
        from app.modules.backup_router import trigger_backup
        assert _get_scope_string(trigger_backup) == "admin:write"

    def test_list_all_backups_scope(self):
        from app.modules.backup_router import list_all_backups
        assert _get_scope_string(list_all_backups) == "admin:read"

    def test_download_backup_scope(self):
        from app.modules.backup_router import download_backup
        assert _get_scope_string(download_backup) == "admin:read"

    def test_delete_single_backup_scope(self):
        from app.modules.backup_router import delete_single_backup
        assert _get_scope_string(delete_single_backup) == "admin:write"


class TestNavRouterScopes:
    def test_get_nav_order_scope(self):
        from app.modules.nav_router import get_nav_order
        assert _get_scope_string(get_nav_order) == "profile:read"

    def test_update_nav_order_scope(self):
        from app.modules.nav_router import update_nav_order
        assert _get_scope_string(update_nav_order) == "profile:write"


class TestNotificationsRouterScopes:
    def test_list_notifications_has_scope(self):
        from app.modules.notifications_router import list_notifications
        params = inspect.signature(list_notifications).parameters
        assert "_scope" in params

    def test_unread_count_has_scope(self):
        from app.modules.notifications_router import unread_count
        params = inspect.signature(unread_count).parameters
        assert "_scope" in params

    def test_mark_read_has_scope(self):
        from app.modules.notifications_router import mark_read
        params = inspect.signature(mark_read).parameters
        assert "_scope" in params

    def test_mark_all_read_has_scope(self):
        from app.modules.notifications_router import mark_all_read
        params = inspect.signature(mark_all_read).parameters
        assert "_scope" in params

    def test_delete_notification_has_scope(self):
        from app.modules.notifications_router import delete_notification
        params = inspect.signature(delete_notification).parameters
        assert "_scope" in params

    def test_notification_stream_has_scope(self):
        from app.modules.notifications_router import notification_stream
        params = inspect.signature(notification_stream).parameters
        assert "_scope" in params

    def test_push_subscribe_has_scope(self):
        from app.modules.notifications_router import push_subscribe
        params = inspect.signature(push_subscribe).parameters
        assert "_scope" in params

    def test_push_unsubscribe_has_scope(self):
        from app.modules.notifications_router import push_unsubscribe
        params = inspect.signature(push_unsubscribe).parameters
        assert "_scope" in params

    def test_get_preferences_has_scope(self):
        from app.modules.notifications_router import get_preferences
        params = inspect.signature(get_preferences).parameters
        assert "_scope" in params

    def test_update_preferences_has_scope(self):
        from app.modules.notifications_router import update_preferences
        params = inspect.signature(update_preferences).parameters
        assert "_scope" in params


class TestAdminSettingsScopes:
    def test_get_base_url_scope(self):
        from app.modules.invitations_router import get_base_url
        assert _get_scope_string(get_base_url) == "admin:read"

    def test_set_base_url_scope(self):
        from app.modules.invitations_router import set_base_url
        assert _get_scope_string(set_base_url) == "admin:write"

    def test_get_time_format_scope(self):
        from app.modules.invitations_router import get_time_format
        assert _get_scope_string(get_time_format) == "admin:read"

    def test_set_time_format_scope(self):
        from app.modules.invitations_router import set_time_format
        assert _get_scope_string(set_time_format) == "admin:write"


class TestAuthEndpointScopes:
    def test_change_password_scope(self):
        from app.main import change_password
        assert _get_scope_string(change_password) == "profile:write"


class TestScopeLogicUnit:
    """Unit test require_scope logic directly."""

    def test_insufficient_scope_raises_403(self):
        from unittest.mock import MagicMock
        from fastapi import HTTPException
        from app.core.scopes import require_scope

        check = require_scope("profile:write")
        # Extract the actual check function from Depends
        check_fn = check.dependency

        request = MagicMock()
        request.state.pat_scopes = {"profile:read"}  # has read, not write

        with pytest.raises(HTTPException) as exc_info:
            check_fn(request)
        assert exc_info.value.status_code == 403

    def test_matching_scope_passes(self):
        from unittest.mock import MagicMock
        from app.core.scopes import require_scope

        check = require_scope("profile:write")
        check_fn = check.dependency

        request = MagicMock()
        request.state.pat_scopes = {"profile:write", "profile:read"}

        # Should not raise
        check_fn(request)

    def test_wildcard_scope_passes(self):
        from unittest.mock import MagicMock
        from app.core.scopes import require_scope

        check = require_scope("families:write")
        check_fn = check.dependency

        request = MagicMock()
        request.state.pat_scopes = {"*"}

        # Wildcard should pass any scope
        check_fn(request)

    def test_jwt_auth_no_scope_restriction(self):
        from unittest.mock import MagicMock
        from app.core.scopes import require_scope

        check = require_scope("families:write")
        check_fn = check.dependency

        request = MagicMock()
        request.state.pat_scopes = None  # JWT auth

        # Should not raise - JWT has no scope restrictions
        check_fn(request)
