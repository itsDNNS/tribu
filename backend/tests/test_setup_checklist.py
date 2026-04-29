"""Integration tests for the first-week setup checklist."""

import hashlib
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, Family, MealPlan, Membership, PersonalAccessToken, ShoppingList, Task, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine("sqlite:///./test-setup-checklist.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_member(scopes: str = "*", suffix: str = "owner", is_adult: bool = True, role: str = "admin", family_id: int | None = None) -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"setup-checklist-{suffix}@example.com",
        password_hash=hash_password("Password1"),
        display_name="Setup User",
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Setup Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role=role, is_adult=is_adult))
    plain = f"{PAT_PREFIX}setup-checklist-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(user_id=user.id, name="setup-checklist-pat", token_hash=fingerprint, token_lookup=fingerprint, scopes=scopes))
    db.commit()
    user_id = user.id
    db.close()
    return plain, family_id, user_id


def test_setup_checklist_auto_completes_existing_family_data_and_manual_review_steps():
    token, family_id, user_id = _seed_member()
    db = TestSession()
    other = User(email="setup-checklist-child@example.com", password_hash=hash_password("Password1"), display_name="Child")
    db.add(other)
    db.flush()
    db.add(Membership(user_id=other.id, family_id=family_id, role="member", is_adult=False))
    db.add(CalendarEvent(family_id=family_id, title="Soccer", starts_at=datetime.utcnow() + timedelta(days=1)))
    db.add(ShoppingList(family_id=family_id, name="Groceries"))
    db.add(Task(family_id=family_id, title="Take bins out", recurrence="weekly", created_by_user_id=user_id))
    db.add(MealPlan(family_id=family_id, plan_date=datetime.utcnow().date(), slot="evening", meal_name="Pasta", created_by_user_id=user_id))
    db.commit()
    db.close()

    status = client.get(f"/setup-checklist?family_id={family_id}", headers=_auth(token))
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
        headers=_auth(token),
    )
    assert complete.status_code == 200, complete.json()
    assert {step["key"]: step for step in complete.json()["steps"]}["backup_guidance"]["completed"] is True


def test_setup_checklist_dismiss_reset_family_boundaries_and_scope_checks():
    token, family_id, _ = _seed_member(suffix="owner")
    outsider_token, _, _ = _seed_member(suffix="outsider")
    child_token, _, _ = _seed_member(suffix="child", is_adult=False, role="member", family_id=family_id)
    read_token, _, _ = _seed_member(scopes="setup_checklist:read", suffix="read", family_id=family_id)
    write_token, _, _ = _seed_member(scopes="setup_checklist:write", suffix="write", family_id=family_id)

    assert client.get(f"/setup-checklist?family_id={family_id}", headers=_auth(read_token)).status_code == 200
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=_auth(write_token)).status_code == 403
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=_auth(child_token)).status_code == 403
    assert client.get(f"/setup-checklist?family_id={family_id}", headers=_auth(outsider_token)).status_code == 403

    denied_scope = client.post("/setup-checklist/dismiss", json={"family_id": family_id}, headers=_auth(read_token))
    assert denied_scope.status_code == 403

    dismissed = client.post("/setup-checklist/dismiss", json={"family_id": family_id}, headers=_auth(token))
    assert dismissed.status_code == 200, dismissed.json()
    assert dismissed.json()["dismissed"] is True
    assert dismissed.json()["show_on_dashboard"] is False

    reset = client.post("/setup-checklist/reset", json={"family_id": family_id}, headers=_auth(token))
    assert reset.status_code == 200, reset.json()
    assert reset.json()["dismissed"] is False
    assert reset.json()["show_on_dashboard"] is True
