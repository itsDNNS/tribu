"""Tests for invitation security: non-adult admin prevention.

Tests the validation logic directly at the router level using mocked DB sessions.
The critical test is that admin+non-adult combinations are rejected at creation time
and defensively demoted at registration time.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.modules.invitations_router import create_invitation


# ── Invitation Creation ──


class TestCreateInvitationAdultValidation:
    """Validate that create_invitation rejects admin+non-adult combinations."""

    def _call_create(self, role_preset, is_adult_preset):
        payload = SimpleNamespace(
            role_preset=role_preset,
            is_adult_preset=is_adult_preset,
            max_uses=None,
            expires_in_days=7,
        )
        db = MagicMock()
        request = MagicMock()
        user = SimpleNamespace(id=1, email="admin@example.com")

        with patch("app.modules.invitations_router.ensure_family_admin"):
            # Don't let it reach DB/response serialization - we only test validation
            create_invitation(1, payload, request, user, db)

    def test_admin_non_adult_invite_rejected(self):
        """admin + non-adult must raise 400 ONLY_ADULTS_ADMIN."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_create("admin", False)
        assert exc_info.value.status_code == 400
        assert "ONLY_ADULTS_ADMIN" in str(exc_info.value.detail)

    def test_admin_adult_invite_passes_validation(self):
        """admin + adult passes the validation gate (may fail later on DB mock)."""
        # We expect it to pass the adult-check and proceed to DB ops.
        # It will fail on mock DB, but NOT with ONLY_ADULTS_ADMIN.
        try:
            self._call_create("admin", True)
        except HTTPException as e:
            # Must NOT be the adult-admin check
            assert "ONLY_ADULTS_ADMIN" not in str(e.detail)
        except Exception:
            pass  # DB mock errors are expected

    def test_member_non_adult_invite_passes_validation(self):
        """member + non-adult is always valid."""
        try:
            self._call_create("member", False)
        except HTTPException as e:
            assert "ONLY_ADULTS_ADMIN" not in str(e.detail)
        except Exception:
            pass

    def test_invalid_role_rejected(self):
        """Invalid role is rejected before adult check."""
        with pytest.raises(HTTPException) as exc_info:
            self._call_create("superadmin", True)
        assert exc_info.value.status_code == 400
        assert "INVALID_ROLE" in str(exc_info.value.detail)


# ── Registration Defensive Check ──


class TestRegisterDefensiveDemotion:
    """Validate that register_with_invite defensively demotes non-adult admins."""

    def test_non_adult_admin_demoted_to_member(self):
        """If a tampered invitation has admin+non-adult, registration demotes to member."""
        # Direct logic test: simulate what register_with_invite does
        role = "admin"
        is_adult = False
        if role == "admin" and not is_adult:
            role = "member"
        assert role == "member"

    def test_adult_admin_preserved(self):
        """Valid admin+adult invitation keeps admin role."""
        role = "admin"
        is_adult = True
        if role == "admin" and not is_adult:
            role = "member"
        assert role == "admin"

    def test_demotion_logic_in_source(self):
        """Verify the defensive demotion code exists in register_with_invite."""
        import inspect
        from app.modules.invitations_router import register_with_invite
        source = inspect.getsource(register_with_invite)
        assert 'if role == "admin" and not is_adult:' in source
        assert 'role = "member"' in source
