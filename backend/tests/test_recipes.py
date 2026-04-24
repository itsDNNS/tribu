"""Integration tests for the lightweight recipe library."""

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
    "sqlite:///./test-recipes.db",
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


def _seed_member(scopes: str, suffix: str, family_id: int | None = None) -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"recipe-{suffix}@example.com",
        password_hash=hash_password("password"),
        display_name="Recipe User",
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name="Recipe Family")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role="admin", is_adult=True))

    plain = f"{PAT_PREFIX}recipepat-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    token_hash = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="recipe-pat",
        token_hash=token_hash,
        token_lookup=token_hash,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain, family_id


def _seed_shopping_list(family_id: int) -> int:
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name="Recipe Groceries")
    db.add(shopping_list)
    db.commit()
    list_id = shopping_list.id
    db.close()
    return list_id


def _ing(name: str, amount: float | None = None, unit: str | None = None) -> dict:
    out: dict = {"name": name}
    if amount is not None:
        out["amount"] = amount
    if unit is not None:
        out["unit"] = unit
    return out


def _create_recipe(token: str, family_id: int, title: str = "Pancakes") -> dict:
    resp = client.post(
        "/recipes",
        json={
            "family_id": family_id,
            "title": title,
            "description": "Weekend breakfast",
            "source_url": "https://example.com/pancakes",
            "servings": 4,
            "tags": ["Breakfast", " breakfast ", "Family"],
            "ingredients": [
                _ing("Flour", 250, "g"),
                _ing("flour", 200, "g"),
                _ing("Milk", 300, "ml"),
                _ing("Salt"),
            ],
            "instructions": "Mix and fry.",
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()


class TestRecipeScopes:
    def test_list_requires_read_scope(self):
        token, family_id = _seed_member("recipes:write", "scope-a")
        resp = client.get(f"/recipes?family_id={family_id}", headers=_auth(token))
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_create_requires_write_scope(self):
        token, family_id = _seed_member("recipes:read", "scope-b")
        resp = client.post(
            "/recipes",
            json={"family_id": family_id, "title": "Soup"},
            headers=_auth(token),
        )
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = _seed_member("*", "scope-c")
        resp = client.get(f"/recipes?family_id={family_id}", headers=_auth(token))
        assert resp.status_code == 200


class TestRecipeCrud:
    def test_full_flow_and_sanitization(self):
        token, family_id = _seed_member("*", "crud-a")
        created = _create_recipe(token, family_id)

        assert created["title"] == "Pancakes"
        assert created["description"] == "Weekend breakfast"
        assert created["source_url"] == "https://example.com/pancakes"
        assert created["servings"] == 4
        assert created["tags"] == ["Breakfast", "Family"]
        assert [i["name"] for i in created["ingredients"]] == ["Flour", "Milk", "Salt"]
        assert created["ingredients"][0]["amount"] == 250
        assert created["ingredients"][0]["unit"] == "g"
        assert created["ingredients"][2]["amount"] is None

        listed = client.get(f"/recipes?family_id={family_id}", headers=_auth(token))
        assert listed.status_code == 200
        assert [r["title"] for r in listed.json()] == ["Pancakes"]

        recipe_id = created["id"]
        patch = client.patch(
            f"/recipes/{recipe_id}",
            json={"title": "  Better Pancakes  ", "ingredients": [_ing("Eggs", 2, "pcs"), _ing("Eggs", 3, "pcs")]},
            headers=_auth(token),
        )
        assert patch.status_code == 200
        assert patch.json()["title"] == "Better Pancakes"
        assert [i["name"] for i in patch.json()["ingredients"]] == ["Eggs"]

        get_one = client.get(f"/recipes/{recipe_id}", headers=_auth(token))
        assert get_one.status_code == 200
        assert get_one.json()["title"] == "Better Pancakes"

        null_title = client.patch(
            f"/recipes/{recipe_id}",
            json={"title": None, "description": "  Keep title  "},
            headers=_auth(token),
        )
        assert null_title.status_code == 200
        assert null_title.json()["title"] == "Better Pancakes"
        assert null_title.json()["description"] == "Keep title"

        delete = client.delete(f"/recipes/{recipe_id}", headers=_auth(token))
        assert delete.status_code == 200
        assert delete.json()["recipe_id"] == recipe_id

    def test_outsider_gets_404(self):
        owner_token, family_id = _seed_member("*", "outsider-owner")
        recipe = _create_recipe(owner_token, family_id)

        intruder_token, _ = _seed_member("*", "outsider-other")
        resp = client.get(f"/recipes/{recipe['id']}", headers=_auth(intruder_token))
        assert resp.status_code == 404
        assert "RECIPE_NOT_FOUND" in str(resp.json())


class TestRecipeShopping:
    def test_adds_selected_ingredients_to_shopping(self):
        token, family_id = _seed_member("*", "shopping-a")
        recipe = _create_recipe(token, family_id)
        list_id = _seed_shopping_list(family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Flour", "Salt"]},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["added_count"] == 2

        items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
        assert items.status_code == 200
        data = items.json()
        assert [item["name"] for item in data] == ["Flour", "Salt"]
        assert data[0]["spec"] == "250 g"
        assert data[1]["spec"] is None

    def test_rejects_unknown_ingredient_name(self):
        token, family_id = _seed_member("*", "shopping-b")
        recipe = _create_recipe(token, family_id)
        list_id = _seed_shopping_list(family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Butter"]},
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "RECIPE_INGREDIENT_NOT_IN_RECIPE" in str(resp.json())

    def test_rejects_other_family_shopping_list(self):
        token, family_id = _seed_member("*", "shopping-owner")
        recipe = _create_recipe(token, family_id)
        _, other_family_id = _seed_member("*", "shopping-other")
        other_list_id = _seed_shopping_list(other_family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": other_list_id},
            headers=_auth(token),
        )
        assert resp.status_code == 404
        assert "SHOPPING_LIST_NOT_FOUND" in str(resp.json())
