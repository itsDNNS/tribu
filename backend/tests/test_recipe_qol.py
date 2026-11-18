"""Quality-of-life coverage for recipe favorites, recents, and scaling metadata."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.recipe_support import create_recipe, seed_recipe_member
from tests.support import auth, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def test_favorite_recipes_are_returned_first_and_can_be_toggled():
    token, family_id = seed_recipe_member("*", "qol-favorite")
    create_recipe(client, token, family_id, title="Weeknight pasta")
    favorite = create_recipe(client, token, family_id, title="Apple pancakes")

    patch = client.patch(
        f"/recipes/{favorite['id']}",
        json={"is_favorite": True},
        headers=auth(token),
    )

    assert patch.status_code == 200, patch.json()
    assert patch.json()["is_favorite"] is True

    listed = client.get(f"/recipes?family_id={family_id}", headers=auth(token))
    assert listed.status_code == 200
    data = listed.json()
    assert [recipe["title"] for recipe in data[:2]] == ["Apple pancakes", "Weeknight pasta"]
    assert data[0]["is_favorite"] is True
    assert data[1]["is_favorite"] is False


def test_add_to_shopping_marks_recipe_recently_used():
    token, family_id = seed_recipe_member("*", "qol-recent")
    recipe = create_recipe(client, token, family_id, title="Pancakes")
    list_id = seed_shopping_list(family_id)

    before = datetime.utcnow()
    resp = client.post(
        f"/recipes/{recipe['id']}/add-to-shopping",
        json={"shopping_list_id": list_id, "ingredient_names": ["Flour"]},
        headers=auth(token),
    )

    assert resp.status_code == 200, resp.json()
    fetched = client.get(f"/recipes/{recipe['id']}", headers=auth(token))
    assert fetched.status_code == 200
    used_at = datetime.fromisoformat(fetched.json()["last_used_at"].replace("Z", "+00:00"))
    assert used_at >= before
