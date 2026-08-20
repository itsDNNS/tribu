"""Regression tests for shopping item reuse and name normalization."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.utils import utcnow
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-shopping-item-reuse.db",
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


def _seed_owner() -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email="shopping-reuse-owner@example.com",
        password_hash=hash_password("Password1"),
        display_name="Shopping Owner",
    )
    db.add(user)
    db.flush()
    family = Family(name="Shopping Reuse Family")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
    shopping_list = ShoppingList(family_id=family.id, name="Groceries", created_by_user_id=user.id)
    db.add(shopping_list)
    plain = f"{PAT_PREFIX}shopping-reuse-owner"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="shopping-reuse-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes="shopping:read,shopping:write",
    ))
    db.commit()
    list_id = shopping_list.id
    family_id = family.id
    db.close()
    return plain, family_id, list_id


def test_add_item_reactivates_checked_match_without_creating_duplicate():
    token, _family_id, list_id = _seed_owner()
    db = TestSession()
    checked_item = ShoppingItem(
        list_id=list_id,
        name="Milk",
        spec=None,
        checked=True,
        checked_at=utcnow(),
    )
    db.add(checked_item)
    db.commit()
    existing_id = checked_item.id
    db.close()

    response = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "  milk  "},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] == existing_id
    assert response.json()["name"] == "Milk"
    assert response.json()["checked"] is False
    assert response.json()["checked_at"] is None

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["id"], item["name"], item["checked"]) for item in items.json()] == [
        (existing_id, "Milk", False),
    ]


def test_add_item_merges_compatible_active_quantity_instead_of_creating_duplicate():
    token, _family_id, list_id = _seed_owner()
    first = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "Milk", "spec": "2 L"},
        headers=_auth(token),
    )
    assert first.status_code == 200, first.json()

    second = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": " milk ", "spec": "1 l"},
        headers=_auth(token),
    )

    assert second.status_code == 200, second.json()
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["spec"] == "3 L"
    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["name"], item["spec"], item["checked"]) for item in items.json()] == [
        ("Milk", "3 L", False),
    ]


def test_add_item_emits_created_then_updated_events_for_merge(monkeypatch):
    token, _family_id, list_id = _seed_owner()
    from app.modules import shopping_router

    ws_events = []
    webhook_events = []
    monkeypatch.setattr(
        shopping_router,
        "broadcast_shopping_event",
        lambda scope, scope_id, event_type, payload: ws_events.append(event_type),
    )
    monkeypatch.setattr(
        shopping_router,
        "dispatch_webhook_event",
        lambda _db, **kwargs: webhook_events.append(kwargs["event_type"]),
    )
    monkeypatch.setattr(shopping_router, "dispatch_shopping_destination_event", lambda **_kwargs: None)

    first = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "Milk", "spec": "2 L"},
        headers=_auth(token),
    )
    second = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "milk", "spec": "1 l"},
        headers=_auth(token),
    )

    assert first.status_code == second.status_code == 200
    assert ws_events == ["item_added", "item_updated"]
    assert webhook_events == ["shopping.item.created", "shopping.item.updated"]


def test_category_is_remembered_after_checked_item_is_cleared_and_readded():
    token, _family_id, list_id = _seed_owner()
    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "Limes", "category": "Fruit & Vegetables"},
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()
    checked = client.patch(
        f"/shopping/items/{created.json()['id']}",
        json={"checked": True},
        headers=_auth(token),
    )
    assert checked.status_code == 200, checked.json()
    cleared = client.delete(f"/shopping/lists/{list_id}/checked", headers=_auth(token))
    assert cleared.status_code == 200, cleared.json()
    assert cleared.json()["deleted_count"] == 1

    readded = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "limes"},
        headers=_auth(token),
    )

    assert readded.status_code == 200, readded.json()
    assert readded.json()["category"] == "Fruit & Vegetables"


def test_explicit_category_edit_wins_and_updates_memory():
    token, _family_id, list_id = _seed_owner()
    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "Bread", "category": "Pantry"},
        headers=_auth(token),
    )
    edited = client.patch(
        f"/shopping/items/{created.json()['id']}",
        json={"category": " Bakery "},
        headers=_auth(token),
    )
    assert edited.status_code == 200, edited.json()
    assert edited.json()["category"] == "Bakery"
    assert client.patch(
        f"/shopping/items/{created.json()['id']}",
        json={"checked": True},
        headers=_auth(token),
    ).status_code == 200
    assert client.delete(f"/shopping/lists/{list_id}/checked", headers=_auth(token)).status_code == 200

    readded = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "bread", "category": ""},
        headers=_auth(token),
    )
    assert readded.status_code == 200, readded.json()
    assert readded.json()["category"] == "Bakery"


def test_add_item_keeps_separate_rows_when_details_differ_and_capitalizes_names():
    token, _family_id, list_id = _seed_owner()
    db = TestSession()
    checked_item = ShoppingItem(
        list_id=list_id,
        name="Milk",
        spec="1 L",
        checked=True,
        checked_at=utcnow(),
    )
    db.add(checked_item)
    db.commit()
    existing_id = checked_item.id
    db.close()

    response = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "milk", "spec": "2 kg"},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] != existing_id
    assert response.json()["name"] == "Milk"
    assert response.json()["spec"] == "2 kg"
    assert response.json()["checked"] is False

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["name"], item["spec"], item["checked"]) for item in items.json()] == [
        ("Milk", "2 kg", False),
        ("Milk", "1 L", True),
    ]


def test_update_item_capitalizes_name():
    token, _family_id, list_id = _seed_owner()
    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "bread"},
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()

    updated = client.patch(
        f"/shopping/items/{created.json()['id']}",
        json={"name": "butter"},
        headers=_auth(token),
    )

    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Butter"


def test_blank_after_trim_names_are_rejected():
    token, _family_id, list_id = _seed_owner()

    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "   "},
        headers=_auth(token),
    )
    assert created.status_code == 422

    valid = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "bread"},
        headers=_auth(token),
    )
    assert valid.status_code == 200, valid.json()

    updated = client.patch(
        f"/shopping/items/{valid.json()['id']}",
        json={"name": "   "},
        headers=_auth(token),
    )
    assert updated.status_code == 422
