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
from app.models import Family, Membership, PersonalAccessToken, Task, User
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
