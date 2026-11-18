"""Recipe helpers shared by the recipe, recipe quality-of-life and meal plan tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.support import auth, seed_member


def ingredient(name: str, amount: float | None = None, unit: str | None = None) -> dict:
    """An ingredient payload with only the given fields."""
    out: dict = {"name": name}
    if amount is not None:
        out["amount"] = amount
    if unit is not None:
        out["unit"] = unit
    return out


def seed_recipe_member(scopes: str, suffix: str, family_id: int | None = None) -> tuple[str, int]:
    """An adult with a PAT, in a new family unless ``family_id`` is given. Returns (token, family_id)."""
    member = seed_member(f"recipe-{suffix}@example.com", scopes=scopes, family_id=family_id, display_name="Recipe User")
    return member.token, member.family_id


def create_recipe(client: TestClient, token: str, family_id: int, title: str = "Pancakes") -> dict:
    """Creates a pancake-style recipe through the API (with duplicate flour and tags) and returns it."""
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
                ingredient("Flour", 250, "g"),
                ingredient("flour", 200, "g"),
                ingredient("Milk", 300, "ml"),
                ingredient("Salt"),
            ],
            "instructions": "Mix and fry.",
        },
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()
