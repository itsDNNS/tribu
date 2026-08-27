"""Task-specific recurrence rules."""

from __future__ import annotations

import hashlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - ensure all models are registered before create_all
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, RewardCurrency, Task, TokenTransaction, User
from app.security import PAT_PREFIX, hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
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


def _seed_admin() -> tuple[str, int, int]:
    db = TestSession()
    try:
        family = Family(name="Ops Family")
        user = User(email="ops@example.com", password_hash=hash_password("Password123"), display_name="Ops Admin")
        db.add_all([family, user])
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}task-specific-recurrence"
        lookup = hashlib.sha256(plain.encode()).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="task-specific-recurrence-pat",
            token_hash=lookup,
            token_lookup=lookup,
            scopes="tasks:read,tasks:write",
        ))
        db.commit()
        return plain, family.id, user.id
    finally:
        db.close()


@pytest.mark.parametrize(
    ("recurrence", "current_due", "expected_due"),
    [
        ("monthly_first_monday", datetime(2026, 6, 1, 9, 0), datetime(2026, 7, 6, 9, 0)),
        ("monthly_first_wednesday", datetime(2026, 6, 3, 9, 0), datetime(2026, 7, 1, 9, 0)),
        ("monthly_first_sunday", datetime(2026, 6, 7, 9, 0), datetime(2026, 7, 5, 9, 0)),
    ],
)
def test_first_weekday_monthly_creates_next_occurrence_on_completion(recurrence, current_due, expected_due):
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    try:
        task = Task(
            family_id=family_id,
            title="Run Ansible updates",
            priority="normal",
            due_date=current_due,
            recurrence=recurrence,
            assigned_to_user_id=user_id,
            created_by_user_id=user_id,
        )
        db.add(task)
        db.commit()
        task_id = task.id
    finally:
        db.close()

    resp = client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "done"})

    assert resp.status_code == 200, resp.json()
    db = TestSession()
    try:
        next_task = db.query(Task).filter(Task.id != task_id, Task.title == "Run Ansible updates").one()
        assert next_task.recurrence == recurrence
        assert next_task.due_date == expected_due
    finally:
        db.close()


def test_list_tasks_reward_only_returns_open_reward_tasks():
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    try:
        db.add_all([
            Task(
                family_id=family_id,
                title="Rewarded open task",
                priority="normal",
                assigned_to_user_id=user_id,
                created_by_user_id=user_id,
                token_reward_amount=3,
            ),
            Task(
                family_id=family_id,
                title="Plain open task",
                priority="normal",
                assigned_to_user_id=user_id,
                created_by_user_id=user_id,
            ),
            Task(
                family_id=family_id,
                title="Done rewarded task",
                priority="normal",
                status="done",
                assigned_to_user_id=user_id,
                created_by_user_id=user_id,
                token_reward_amount=5,
            ),
        ])
        db.commit()
    finally:
        db.close()

    resp = client.get(f"/tasks?family_id={family_id}&reward_only=true", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert data["total"] == 1
    assert [item["title"] for item in data["items"]] == ["Rewarded open task"]


def test_rest_task_title_contract_accepts_240_and_rejects_241_characters():
    token, family_id, _ = _seed_admin()
    title = "T" * 240
    created = client.post(
        "/tasks",
        headers=_auth(token),
        json={"family_id": family_id, "title": title, "priority": "normal"},
    )
    assert created.status_code == 200, created.json()
    assert created.json()["title"] == title

    updated = client.patch(
        f"/tasks/{created.json()['id']}",
        headers=_auth(token),
        json={"title": title, "priority": "high"},
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["title"] == title

    too_long = f"{title}X"
    rejected_create = client.post(
        "/tasks",
        headers=_auth(token),
        json={"family_id": family_id, "title": too_long, "priority": "normal"},
    )
    assert rejected_create.status_code == 422

    rejected_update = client.patch(
        f"/tasks/{created.json()['id']}",
        headers=_auth(token),
        json={"title": too_long},
    )
    assert rejected_update.status_code == 422


def test_repeated_done_updates_create_one_reward_and_one_next_occurrence():
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    try:
        db.add(RewardCurrency(family_id=family_id, name="Stars", icon="star"))
        task = Task(
            family_id=family_id,
            title="Repeat safely",
            priority="normal",
            recurrence="weekly",
            due_date=datetime(2026, 8, 27, 9),
            assigned_to_user_id=user_id,
            created_by_user_id=user_id,
            token_reward_amount=4,
        )
        db.add(task)
        db.commit()
        task_id = task.id
    finally:
        db.close()

    first = client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "done"})
    second = client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "done", "title": "Repeat safely"})
    assert first.status_code == second.status_code == 200

    db = TestSession()
    try:
        assert db.query(TokenTransaction).filter(TokenTransaction.source_task_id == task_id).count() == 1
        assert db.query(Task).filter(Task.family_id == family_id, Task.id != task_id).count() == 1
    finally:
        db.close()


def test_reopen_clears_completed_at_and_later_completion_does_not_duplicate_reward():
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    try:
        db.add(RewardCurrency(family_id=family_id, name="Stars", icon="star"))
        task = Task(
            family_id=family_id, title="Reopen", priority="normal",
            assigned_to_user_id=user_id, created_by_user_id=user_id,
            token_reward_amount=2,
        )
        db.add(task)
        db.commit()
        task_id = task.id
    finally:
        db.close()

    assert client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "done"}).status_code == 200
    reopened = client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "open"})
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None
    assert client.patch(f"/tasks/{task_id}", headers=_auth(token), json={"status": "done"}).status_code == 200

    db = TestSession()
    try:
        assert db.query(TokenTransaction).filter(TokenTransaction.source_task_id == task_id).count() == 1
    finally:
        db.close()


def test_rest_can_clear_optional_fields_and_due_precision():
    token, family_id, user_id = _seed_admin()
    created = client.post(
        "/tasks",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "title": "Precise",
            "description": "notes",
            "due_date": "2026-08-27T00:00:00",
            "due_is_date": True,
            "assigned_to_user_id": user_id,
            "recurrence": "weekly",
            "token_reward_amount": 3,
        },
    )
    assert created.status_code == 200, created.json()
    assert created.json()["due_is_date"] is True

    updated = client.patch(
        f"/tasks/{created.json()['id']}",
        headers=_auth(token),
        json={
            "description": None,
            "due_date": None,
            "recurrence": None,
            "assigned_to_user_id": None,
            "token_reward_amount": None,
        },
    )
    assert updated.status_code == 200, updated.json()
    body = updated.json()
    assert body["description"] is None
    assert body["due_date"] is None
    assert body["due_is_date"] is False
    assert body["recurrence"] is None
    assert body["assigned_to_user_id"] is None
    assert body["token_reward_amount"] is None


def test_rest_wildcard_pat_still_reads_tasks():
    _, family_id, user_id = _seed_admin()
    db = TestSession()
    try:
        plain = f"{PAT_PREFIX}rest-wildcard"
        lookup = hashlib.sha256(plain.encode()).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user_id,
            name="rest-wildcard",
            token_hash=lookup,
            token_lookup=lookup,
            scopes="*",
        ))
        db.add(Task(family_id=family_id, title="Visible", priority="normal", created_by_user_id=user_id))
        db.commit()
    finally:
        db.close()

    response = client.get(f"/tasks?family_id={family_id}", headers=_auth(plain))
    assert response.status_code == 200
    assert response.json()["total"] == 1
