"""Integration tests for household planning templates."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, Task, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-household-templates.db",
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


def _seed_member(scopes: str = "*", suffix: str = "owner", is_adult: bool = True, family_id: int | None = None) -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"household-template-{suffix}@example.com",
        password_hash=hash_password("Password1"),
        display_name="Template User",
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Template Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}household-template-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="household-template-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain, family_id


def test_built_in_gallery_and_custom_template_crud():
    token, family_id = _seed_member(suffix="crud")

    gallery = client.get(f"/household-templates?family_id={family_id}", headers=_auth(token))
    assert gallery.status_code == 200, gallery.json()
    names = [template["name"] for template in gallery.json()]
    assert "School morning routine" in names
    assert all(template["is_builtin"] for template in gallery.json())
    assert all("family_id" not in template for template in gallery.json())

    created = client.post(
        "/household-templates",
        json={
            "family_id": family_id,
            "name": "Birthday party prep",
            "description": "Reusable checklist and groceries",
            "task_items": [
                {"title": "Send invitations", "priority": "high", "days_offset": 0},
                {"title": "Pick up cake", "priority": "normal", "days_offset": 2},
            ],
            "shopping_items": [
                {"name": "Juice boxes", "spec": "12", "category": "Drinks"},
            ],
        },
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()
    template = created.json()
    assert template["name"] == "Birthday party prep"
    assert template["is_builtin"] is False
    assert template["task_count"] == 2
    assert template["shopping_count"] == 1
    assert [item["title"] for item in template["task_items"]] == ["Send invitations", "Pick up cake"]

    updated = client.patch(
        f"/household-templates/{template['id']}",
        json={
            "name": "Birthday party basics",
            "task_items": [{"title": "Confirm guests", "priority": "normal", "days_offset": 1}],
            "shopping_items": [],
        },
        headers=_auth(token),
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Birthday party basics"
    assert updated.json()["task_count"] == 1
    assert updated.json()["shopping_count"] == 0

    listed = client.get(f"/household-templates?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200
    assert "Birthday party basics" in [template["name"] for template in listed.json()]

    deleted = client.delete(f"/household-templates/{template['id']}", headers=_auth(token))
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "template_id": template["id"]}


def test_apply_custom_template_adds_tasks_and_shopping_without_overwriting_existing_data():
    token, family_id = _seed_member(suffix="apply")
    db = TestSession()
    existing_task = Task(family_id=family_id, title="Existing task", priority="normal")
    existing_list = ShoppingList(family_id=family_id, name="Existing groceries")
    db.add_all([existing_task, existing_list])
    db.flush()
    db.add(ShoppingItem(list_id=existing_list.id, name="Existing milk", position=0))
    db.commit()
    list_id = existing_list.id
    db.close()

    created = client.post(
        "/household-templates",
        json={
            "family_id": family_id,
            "name": "Weekend reset",
            "task_items": [
                {"title": "Clean kitchen", "description": "Counters and floor", "priority": "high", "days_offset": 1},
                {"title": "Pack sports bag", "priority": "normal", "days_offset": 2},
            ],
            "shopping_items": [
                {"name": "Apples", "spec": "6", "category": "Produce"},
                {"name": "Bread", "category": "Bakery"},
            ],
        },
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()

    applied = client.post(
        f"/household-templates/{created.json()['id']}/apply",
        json={"target_date": "2026-05-04", "shopping_list_id": list_id},
        headers=_auth(token),
    )
    assert applied.status_code == 200, applied.json()
    body = applied.json()
    assert body["created_task_count"] == 2
    assert body["created_shopping_count"] == 2
    assert body["shopping_list_id"] == list_id
    assert [task["title"] for task in body["tasks"]] == ["Clean kitchen", "Pack sports bag"]
    assert body["tasks"][0]["due_date"].startswith("2026-05-05")

    tasks = client.get(f"/tasks?family_id={family_id}", headers=_auth(token))
    assert tasks.status_code == 200
    assert sorted(task["title"] for task in tasks.json()["items"]) == ["Clean kitchen", "Existing task", "Pack sports bag"]

    shopping_items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert shopping_items.status_code == 200
    assert [item["name"] for item in shopping_items.json()] == ["Existing milk", "Apples", "Bread"]


def test_apply_builtin_template_can_create_a_new_shopping_list():
    token, family_id = _seed_member(suffix="builtin")

    applied = client.post(
        "/household-templates/builtin/school-morning/apply",
        json={"family_id": family_id, "target_date": "2026-05-04", "shopping_list_name": "School week supplies"},
        headers=_auth(token),
    )
    assert applied.status_code == 200, applied.json()
    body = applied.json()
    assert body["template_id"] == "school-morning"
    assert body["created_task_count"] >= 2
    assert body["shopping_list_id"] is not None

    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=_auth(token))
    assert lists.status_code == 200
    assert [item["name"] for item in lists.json()] == ["School week supplies"]


def test_household_templates_are_family_scoped_adult_only_and_scope_checked():
    owner_token, family_id = _seed_member(suffix="owner")
    outsider_token, outsider_family_id = _seed_member(suffix="outsider")
    child_token, _ = _seed_member(suffix="child", is_adult=False, family_id=family_id)
    read_token, _ = _seed_member(scopes="household_templates:read", suffix="read", family_id=family_id)
    write_token, _ = _seed_member(scopes="household_templates:write", suffix="write", family_id=family_id)

    denied_child = client.post(
        "/household-templates",
        json={"family_id": family_id, "name": "Child template", "task_items": [{"title": "Candy"}]},
        headers=_auth(child_token),
    )
    assert denied_child.status_code == 403

    denied_scope = client.post(
        "/household-templates",
        json={"family_id": family_id, "name": "Read only", "task_items": [{"title": "Rice"}]},
        headers=_auth(read_token),
    )
    assert denied_scope.status_code == 403

    allowed = client.post(
        "/household-templates",
        json={"family_id": family_id, "name": "Owner template", "task_items": [{"title": "Bread"}]},
        headers=_auth(owner_token),
    )
    assert allowed.status_code == 200, allowed.json()
    template_id = allowed.json()["id"]

    outsider_list = client.get(f"/household-templates?family_id={family_id}", headers=_auth(outsider_token))
    assert outsider_list.status_code == 403

    child_list = client.get(f"/household-templates?family_id={family_id}", headers=_auth(child_token))
    assert child_list.status_code == 403

    allowed_read = client.get(f"/household-templates?family_id={family_id}", headers=_auth(read_token))
    assert allowed_read.status_code == 200

    denied_read = client.get(f"/household-templates?family_id={family_id}", headers=_auth(write_token))
    assert denied_read.status_code == 403

    outsider_apply = client.post(
        f"/household-templates/{template_id}/apply",
        json={"target_date": "2026-05-04", "shopping_list_name": "Other"},
        headers=_auth(outsider_token),
    )
    assert outsider_apply.status_code == 403

    cross_family_list = client.post(
        "/shopping/lists",
        json={"family_id": outsider_family_id, "name": "Outsider groceries"},
        headers=_auth(outsider_token),
    )
    assert cross_family_list.status_code == 200
    cross_apply = client.post(
        f"/household-templates/{template_id}/apply",
        json={"target_date": "2026-05-04", "shopping_list_id": cross_family_list.json()["id"]},
        headers=_auth(owner_token),
    )
    assert cross_apply.status_code == 404
