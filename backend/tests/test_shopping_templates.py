"""Integration tests for shopping list templates."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingList, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-shopping-templates.db",
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
        email=f"shopping-template-{suffix}@example.com",
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
    plain = f"{PAT_PREFIX}shopping-template-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="shopping-template-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain, family_id


def _seed_list(family_id: int, name: str = "Groceries") -> int:
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name=name)
    db.add(shopping_list)
    db.commit()
    list_id = shopping_list.id
    db.close()
    return list_id


def test_template_create_edit_list_delete_and_apply_to_shopping_list():
    token, family_id = _seed_member(suffix="flow")
    list_id = _seed_list(family_id)

    created = client.post(
        "/shopping/templates",
        json={
            "family_id": family_id,
            "name": "Weekly groceries",
            "items": [
                {"name": "Milk", "spec": "2 L", "category": "Dairy"},
                {"name": "Bananas", "spec": "6", "category": "Produce"},
            ],
        },
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()
    template = created.json()
    assert template["name"] == "Weekly groceries"
    assert template["item_count"] == 2
    assert [item["name"] for item in template["items"]] == ["Milk", "Bananas"]
    assert template["items"][0]["category"] == "Dairy"

    updated = client.patch(
        f"/shopping/templates/{template['id']}",
        json={
            "name": "Weekly basics",
            "items": [
                {"name": "Oats", "spec": "1 kg", "category": "Pantry"},
                {"name": "Milk", "spec": "2 L", "category": "Dairy"},
            ],
        },
        headers=_auth(token),
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Weekly basics"
    assert [item["name"] for item in updated.json()["items"]] == ["Oats", "Milk"]

    listed = client.get(f"/shopping/templates?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200
    assert [(tpl["name"], tpl["item_count"]) for tpl in listed.json()] == [("Weekly basics", 2)]

    applied = client.post(
        f"/shopping/templates/{template['id']}/apply",
        json={"list_id": list_id},
        headers=_auth(token),
    )
    assert applied.status_code == 200, applied.json()
    assert applied.json()["added_count"] == 2
    assert [item["name"] for item in applied.json()["items"]] == ["Oats", "Milk"]
    assert applied.json()["items"][0]["checked"] is False
    assert applied.json()["items"][0]["category"] == "Pantry"

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["name"], item["spec"], item["category"], item["checked"]) for item in items.json()] == [
        ("Oats", "1 kg", "Pantry", False),
        ("Milk", "2 L", "Dairy", False),
    ]

    deleted = client.delete(f"/shopping/templates/{template['id']}", headers=_auth(token))
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "template_id": template["id"]}


def test_templates_are_family_scoped_and_adult_write_only():
    owner_token, family_id = _seed_member(suffix="owner")
    outsider_token, outsider_family_id = _seed_member(suffix="outsider")
    child_token, _ = _seed_member(suffix="child", is_adult=False, family_id=family_id)
    list_id = _seed_list(family_id, "Owner Groceries")
    outsider_list_id = _seed_list(outsider_family_id, "Other Groceries")

    child_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Child template", "items": [{"name": "Candy"}]},
        headers=_auth(child_token),
    )
    assert child_create.status_code == 403

    created = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Owner template", "items": [{"name": "Bread"}]},
        headers=_auth(owner_token),
    )
    assert created.status_code == 200, created.json()
    template_id = created.json()["id"]

    outsider_list = client.get(f"/shopping/templates?family_id={family_id}", headers=_auth(outsider_token))
    assert outsider_list.status_code == 403

    outsider_apply = client.post(
        f"/shopping/templates/{template_id}/apply",
        json={"list_id": list_id},
        headers=_auth(outsider_token),
    )
    assert outsider_apply.status_code == 403

    cross_family_apply = client.post(
        f"/shopping/templates/{template_id}/apply",
        json={"list_id": outsider_list_id},
        headers=_auth(owner_token),
    )
    assert cross_family_apply.status_code == 404


def test_template_endpoints_enforce_shopping_scopes():
    read_token, family_id = _seed_member(scopes="shopping:read", suffix="read")
    write_token, _ = _seed_member(scopes="shopping:write", suffix="write", family_id=family_id)

    denied_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "No write", "items": [{"name": "Rice"}]},
        headers=_auth(read_token),
    )
    assert denied_create.status_code == 403

    allowed_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Write ok", "items": [{"name": "Rice"}]},
        headers=_auth(write_token),
    )
    assert allowed_create.status_code == 200

    denied_list = client.get(f"/shopping/templates?family_id={family_id}", headers=_auth(write_token))
    assert denied_list.status_code == 403
