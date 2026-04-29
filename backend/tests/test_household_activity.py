"""Household activity feed integration tests."""

import hashlib
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, HouseholdActivity, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-household-activity.db",
    connect_args={"check_same_thread": False},
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


def _seed_member(
    scopes: str,
    suffix: str,
    *,
    display_name: str = "Activity User",
    is_adult: bool = True,
    family_id: int | None = None,
) -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"activity-{suffix}@example.com",
        password_hash=hash_password("Password123"),
        display_name=display_name,
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Activity Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}activity-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="activity-pat",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    ))
    db.commit()
    user_id = user.id
    db.close()
    return plain, family_id, user_id


def test_task_create_and_complete_are_recorded_public_safely():
    token, family_id, user_id = _seed_member("*", "tasks", display_name="Dennis")

    created = client.post(
        "/tasks",
        json={
            "family_id": family_id,
            "title": "  Pay school lunch  ",
            "description": "private bank detail should not leak",
            "priority": "normal",
        },
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()
    task_id = created.json()["id"]

    completed = client.patch(
        f"/tasks/{task_id}",
        json={"status": "done"},
        headers=_auth(token),
    )
    assert completed.status_code == 200, completed.json()

    feed = client.get(f"/activity?family_id={family_id}&limit=10", headers=_auth(token))
    assert feed.status_code == 200, feed.json()
    data = feed.json()
    assert data["total"] == 2
    assert [item["action"] for item in data["items"]] == ["completed", "created"]
    assert [item["object_type"] for item in data["items"]] == ["task", "task"]
    assert data["items"][0]["actor_display_name"] == "Dennis"
    assert "family_id" not in data["items"][0]
    assert "actor_user_id" not in data["items"][0]
    assert "object_id" not in data["items"][0]

    db = TestSession()
    db.query(HouseholdActivity).filter(HouseholdActivity.family_id == family_id).update({"actor_user_id": None})
    db.commit()
    db.close()

    feed_after_actor_delete = client.get(f"/activity?family_id={family_id}&limit=10", headers=_auth(token))
    assert feed_after_actor_delete.status_code == 200
    assert feed_after_actor_delete.json()["items"][0]["actor_display_name"] == "Dennis"

    assert data["items"][0]["summary"] == "Dennis completed task \"Pay school lunch\""
    assert data["items"][1]["summary"] == "Dennis created task \"Pay school lunch\""
    assert "created_at" in data["items"][0]
    serialized = str(data)
    assert "private bank detail" not in serialized
    assert "token" not in serialized.lower()
    assert "password" not in serialized.lower()
    assert "details" not in data["items"][0]


def test_shopping_activity_and_family_boundaries():
    token, family_id, _ = _seed_member("*", "shopping", display_name="Anna")
    intruder_token, _, _ = _seed_member("*", "intruder", display_name="Other")

    shopping_list = client.post(
        "/shopping/lists",
        json={"family_id": family_id, "name": "Weekly groceries"},
        headers=_auth(token),
    )
    assert shopping_list.status_code == 200, shopping_list.json()
    list_id = shopping_list.json()["id"]

    item = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "Milk", "spec": "private note", "category": "Dairy"},
        headers=_auth(token),
    )
    assert item.status_code == 200, item.json()
    item_id = item.json()["id"]

    checked = client.patch(
        f"/shopping/items/{item_id}",
        json={"checked": True},
        headers=_auth(token),
    )
    assert checked.status_code == 200, checked.json()

    denied = client.get(f"/activity?family_id={family_id}", headers=_auth(intruder_token))
    assert denied.status_code == 403

    feed = client.get(f"/activity?family_id={family_id}&limit=10", headers=_auth(token))
    assert feed.status_code == 200, feed.json()
    summaries = [entry["summary"] for entry in feed.json()["items"]]
    assert summaries == [
        'Anna checked off "Milk"',
        'Anna added "Milk" to shopping',
        'Anna created shopping list "Weekly groceries"',
    ]
    assert "private note" not in str(feed.json())


def test_activity_feed_orders_and_paginates():
    token, family_id, user_id = _seed_member("*", "pages")
    db = TestSession()
    now = datetime.utcnow()
    db.add_all([
        HouseholdActivity(
            family_id=family_id,
            actor_user_id=user_id,
            action="created",
            object_type="task",
            object_id=idx,
            summary=f"Activity User created task \"Item {idx}\"",
            created_at=now + timedelta(minutes=idx),
        )
        for idx in range(3)
    ])
    db.commit()
    db.close()

    feed = client.get(f"/activity?family_id={family_id}&limit=2&offset=1", headers=_auth(token))
    assert feed.status_code == 200, feed.json()
    data = feed.json()
    assert data["total"] == 3
    assert data["offset"] == 1
    assert data["limit"] == 2
    assert [item["summary"] for item in data["items"]] == [
        "Activity User created task \"Item 1\"",
        "Activity User created task \"Item 0\"",
    ]


def test_activity_read_scope_is_required_for_pats():
    token, family_id, _ = _seed_member("tasks:read", "bad-scope")
    resp = client.get(f"/activity?family_id={family_id}", headers=_auth(token))
    assert resp.status_code == 403

    good_token, good_family_id, _ = _seed_member("activity:read", "good-scope")
    allowed = client.get(f"/activity?family_id={good_family_id}", headers=_auth(good_token))
    assert allowed.status_code == 200, allowed.json()
