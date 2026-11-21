from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.utils import utcnow
from app.main import app
from app.models import FamilyInvitation
from tests.support import TestSession, add_member

pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _register(email):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "correct horse battery",
            "display_name": "User",
            "family_name": "Family",
        },
    )


def test_first_public_registration_is_allowed_but_second_is_blocked_by_default():
    first = _register("first@example.com")
    assert first.status_code == 200

    second = _register("second@example.com")
    assert second.status_code == 403
    assert "OPEN_REGISTRATION_DISABLED" in str(second.json())


def test_public_registration_can_be_explicitly_enabled_after_setup(monkeypatch):
    first = _register("first@example.com")
    assert first.status_code == 200

    monkeypatch.setenv("ALLOW_OPEN_REGISTRATION", "true")
    second = _register("second@example.com")
    assert second.status_code == 200


def test_invite_registration_still_works_after_initial_setup(monkeypatch):
    invalidated_patterns = []
    monkeypatch.setattr(
        "app.modules.invitations_router.cache.invalidate_pattern",
        invalidated_patterns.append,
    )

    with TestSession() as db:
        admin = add_member(
            db, "admin@example.com", scopes=None, family_name="Fam", password="Secure1Pass",
            display_name="Admin", user_fields={"has_completed_onboarding": True},
        )
        db.add(FamilyInvitation(
            family_id=admin.family_id,
            token="invite-token",
            created_by_user_id=admin.user_id,
            role_preset="member",
            is_adult_preset=True,
            max_uses=1,
            expires_at=utcnow() + timedelta(days=1),
        ))
        db.commit()

    resp = client.post(
        "/auth/register-with-invite",
        json={
            "token": "invite-token",
            "email": "invited@example.com",
            "password": "correct horse battery",
            "display_name": "Invited",
        },
    )
    assert resp.status_code == 200
    assert "tribu:families:*" in invalidated_patterns


def test_invite_registration_rate_limit_still_applies_after_startup_patch():
    from app.main import limiter as app_limiter
    from app.modules.invitations_router import limiter as invitations_limiter

    def reset_limiters():
        app_limiter.reset()
        invitations_limiter.reset()

    reset_limiters()
    try:
        payload = {
            "token": "missing-invite-token",
            "email": "rate-limited@example.com",
            "password": "correct horse battery",
            "display_name": "Invited",
        }

        for _ in range(10):
            resp = client.post("/auth/register-with-invite", json=payload)
            assert resp.status_code == 400
            assert "INVITATION_INVALID" in str(resp.json())

        limited = client.post("/auth/register-with-invite", json=payload)
        assert limited.status_code == 429
    finally:
        reset_limiters()
