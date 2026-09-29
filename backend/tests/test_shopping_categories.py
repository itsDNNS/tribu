"""Shopping categories (discussion #512): one name per built-in category in
every language, renaming and deleting the family's own categories, and a
switch for families that do not use categories."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.shopping_categories import BUILTIN_CATEGORIES, builtin_category_key, stored_category
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingList, User
from app.modules import shopping_router
from app.security import PAT_PREFIX, hash_password


engine = create_engine("sqlite:///./test-shopping-categories.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    monkeypatch.setattr(shopping_router, "broadcast_shopping_event", lambda *args, **kwargs: None)
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)
SCOPES = "shopping:read,shopping:write,families:read,families:write"


def _seed_member(suffix: str, *, family_id: int | None = None, is_adult: bool = True) -> tuple[dict, int, int]:
    db = TestSession()
    user = User(email=f"categories-{suffix}@example.com", password_hash=hash_password("Password1"), display_name=f"Categories {suffix}")
    db.add(user)
    db.flush()
    if family_id is None:
        family = Family(name=f"Categories {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}categories-{suffix}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(user_id=user.id, name="categories", token_hash=fingerprint, token_lookup=fingerprint, scopes=SCOPES))
    db.commit()
    user_id = user.id
    db.close()
    return {"Authorization": f"Bearer {plain}"}, family_id, user_id


def _seed_list(family_id: int, user_id: int) -> int:
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name="Groceries", created_by_user_id=user_id)
    db.add(shopping_list)
    db.commit()
    list_id = shopping_list.id
    db.close()
    return list_id


def _add(headers, list_id, name, category=None):
    response = client.post(f"/shopping/lists/{list_id}/items", json={"name": name, "category": category}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_every_translation_of_a_built_in_category_is_one_category():
    assert builtin_category_key("Fruit & vegetables") == "produce"
    assert builtin_category_key(" obst & gemüse ") == "produce"
    assert builtin_category_key("Surgelés") == "frozen"
    assert builtin_category_key("Dairy") is None
    assert stored_category("Chilled") == BUILTIN_CATEGORIES["chilled"]
    assert stored_category("Dairy") == "Dairy"

    headers, family_id, user_id = _seed_member("aliases")
    list_id = _seed_list(family_id, user_id)
    # The German web app, the English app and a French user file the same shelf.
    assert _add(headers, list_id, "Apples", "Obst & Gemüse")["category"] == "Obst & Gemüse"
    assert _add(headers, list_id, "Pears", "Fruit & vegetables")["category"] == "Obst & Gemüse"
    assert _add(headers, list_id, "Plums", "Fruits & légumes")["category"] == "Obst & Gemüse"
    assert client.get(f"/shopping/categories?family_id={family_id}", headers=headers).json() == ["Obst & Gemüse"]


def test_usage_lists_categories_with_their_items_and_built_in_keys():
    headers, family_id, user_id = _seed_member("usage")
    list_id = _seed_list(family_id, user_id)
    _add(headers, list_id, "Milk", "Chilled")
    _add(headers, list_id, "Candles", "Party")
    _add(headers, list_id, "Balloons", "party")
    template = client.post("/shopping/templates", json={"family_id": family_id, "name": "Party", "items": [{"name": "Cake", "category": "Party"}]}, headers=headers)
    assert template.status_code == 200, template.text

    usage = client.get(f"/shopping/categories/usage?family_id={family_id}", headers=headers).json()
    assert {entry["name"]: (entry["builtin"], entry["items"]) for entry in usage} == {
        "Kühlregal": ("chilled", 1),
        "Party": (None, 3),
    }


def test_renaming_a_category_follows_it_everywhere_and_can_merge():
    headers, family_id, user_id = _seed_member("rename")
    list_id = _seed_list(family_id, user_id)
    candles = _add(headers, list_id, "Candles", "Party")
    _add(headers, list_id, "Tea", "Drinks & more")
    assert client.patch(f"/shopping/lists/{list_id}", json={"category_order": ["Party", "Drinks & more"]}, headers=headers).status_code == 200
    template = client.post("/shopping/templates", json={"family_id": family_id, "name": "Party", "items": [{"name": "Cake", "category": "party"}]}, headers=headers).json()

    response = client.post("/shopping/categories/rename", json={"family_id": family_id, "name": "PARTY", "new_name": "Celebration"}, headers=headers)
    assert response.status_code == 200, response.text
    assert {entry["name"] for entry in response.json()} == {"Celebration", "Drinks & more"}
    items = client.get(f"/shopping/lists/{list_id}/items", headers=headers).json()
    assert next(item for item in items if item["id"] == candles["id"])["category"] == "Celebration"
    templates = client.get(f"/shopping/templates?family_id={family_id}", headers=headers).json()
    assert next(t for t in templates if t["id"] == template["id"])["items"][0]["category"] == "Celebration"
    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=headers).json()
    assert lists[0]["category_order"] == ["Celebration", "Drinks & more"]
    # Adding "Candles" again remembers the new name.
    assert client.delete(f"/shopping/items/{candles['id']}", headers=headers).status_code == 200
    assert _add(headers, list_id, "Candles")["category"] == "Celebration"

    # A name that exists merges both; a built-in name merges into the built-in.
    merged = client.post("/shopping/categories/rename", json={"family_id": family_id, "name": "Drinks & more", "new_name": "drinks"}, headers=headers)
    assert {entry["name"]: entry["items"] for entry in merged.json()} == {"Celebration": 2, "Getränke": 1}
    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=headers).json()
    assert lists[0]["category_order"] == ["Celebration", "Getränke"]


def test_deleting_a_category_moves_its_items_to_other():
    headers, family_id, user_id = _seed_member("delete")
    list_id = _seed_list(family_id, user_id)
    candles = _add(headers, list_id, "Candles", "Party")
    assert client.patch(f"/shopping/lists/{list_id}", json={"category_order": ["Party", "Kühlregal"]}, headers=headers).status_code == 200

    response = client.delete(f"/shopping/categories?family_id={family_id}&name=party", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == []
    items = client.get(f"/shopping/lists/{list_id}/items", headers=headers).json()
    assert next(item for item in items if item["id"] == candles["id"])["category"] is None
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=headers).json()[0]["category_order"] == ["Kühlregal"]
    # The product forgot its category.
    assert client.delete(f"/shopping/items/{candles['id']}", headers=headers).status_code == 200
    assert _add(headers, list_id, "Candles")["category"] is None


def test_built_in_categories_cannot_be_renamed_or_deleted_and_children_cannot_manage():
    headers, family_id, user_id = _seed_member("guard")
    child, _, _ = _seed_member("guard-child", family_id=family_id, is_adult=False)
    list_id = _seed_list(family_id, user_id)
    _add(headers, list_id, "Milk", "Chilled")
    _add(headers, list_id, "Candles", "Party")
    built_in = client.post("/shopping/categories/rename", json={"family_id": family_id, "name": "Kühlregal", "new_name": "Dairy"}, headers=headers)
    assert built_in.status_code == 422
    assert built_in.json()["detail"]["code"] == "SHOPPING_CATEGORY_BUILTIN"
    assert client.delete(f"/shopping/categories?family_id={family_id}&name=Chilled", headers=headers).status_code == 422
    missing = client.delete(f"/shopping/categories?family_id={family_id}&name=Nope", headers=headers)
    assert missing.status_code == 404
    assert client.post("/shopping/categories/rename", json={"family_id": family_id, "name": "Party", "new_name": "Fest"}, headers=child).status_code == 403
    assert client.delete(f"/shopping/categories?family_id={family_id}&name=Party", headers=child).status_code == 403
    other, _, _ = _seed_member("guard-other")
    assert client.get(f"/shopping/categories/usage?family_id={family_id}", headers=other).status_code == 403


def test_families_can_turn_categories_off_and_on():
    headers, family_id, _ = _seed_member("switch")
    child, _, _ = _seed_member("switch-child", family_id=family_id, is_adult=False)
    family = lambda token: next(f for f in client.get("/families/me", headers=token).json() if f["family_id"] == family_id)
    assert family(headers)["shopping_categories"] is True

    off = client.put(f"/families/{family_id}/shopping-categories", json={"enabled": False}, headers=headers)
    assert off.status_code == 200, off.text
    assert off.json() == {"family_id": family_id, "enabled": False}
    assert family(headers)["shopping_categories"] is False
    assert family(child)["shopping_categories"] is False
    assert client.put(f"/families/{family_id}/shopping-categories", json={"enabled": True}, headers=child).status_code == 403
    assert client.put(f"/families/{family_id}/shopping-categories", json={"enabled": True}, headers=headers).json()["enabled"] is True
