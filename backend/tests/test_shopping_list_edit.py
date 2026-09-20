"""Regression tests for shopping list rename and item moves."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, User
from app.modules import shopping_router
from app.schemas import WEBHOOK_EVENT_TYPES
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-shopping-list-edit.db",
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


def _seed_member(*, suffix: str, scopes: str = "shopping:read,shopping:write", family_id: int | None = None, is_adult: bool = True) -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"shopping-list-edit-{suffix}@example.com",
        password_hash=hash_password("Password1"),
        display_name=f"List Edit {suffix}",
    )
    db.add(user)
    db.flush()
    if family_id is None:
        family = Family(name=f"List Edit Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}shopping-list-edit-{suffix}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="shopping-list-edit-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes=scopes,
    ))
    db.commit()
    user_id = user.id
    assert family_id is not None
    db.close()
    return plain, family_id, user_id


def _seed_list(family_id: int, name: str, user_id: int | None = None) -> int:
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name=name, created_by_user_id=user_id)
    db.add(shopping_list)
    db.commit()
    list_id = shopping_list.id
    db.close()
    return list_id


def _seed_item(list_id: int, name: str = "Bread", *, checked: bool = False) -> int:
    db = TestSession()
    item = ShoppingItem(list_id=list_id, name=name, spec="1 loaf", category="Bakery", checked=checked)
    db.add(item)
    db.commit()
    item_id = item.id
    db.close()
    return item_id


def test_rename_shopping_list_updates_counts_and_dispatches_webhook(monkeypatch):
    token, family_id, user_id = _seed_member(suffix="rename")
    list_id = _seed_list(family_id, "StoreA", user_id)
    _seed_item(list_id)
    captured = []

    def fake_dispatch(db, *, family_id, event_type, data):
        captured.append({"family_id": family_id, "event_type": event_type, "data": data})
        return []

    monkeypatch.setattr(shopping_router, "dispatch_webhook_event", fake_dispatch)

    response = client.patch(
        f"/shopping/lists/{list_id}",
        json={"name": "  Store B  "},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["name"] == "Store B"
    assert response.json()["item_count"] == 1
    assert captured == [{
        "family_id": family_id,
        "event_type": "shopping.list.updated",
        "data": {"list_id": list_id, "name": "Store B", "old_name": "StoreA"},
    }]
    assert "shopping.list.updated" in WEBHOOK_EVENT_TYPES


def test_rename_shopping_list_rejects_children_and_blank_names():
    owner_token, family_id, user_id = _seed_member(suffix="owner")
    child_token, _, _ = _seed_member(suffix="child", family_id=family_id, is_adult=False)
    list_id = _seed_list(family_id, "Groceries", user_id)

    child_response = client.patch(
        f"/shopping/lists/{list_id}",
        json={"name": "Child rename"},
        headers=_auth(child_token),
    )
    assert child_response.status_code == 403

    blank_response = client.patch(
        f"/shopping/lists/{list_id}",
        json={"name": "   "},
        headers=_auth(owner_token),
    )
    assert blank_response.status_code == 422


def test_move_item_between_lists_preserves_details_and_updates_counts():
    token, family_id, user_id = _seed_member(suffix="move")
    source_id = _seed_list(family_id, "StoreA", user_id)
    target_id = _seed_list(family_id, "StoreB", user_id)
    item_id = _seed_item(source_id, checked=True)

    response = client.patch(
        f"/shopping/items/{item_id}",
        json={"list_id": target_id, "name": "baguette", "category": "Bakery aisle"},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["list_id"] == target_id
    assert response.json()["name"] == "Baguette"
    assert response.json()["spec"] == "1 loaf"
    assert response.json()["category"] == "Bakery aisle"
    assert response.json()["checked"] is True

    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=_auth(token))
    assert lists.status_code == 200
    counts = {shopping_list["name"]: (shopping_list["item_count"], shopping_list["checked_count"]) for shopping_list in lists.json()}
    assert counts == {"StoreA": (0, 0), "StoreB": (1, 1)}

    source_items = client.get(f"/shopping/lists/{source_id}/items", headers=_auth(token))
    target_items = client.get(f"/shopping/lists/{target_id}/items", headers=_auth(token))
    assert source_items.json() == []
    assert [item["id"] for item in target_items.json()] == [item_id]


def test_edit_item_allows_clearing_optional_details():
    token, family_id, user_id = _seed_member(suffix="clear")
    list_id = _seed_list(family_id, "StoreA", user_id)
    item_id = _seed_item(list_id)

    response = client.patch(
        f"/shopping/items/{item_id}",
        json={"name": "bread", "spec": None, "category": None},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["name"] == "Bread"
    assert response.json()["spec"] is None
    assert response.json()["category"] is None

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert items.json()[0]["spec"] is None
    assert items.json()[0]["category"] is None


def test_move_item_rejects_cross_family_targets_and_child_moves_but_allows_child_toggle():
    owner_token, family_id, user_id = _seed_member(suffix="owner-move")
    child_token, _, _ = _seed_member(suffix="child-move", family_id=family_id, is_adult=False)
    other_token, other_family_id, other_user_id = _seed_member(suffix="other")
    source_id = _seed_list(family_id, "Home", user_id)
    target_id = _seed_list(family_id, "Market", user_id)
    other_list_id = _seed_list(other_family_id, "Other", other_user_id)
    item_id = _seed_item(source_id)

    child_move = client.patch(
        f"/shopping/items/{item_id}",
        json={"list_id": target_id},
        headers=_auth(child_token),
    )
    assert child_move.status_code == 403

    child_toggle = client.patch(
        f"/shopping/items/{item_id}",
        json={"checked": True},
        headers=_auth(child_token),
    )
    assert child_toggle.status_code == 200, child_toggle.json()
    assert child_toggle.json()["checked"] is True

    cross_family = client.patch(
        f"/shopping/items/{item_id}",
        json={"list_id": other_list_id},
        headers=_auth(owner_token),
    )
    assert cross_family.status_code == 404

    outsider_move = client.patch(
        f"/shopping/items/{item_id}",
        json={"list_id": other_list_id},
        headers=_auth(other_token),
    )
    assert outsider_move.status_code in {403, 404}


def test_category_spelling_is_family_scoped_and_canonical_at_write_boundaries():
    token, family_id, user_id = _seed_member(suffix="category-vocabulary")
    list_id = _seed_list(family_id, "Groceries", user_id)
    headers = _auth(token)
    def add(name, category):
        response = client.post(f"/shopping/lists/{list_id}/items", json={"name": name, "category": category}, headers=headers)
        assert response.status_code == 200, response.text
        return response.json()
    first = add("Milk", " Dairy ")
    assert add("Eggs", "dAIRY")["category"] == "Dairy"
    response = client.patch(f"/shopping/items/{first['id']}", json={"category": " DAIRY "}, headers=headers)
    assert response.json()["category"] == "Dairy"
    template = client.post("/shopping/templates", json={"family_id": family_id, "name": "Basics", "items": [{"name": "Cheese", "category": "dairy"}]}, headers=headers)
    assert template.status_code == 200, template.text
    assert template.json()["items"][0]["category"] == "Dairy"
    assert client.get(f"/shopping/categories?family_id={family_id}", headers=headers).json() == ["Dairy"]


def test_conditional_check_rejects_stale_state_and_moved_item():
    token, family_id, user_id = _seed_member(suffix="conditional-check")
    list_id = _seed_list(family_id, "Groceries", user_id)
    item_id = _seed_item(list_id)
    headers = _auth(token)
    payload = {"checked": True, "expected_state": {"list_id": list_id, "checked": False, "checked_at": None}}
    response = client.patch(f"/shopping/items/{item_id}", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    assert client.patch(f"/shopping/items/{item_id}", json=payload, headers=headers).status_code == 409
    checked = response.json()
    destination = _seed_list(family_id, "Other", user_id)
    assert client.patch(f"/shopping/items/{item_id}", json={"list_id": destination}, headers=headers).status_code == 200
    undo = {"checked": False, "expected_state": {"list_id": list_id, "checked": True, "checked_at": checked['checked_at']}}
    assert client.patch(f"/shopping/items/{item_id}", json=undo, headers=headers).status_code == 409


def test_category_vocabulary_unicode_isolation_templates_and_learned_categories():
    token, family_id, user_id = _seed_member(suffix="unicode-categories")
    other, other_family, other_user = _seed_member(suffix="other-categories")
    list_id = _seed_list(family_id, "Groceries", user_id)
    other_list = _seed_list(other_family, "Other", other_user)
    headers = _auth(token)
    def add(name, category=None):
        response = client.post(f"/shopping/lists/{list_id}/items", json={"name": name, "category": category}, headers=headers)
        assert response.status_code == 200, response.text
        return response.json()
    for index, (first, variant) in enumerate([("Straße", "STRASSE"), ("İçecek", "i̇çecek"), ("Σ", "ς")]):
        assert add(f"First {index}", first)["category"] == first
        assert add(f"Second {index}", f" {variant} ")["category"] == first
    assert add("Dotless", "ıce")["category"] == "ıce"
    assert add("Ascii", "ICE")["category"] == "ICE"
    isolated = client.post(f"/shopping/lists/{other_list}/items", json={"name": "Other", "category": "STRASSE"}, headers=_auth(other))
    assert isolated.json()["category"] == "STRASSE"
    assert client.get(f"/shopping/categories?family_id={family_id}", headers=_auth(other)).status_code == 403
    milk = add("Milk", "Dairy")
    assert client.delete(f"/shopping/items/{milk['id']}", headers=headers).status_code == 200
    assert add("Milk")["category"] == "Dairy"
    template = client.post("/shopping/templates", json={"family_id": family_id, "name": "Basics", "items": [
        {"name": "Peach", "category": "Fruit"}, {"name": "Plum", "category": " fruit "},
    ]}, headers=headers).json()
    assert [item["category"] for item in template["items"]] == ["Fruit", "Fruit"]
    edited = client.patch(f"/shopping/templates/{template['id']}", json={"items": [{"name": "Cheese", "category": " DAIRY "}]}, headers=headers)
    assert edited.json()["items"][0]["category"] == "Dairy"
    assert client.post(f"/shopping/templates/{template['id']}/apply", json={"list_id": list_id}, headers=headers).status_code == 200
    items = client.get(f"/shopping/lists/{list_id}/items", headers=headers).json()
    assert next(item for item in items if item["name"] == "Cheese")["category"] == "Dairy"


def test_conditional_child_toggle_undo_conflict_deletion_and_checked_order():
    owner, family_id, user_id = _seed_member(suffix="status-owner")
    child, _, _ = _seed_member(suffix="status-child", family_id=family_id, is_adult=False)
    list_id = _seed_list(family_id, "Groceries", user_id)
    first = _seed_item(list_id, "First")
    second = _seed_item(list_id, "Second")
    legacy = _seed_item(list_id, "Legacy", checked=True)
    headers = _auth(child)
    def toggle(item_id, checked, expected):
        return client.patch(f"/shopping/items/{item_id}", json={"checked": checked, "expected_state": expected}, headers=headers)
    expected = {"list_id": list_id, "checked": False, "checked_at": None}
    checked_first = toggle(first, True, expected).json()
    checked_second = toggle(second, True, expected).json()
    items = client.get(f"/shopping/lists/{list_id}/items", headers=headers).json()
    assert [item["id"] for item in items] == [second, first, legacy]
    undo_expected = {key: checked_second[key] for key in ("list_id", "checked", "checked_at")}
    unchecked = toggle(second, False, undo_expected)
    assert unchecked.status_code == 200
    assert toggle(second, False, undo_expected).status_code == 409
    assert toggle(second, True, expected).status_code == 200
    assert toggle(second, False, undo_expected).status_code == 409
    assert client.patch(f"/shopping/items/{first}", json={"category": None, "checked": False, "expected_state": undo_expected}, headers=headers).status_code == 403
    assert client.delete(f"/shopping/items/{second}", headers=_auth(owner)).status_code == 200
    assert toggle(second, False, undo_expected).status_code == 404

# Visual-shopping persistence and authorization contracts.
def test_product_details_archive_and_restore_preserve_metadata(monkeypatch):
    token, family_id, user_id = _seed_member(suffix="visual")
    list_id = _seed_list(family_id, "Weekly", user_id)
    other = _seed_item(list_id, "Bread")
    photo = "data:image/png;base64,iVBORw0KGgo="
    response = client.post(f"/shopping/lists/{list_id}/items", headers=_auth(token), json={
        "name":"Milk", "spec":"2 l", "category":"Dairy", "notes":"1.5% fat", "priority":"urgent", "photo":photo})
    assert response.status_code == 200, response.text
    item_id = response.json()["id"]
    client.patch(f"/shopping/items/{item_id}", headers=_auth(token), json={"checked":True})
    events = []
    monkeypatch.setattr(shopping_router, "broadcast_shopping_event", lambda *args: events.append(args))
    completed = client.post(f"/shopping/lists/{list_id}/complete", headers=_auth(token))
    assert completed.status_code == 200
    assert completed.json()[0]["archived"] is True
    assert events[0][2] == "item_updated"
    current = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token)).json()
    assert [item["id"] for item in current] == [other]
    history = client.get(f"/shopping/lists/{list_id}/items?include_archived=true", headers=_auth(token)).json()
    archived = next(item for item in history if item["id"] == item_id)
    assert archived["notes"] == "1.5% fat" and archived["photo"] == photo and archived["priority"] == "urgent"
    counts = client.get(f"/shopping/lists?family_id={family_id}", headers=_auth(token)).json()[0]
    assert counts["item_count"] == 1 and counts["checked_count"] == 0
    restored = client.post(f"/shopping/lists/{list_id}/items", headers=_auth(token), json={"name":"Milk","spec":"1 l"})
    assert restored.status_code == 200
    assert restored.json()["id"] == item_id and restored.json()["archived"] is False
    assert restored.json()["notes"] == "1.5% fat" and restored.json()["priority"] == "urgent"
    removed_photo = client.patch(f"/shopping/items/{item_id}", headers=_auth(token), json={"photo":None})
    assert removed_photo.json()["photo"] is None


def test_category_order_and_icon_are_per_list_and_broadcast(monkeypatch):
    token, family_id, user_id = _seed_member(suffix="departments")
    first = _seed_list(family_id, "Store A", user_id)
    second = _seed_list(family_id, "Store B", user_id)
    events = []
    monkeypatch.setattr(shopping_router, "broadcast_shopping_event", lambda *args: events.append(args))
    response = client.patch(f"/shopping/lists/{first}", headers=_auth(token), json={"category_order":["Bakery","Dairy"],"icon":"coffee"})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Store A" and response.json()["icon"] == "coffee"
    assert events[0][2] == "list_updated"
    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=_auth(token)).json()
    assert next(item for item in lists if item["id"] == first)["category_order"] == ["Bakery","Dairy"]
    assert next(item for item in lists if item["id"] == second)["category_order"] == []


def test_visual_fields_and_archive_keep_family_and_adult_boundaries():
    owner, family_id, user_id = _seed_member(suffix="visual-owner")
    child, _, _ = _seed_member(suffix="visual-child", family_id=family_id, is_adult=False)
    outsider, _, _ = _seed_member(suffix="visual-outsider")
    list_id = _seed_list(family_id, "Private", user_id)
    item_id = _seed_item(list_id)
    for token in [child, outsider]:
        assert client.post(f"/shopping/lists/{list_id}/complete", headers=_auth(token)).status_code == 403
        assert client.patch(f"/shopping/items/{item_id}", headers=_auth(token), json={"notes":"change"}).status_code == 403
        assert client.patch(f"/shopping/lists/{list_id}", headers=_auth(token), json={"category_order":["Bakery"]}).status_code == 403
    assert client.get(f"/shopping/lists/{list_id}/items?include_archived=true", headers=_auth(outsider)).status_code == 403
    assert client.patch(f"/shopping/items/{item_id}", headers=_auth(child), json={"checked":True}).status_code == 200
    for payload in [{"photo":"https://example.com/photo.png"},{"photo":"data:image/svg+xml;base64,PHN2Zz4="},{"photo":"data:image/png;base64,invalid"},{"notes":"x"*501},{"priority":"invalid"}]:
        assert client.patch(f"/shopping/items/{item_id}", headers=_auth(owner), json=payload).status_code == 422
