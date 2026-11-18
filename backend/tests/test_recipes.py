"""Integration tests for the lightweight recipe library."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.recipe_support import create_recipe, ingredient, seed_recipe_member
from tests.support import auth, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


class TestRecipeScopes:
    def test_list_requires_read_scope(self):
        token, family_id = seed_recipe_member("recipes:write", "scope-a")
        resp = client.get(f"/recipes?family_id={family_id}", headers=auth(token))
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_create_requires_write_scope(self):
        token, family_id = seed_recipe_member("recipes:read", "scope-b")
        resp = client.post(
            "/recipes",
            json={"family_id": family_id, "title": "Soup"},
            headers=auth(token),
        )
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = seed_recipe_member("*", "scope-c")
        resp = client.get(f"/recipes?family_id={family_id}", headers=auth(token))
        assert resp.status_code == 200


class TestRecipeCrud:
    def test_full_flow_and_sanitization(self):
        token, family_id = seed_recipe_member("*", "crud-a")
        created = create_recipe(client, token, family_id)

        assert created["title"] == "Pancakes"
        assert created["description"] == "Weekend breakfast"
        assert created["source_url"] == "https://example.com/pancakes"
        assert created["servings"] == 4
        assert created["tags"] == ["Breakfast", "Family"]
        assert [i["name"] for i in created["ingredients"]] == ["Flour", "Milk", "Salt"]
        assert created["ingredients"][0]["amount"] == 250
        assert created["ingredients"][0]["unit"] == "g"
        assert created["ingredients"][2]["amount"] is None

        listed = client.get(f"/recipes?family_id={family_id}", headers=auth(token))
        assert listed.status_code == 200
        assert [r["title"] for r in listed.json()] == ["Pancakes"]

        recipe_id = created["id"]
        patch = client.patch(
            f"/recipes/{recipe_id}",
            json={"title": "  Better Pancakes  ", "ingredients": [ingredient("Eggs", 2, "pcs"), ingredient("Eggs", 3, "pcs")]},
            headers=auth(token),
        )
        assert patch.status_code == 200
        assert patch.json()["title"] == "Better Pancakes"
        assert [i["name"] for i in patch.json()["ingredients"]] == ["Eggs"]

        get_one = client.get(f"/recipes/{recipe_id}", headers=auth(token))
        assert get_one.status_code == 200
        assert get_one.json()["title"] == "Better Pancakes"

        null_title = client.patch(
            f"/recipes/{recipe_id}",
            json={"title": None, "description": "  Keep title  "},
            headers=auth(token),
        )
        assert null_title.status_code == 200
        assert null_title.json()["title"] == "Better Pancakes"
        assert null_title.json()["description"] == "Keep title"

        delete = client.delete(f"/recipes/{recipe_id}", headers=auth(token))
        assert delete.status_code == 200
        assert delete.json()["recipe_id"] == recipe_id


    def test_source_url_rejects_unsafe_schemes(self):
        token, family_id = seed_recipe_member("*", "crud-url")
        create = client.post(
            "/recipes",
            json={
                "family_id": family_id,
                "title": "Unsafe",
                "source_url": "javascript:alert(1)",
            },
            headers=auth(token),
        )
        assert create.status_code == 422

        created = create_recipe(client, token, family_id, title="Safe")
        patch = client.patch(
            f"/recipes/{created['id']}",
            json={"source_url": "data:text/html,boom"},
            headers=auth(token),
        )
        assert patch.status_code == 422

    def test_outsider_gets_404(self):
        owner_token, family_id = seed_recipe_member("*", "outsider-owner")
        recipe = create_recipe(client, owner_token, family_id)

        intruder_token, _ = seed_recipe_member("*", "outsider-other")
        resp = client.get(f"/recipes/{recipe['id']}", headers=auth(intruder_token))
        assert resp.status_code == 404
        assert "RECIPE_NOT_FOUND" in str(resp.json())


class TestRecipeShopping:
    def test_adds_selected_ingredients_to_shopping(self):
        token, family_id = seed_recipe_member("*", "shopping-a")
        recipe = create_recipe(client, token, family_id)
        list_id = seed_shopping_list(family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Flour", "Salt"]},
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["added_count"] == 2

        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token))
        assert items.status_code == 200
        data = items.json()
        assert [item["name"] for item in data] == ["Flour", "Salt"]
        assert data[0]["spec"] == "250 g"
        assert data[1]["spec"] is None
        assert [item["source"] for item in data] == ["Pancakes", "Pancakes"]

        pushed_again = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Flour", "Salt"]},
            headers=auth(token),
        )
        assert pushed_again.status_code == 200, pushed_again.json()
        assert pushed_again.json()["added_count"] == 2
        assert pushed_again.json()["created_count"] == 0
        assert pushed_again.json()["merged_count"] == 2
        merged = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert [(item["name"], item["spec"]) for item in merged] == [
            ("Flour", "500 g"),
            ("Salt", None),
        ]

    def test_recipe_push_inherits_category_after_manual_item_is_cleared(self):
        token, family_id = seed_recipe_member("*", "shopping-category-memory")
        recipe = create_recipe(client, token, family_id)
        list_id = seed_shopping_list(family_id)
        manual = client.post(
            f"/shopping/lists/{list_id}/items",
            json={"name": "Flour", "spec": "250 g", "category": "Baking"},
            headers=auth(token),
        )
        assert manual.status_code == 200, manual.json()
        checked = client.patch(
            f"/shopping/items/{manual.json()['id']}",
            json={"checked": True},
            headers=auth(token),
        )
        assert checked.status_code == 200, checked.json()
        cleared = client.delete(f"/shopping/lists/{list_id}/checked", headers=auth(token))
        assert cleared.status_code == 200, cleared.json()

        pushed = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Flour"]},
            headers=auth(token),
        )
        assert pushed.status_code == 200, pushed.json()
        assert pushed.json() == {
            "added_count": 1,
            "created_count": 1,
            "merged_count": 0,
        }
        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert [(item["name"], item["spec"], item["category"]) for item in items] == [
            ("Flour", "250 g", "Baking"),
        ]

    def test_rejects_unknown_ingredient_name(self):
        token, family_id = seed_recipe_member("*", "shopping-b")
        recipe = create_recipe(client, token, family_id)
        list_id = seed_shopping_list(family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Butter"]},
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "RECIPE_INGREDIENT_NOT_IN_RECIPE" in str(resp.json())

    def test_rejects_other_family_shopping_list(self):
        token, family_id = seed_recipe_member("*", "shopping-owner")
        recipe = create_recipe(client, token, family_id)
        _, other_family_id = seed_recipe_member("*", "shopping-other")
        other_list_id = seed_shopping_list(other_family_id)

        resp = client.post(
            f"/recipes/{recipe['id']}/add-to-shopping",
            json={"shopping_list_id": other_list_id},
            headers=auth(token),
        )
        assert resp.status_code == 404
        assert "SHOPPING_LIST_NOT_FOUND" in str(resp.json())


class TestRecipeImport:
    """Reading a recipe page into a draft (discussion #511)."""

    def test_import_returns_a_draft_without_saving(self, monkeypatch):
        from app.core.recipe_import import RecipeDraft
        from app.modules import recipes_router

        token, family_id = seed_recipe_member("recipes:read,recipes:write", "import")
        monkeypatch.setattr(recipes_router, "import_recipe", lambda url: RecipeDraft(
            title="Linsensuppe",
            servings=4,
            tags=["Suppe"],
            ingredients=[{"name": "Linsen", "amount": 300.0, "unit": "g"}, {"name": "Salz", "amount": None, "unit": None}],
            instructions="Linsen waschen.\nKochen.",
        ))
        response = client.post("/recipes/import", json={"family_id": family_id, "url": "https://example.com/linsen"}, headers=auth(token))
        assert response.status_code == 200, response.text
        assert response.json() == {
            "title": "Linsensuppe",
            "description": None,
            "source_url": "https://example.com/linsen",
            "servings": 4,
            "tags": ["Suppe"],
            "ingredients": [{"name": "Linsen", "amount": 300.0, "unit": "g"}, {"name": "Salz", "amount": None, "unit": None}],
            "instructions": "Linsen waschen.\nKochen.",
        }
        assert client.get(f"/recipes?family_id={family_id}", headers=auth(token)).json() == []

    def test_import_errors_and_guards(self, monkeypatch):
        from app.core.recipe_import import RecipeImportError
        from app.modules import recipes_router

        token, family_id = seed_recipe_member("recipes:read,recipes:write", "import-errors")
        other, _ = seed_recipe_member("recipes:read,recipes:write", "import-other")
        reader, _ = seed_recipe_member("recipes:read", "import-reader", family_id=family_id)

        def fail(code):
            def raise_error(url):
                raise RecipeImportError(code, "nope")
            return raise_error

        cases = [("no_recipe", 422, "RECIPE_IMPORT_NO_RECIPE"), ("not_allowed", 422, "RECIPE_IMPORT_NOT_ALLOWED"), ("unreachable", 502, "RECIPE_IMPORT_UNREACHABLE"), ("too_large", 502, "RECIPE_IMPORT_UNREACHABLE")]
        for code, status, detail in cases:
            monkeypatch.setattr(recipes_router, "import_recipe", fail(code))
            response = client.post("/recipes/import", json={"family_id": family_id, "url": "https://example.com/x"}, headers=auth(token))
            assert response.status_code == status
            assert response.json()["detail"]["code"] == detail
        assert client.post("/recipes/import", json={"family_id": family_id, "url": "javascript:alert(1)"}, headers=auth(token)).status_code == 422
        assert client.post("/recipes/import", json={"family_id": family_id, "url": "https://example.com/x"}, headers=auth(other)).status_code == 403
        assert client.post("/recipes/import", json={"family_id": family_id, "url": "https://example.com/x"}, headers=auth(reader)).status_code == 403
