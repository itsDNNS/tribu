"""Family areas (Tribu 2.0, R4): hiding optional areas per family."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import AuditLog
from tests.support import TestSession, auth, seed_member


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(
    scopes: str,
    suffix: str,
    *,
    display_name: str = "Areas User",
    is_adult: bool = True,
    family_id: int | None = None,
) -> tuple[str, int, int]:
    member = seed_member(
        f"areas-{suffix}@example.com", scopes=scopes, family_id=family_id, is_adult=is_adult, display_name=display_name,
    )
    return member.token, member.family_id, member.user_id


def test_admins_hide_optional_areas_for_everyone():
    admin_token, family_id, _ = _seed_member("*", "admin")
    child_token, _, _ = _seed_member("*", "child", is_adult=False, family_id=family_id)

    start = client.get("/families/me", headers=auth(child_token))
    assert start.status_code == 200, start.json()
    assert start.json()[0]["hidden_areas"] == []

    saved = client.put(
        f"/families/{family_id}/areas",
        json={"hidden_areas": ["gifts", "school_timetables", "gifts"]},
        headers=auth(admin_token),
    )
    assert saved.status_code == 200, saved.json()
    # Once each, in navigation order.
    assert saved.json()["hidden_areas"] == ["school_timetables", "gifts"]
    assert "recipes" in saved.json()["optional_areas"]

    after = client.get("/families/me", headers=auth(child_token))
    assert after.json()[0]["hidden_areas"] == ["school_timetables", "gifts"]

    db = TestSession()
    entry = db.query(AuditLog).filter(AuditLog.family_id == family_id, AuditLog.action == "areas_changed").one()
    assert entry.details == {"hidden_areas": ["school_timetables", "gifts"]}
    db.close()

    shown = client.put(f"/families/{family_id}/areas", json={"hidden_areas": []}, headers=auth(admin_token))
    assert shown.json()["hidden_areas"] == []


def test_only_admins_choose_areas_and_core_areas_stay():
    admin_token, family_id, _ = _seed_member("*", "admin2")
    child_token, _, _ = _seed_member("*", "child2", is_adult=False, family_id=family_id)

    denied = client.put(f"/families/{family_id}/areas", json={"hidden_areas": ["gifts"]}, headers=auth(child_token))
    assert denied.status_code == 403

    core = client.put(
        f"/families/{family_id}/areas",
        json={"hidden_areas": ["calendar", "shopping", "gifts"]},
        headers=auth(admin_token),
    )
    assert core.status_code == 422
    assert core.json()["detail"]["code"] == "UNKNOWN_AREAS"


def test_areas_need_the_families_write_scope():
    token, family_id, _ = _seed_member("families:read", "scoped")
    response = client.put(f"/families/{family_id}/areas", json={"hidden_areas": []}, headers=auth(token))
    assert response.status_code == 403
