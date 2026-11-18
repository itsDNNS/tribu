"""Integration tests for the first-week setup checklist."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import CalendarEvent, MealPlan, ShoppingList, Task
from tests.support import TestSession, add_member, auth, seed_member


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(scopes: str = "*", suffix: str = "owner", is_adult: bool = True, role: str = "admin", family_id: int | None = None) -> tuple[str, int, int]:
    member = seed_member(
        f"setup-checklist-{suffix}@example.com", scopes=scopes, family_id=family_id, is_adult=is_adult, role=role, display_name="Setup User",
    )
    return member.token, member.family_id, member.user_id


def test_setup_checklist_auto_completes_existing_family_data_and_manual_review_steps():
    token, family_id, user_id = _seed_member()
    db = TestSession()
    add_member(db, "setup-checklist-child@example.com", scopes=None, family_id=family_id, is_adult=False, display_name="Child")
    db.add(CalendarEvent(family_id=family_id, title="Soccer", starts_at=datetime.utcnow() + timedelta(days=1)))
    db.add(ShoppingList(family_id=family_id, name="Groceries"))
    db.add(Task(family_id=family_id, title="Take bins out", recurrence="weekly", created_by_user_id=user_id))
    db.add(MealPlan(family_id=family_id, plan_date=datetime.utcnow().date(), slot="evening", meal_name="Pasta", created_by_user_id=user_id))
    db.commit()
    db.close()

    status = client.get(f"/setup-checklist?family_id={family_id}", headers=auth(token))
    assert status.status_code == 200, status.json()
    steps = {step["key"]: step for step in status.json()["steps"]}
    assert steps["members"]["completed"] is True
    assert steps["calendar"]["completed"] is True
    assert steps["shopping"]["completed"] is True
    assert steps["meal_plan"]["completed"] is True
    assert steps["routine"]["completed"] is True
    assert steps["phone_sync"]["completed"] is False
    assert steps["backup_guidance"]["completed"] is False
    assert status.json()["completed_count"] == 5
    assert status.json()["dismissed"] is False

    complete = client.post(
        "/setup-checklist/steps/backup_guidance/complete",
        json={"family_id": family_id},
        headers=auth(token),
    )
    assert complete.status_code == 200, complete.json()
    assert {step["key"]: step for step in complete.json()["steps"]}["backup_guidance"]["completed"] is True


def test_setup_checklist_dismiss_reset_family_boundaries_and_scope_checks():
    token, family_id, _ = _seed_member(suffix="owner")
    outsider_token, _, _ = _seed_member(suffix="outsider")
    child_token, _, _ = _seed_member(suffix="child", is_adult=False, role="member", family_id=family_id)
    read_token, _, _ = _seed_member(scopes="setup_checklist:read", suffix="read", family_id=family_id)
    write_token, _, _ = _seed_member(scopes="setup_checklist:write", suffix="write", family_id=family_id)

    assert client.get(f"/setup-checklist?family_id={family_id}", headers=auth(read_token)).status_code == 200
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=auth(write_token)).status_code == 403
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=auth(child_token)).status_code == 403
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=auth(outsider_token)).status_code == 403

    denied_scope = client.post("/setup-checklist/dismiss", json={"family_id": family_id}, headers=auth(read_token))
    assert denied_scope.status_code == 403

    dismissed = client.post("/setup-checklist/dismiss", json={"family_id": family_id}, headers=auth(token))
    assert dismissed.status_code == 200, dismissed.json()
    assert dismissed.json()["dismissed"] is True
    assert dismissed.json()["show_on_dashboard"] is False

    reset = client.post("/setup-checklist/reset", json={"family_id": family_id}, headers=auth(token))
    assert reset.status_code == 200, reset.json()
    assert reset.json()["dismissed"] is False
    assert reset.json()["show_on_dashboard"] is True
