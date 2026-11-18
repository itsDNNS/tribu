"""Integration tests for the meal planning module.

Covers scope enforcement, child + adult access, CRUD flow, ingredient
structure + sanitization, slot and range validation, the one-meal-per-
slot-per-day invariant, ingredient autocomplete, and the
push-ingredients-onto-a-shopping-list integration (including the
subset-of-meal guard that stops the endpoint from being used as a
backdoor shopping writer).
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import MealPlan
from tests.recipe_support import ingredient
from tests.support import TestSession, auth, seed_member, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(scopes: str, suffix: str, is_adult: bool = True, family_id: int | None = None) -> tuple[str, int]:
    member = seed_member(
        f"meal-{suffix}@example.com", scopes=scopes, family_id=family_id, is_adult=is_adult, display_name="Meal User",
    )
    return member.token, member.family_id


class TestMealPlanScopes:
    def test_list_requires_read_scope(self):
        token, family_id = _seed_member("meal_plans:write", "scope-a")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=auth(token),
        )
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_create_requires_write_scope(self):
        token, family_id = _seed_member("meal_plans:read", "scope-b")
        resp = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Pasta",
            },
            headers=auth(token),
        )
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = _seed_member("*", "scope-c")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=auth(token),
        )
        assert resp.status_code == 200


class TestMealPlanAccess:
    def test_child_can_list_and_create(self):
        """Meal plans are visible to children; cooking is a whole-family activity."""
        token, family_id = _seed_member("*", "child-a", is_adult=False)
        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "morning",
                "meal_name": "Porridge",
            },
            headers=auth(token),
        )
        assert post.status_code == 200, post.json()
        listed = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=auth(token),
        )
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    def test_outsider_gets_404_when_viewing_entry(self):
        """Callers outside the family see 404 rather than 403 so existence stays private."""
        owner_token, family_id = _seed_member("*", "outsider-owner")
        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Soup",
            },
            headers=auth(owner_token),
        )
        plan_id = post.json()["id"]

        intruder_token, _ = _seed_member("*", "outsider-other")
        resp = client.patch(
            f"/meal-plans/{plan_id}",
            json={"meal_name": "Hacked"},
            headers=auth(intruder_token),
        )
        assert resp.status_code == 404
        assert "MEAL_PLAN_NOT_FOUND" in str(resp.json())


class TestMealPlanCrud:
    def test_full_flow_and_sanitization(self):
        token, family_id = _seed_member("*", "crud-a")
        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "evening",
                "meal_name": "  Pizza  ",
                "ingredients": [
                    ingredient("Mehl", 500, "g"),
                    ingredient("mehl ", 300, "g"),     # duplicate by name, case-insensitive
                    ingredient("  Tomaten  ", 4, "Stueck"),
                    ingredient("Kaese"),
                ],
                "notes": "Friday family dinner",
            },
            headers=auth(token),
        )
        assert post.status_code == 200, post.json()
        created = post.json()
        assert created["meal_name"] == "Pizza"
        ingredients = created["ingredients"]
        assert [i["name"] for i in ingredients] == ["Mehl", "Tomaten", "Kaese"]
        assert ingredients[0]["amount"] == 500
        assert ingredients[0]["unit"] == "g"
        assert ingredients[2]["amount"] is None
        assert ingredients[2]["unit"] is None
        # preserve first-seen casing + ignore the duplicate "mehl" trailing-space variant
        assert ingredients[0]["name"] == "Mehl"

        plan_id = created["id"]
        patch = client.patch(
            f"/meal-plans/{plan_id}",
            json={"ingredients": [ingredient("Basilikum"), ingredient("Basilikum")]},
            headers=auth(token),
        )
        assert patch.status_code == 200
        assert [i["name"] for i in patch.json()["ingredients"]] == ["Basilikum"]

        delete = client.delete(f"/meal-plans/{plan_id}", headers=auth(token))
        assert delete.status_code == 200
        assert delete.json()["meal_plan_id"] == plan_id

    def test_invalid_slot_returns_400(self):
        token, family_id = _seed_member("*", "crud-slot")
        resp = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "brunch",
                "meal_name": "Pancakes",
            },
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_MEAL_SLOT" in str(resp.json())

    def test_duplicate_slot_returns_409(self):
        token, family_id = _seed_member("*", "crud-dup")
        first = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Pasta",
            },
            headers=auth(token),
        )
        assert first.status_code == 200
        second = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Pizza",
            },
            headers=auth(token),
        )
        assert second.status_code == 409
        assert "MEAL_SLOT_TAKEN" in str(second.json())

    def test_patch_onto_occupied_slot_returns_409(self):
        token, family_id = _seed_member("*", "crud-patch-dup")
        # occupy Monday noon
        client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Pasta",
            },
            headers=auth(token),
        )
        # create a second row elsewhere we'll try to move onto Monday noon
        other = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "evening",
                "meal_name": "Pizza",
            },
            headers=auth(token),
        )
        other_id = other.json()["id"]

        collision = client.patch(
            f"/meal-plans/{other_id}",
            json={"slot": "noon"},
            headers=auth(token),
        )
        assert collision.status_code == 409
        assert "MEAL_SLOT_TAKEN" in str(collision.json())

    def test_patch_in_place_does_not_409(self):
        """Updating the same row without moving its date/slot must not collide with itself."""
        token, family_id = _seed_member("*", "crud-in-place")
        created = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "morning",
                "meal_name": "Toast",
            },
            headers=auth(token),
        ).json()
        patch = client.patch(
            f"/meal-plans/{created['id']}",
            json={"meal_name": "Porridge"},
            headers=auth(token),
        )
        assert patch.status_code == 200
        assert patch.json()["meal_name"] == "Porridge"


class TestMealPlanListRange:
    def test_range_filter_and_ordering(self):
        token, family_id = _seed_member("*", "range-a")
        for day_offset, slot, name in [
            (0, "morning", "A"),
            (0, "evening", "B"),
            (1, "noon", "C"),
            (5, "noon", "D"),  # outside the requested range
        ]:
            client.post(
                "/meal-plans",
                json={
                    "family_id": family_id,
                    "plan_date": (date(2026, 4, 13) + timedelta(days=day_offset)).isoformat(),
                    "slot": slot,
                    "meal_name": name,
                },
                headers=auth(token),
            )
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-14",
            headers=auth(token),
        )
        assert resp.status_code == 200
        names = [e["meal_name"] for e in resp.json()]
        assert "D" not in names
        assert len(names) == 3

    def test_end_before_start_returns_400(self):
        token, family_id = _seed_member("*", "range-invalid")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-19&end=2026-04-13",
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_MEAL_RANGE" in str(resp.json())

    def test_range_cap_returns_400(self):
        token, family_id = _seed_member("*", "range-cap")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2024-01-01&end=2026-12-31",
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_MEAL_RANGE" in str(resp.json())


class TestMealPlanIngredients:
    def test_autocomplete_distinct_case_insensitive_sorted(self):
        token, family_id = _seed_member("*", "ing-a")
        meals = [
            ("morning", [ingredient("Mehl", 500, "g"), ingredient("Tomaten", 4, "Stueck"), ingredient("Kaese")]),
            ("noon", [ingredient("mehl", 200, "g"), ingredient("Basilikum", 1, "Bund")]),
            ("evening", [ingredient("Olivenoel", 2, "EL"), ingredient("Tomaten", 200, "g")]),
        ]
        for slot, ingredients in meals:
            client.post(
                "/meal-plans",
                json={
                    "family_id": family_id,
                    "plan_date": "2026-04-13",
                    "slot": slot,
                    "meal_name": slot.capitalize(),
                    "ingredients": ingredients,
                },
                headers=auth(token),
            )
        resp = client.get(
            f"/meal-plans/ingredients?family_id={family_id}",
            headers=auth(token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items == ["Basilikum", "Kaese", "Mehl", "Olivenoel", "Tomaten"]


class TestWeeklyMealPlanShoppingIntegration:
    def test_push_week_merges_compatible_duplicates_and_preserves_unsafe_items(self):
        token, family_id = _seed_member("*", "week-shop")
        list_id = seed_shopping_list(family_id)

        meals = [
            ("2026-04-13", "morning", "Pancakes", [ingredient("Flour", 500, "g"), ingredient("Milk", 1, "l"), ingredient("Basil")]),
            ("2026-04-14", "noon", "Pasta", [ingredient("flour", 250, "g"), ingredient("Milk", 500, "ml"), ingredient("basil")]),
            ("2026-04-15", "evening", "Cake", [ingredient("Sugar", 2, "tbsp"), ingredient("Sugar")]),
        ]
        for plan_date, slot, meal_name, ingredients in meals:
            resp = client.post(
                "/meal-plans",
                json={
                    "family_id": family_id,
                    "plan_date": plan_date,
                    "slot": slot,
                    "meal_name": meal_name,
                    "ingredients": ingredients,
                },
                headers=auth(token),
            )
            assert resp.status_code == 200, resp.json()

        push = client.post(
            "/meal-plans/week/add-to-shopping",
            json={
                "family_id": family_id,
                "week_start": "2026-04-13",
                "shopping_list_id": list_id,
            },
            headers=auth(token),
        )
        assert push.status_code == 200, push.json()
        assert push.json()["added_count"] == 5
        assert push.json()["created_count"] == 5

        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        pairs = sorted((item["name"], item["spec"]) for item in items)
        assert pairs == sorted([
            ("Basil", None),
            ("Flour", "750 g"),
            ("Milk", "1 l"),
            ("Milk", "500 ml"),
            ("Sugar", "2 tbsp"),
        ])
        # Each item says which meals it is for (Tribu 2.0, L5).
        sources = sorted((item["name"], item["spec"], item["source"]) for item in items)
        assert sources == sorted([
            ("Basil", None, "Pancakes, Pasta"),
            ("Flour", "750 g", "Pancakes, Pasta"),
            ("Milk", "1 l", "Pancakes"),
            ("Milk", "500 ml", "Pasta"),
            ("Sugar", "2 tbsp", "Cake"),
        ])

        pushed_again = client.post(
            "/meal-plans/week/add-to-shopping",
            json={
                "family_id": family_id,
                "week_start": "2026-04-13",
                "shopping_list_id": list_id,
            },
            headers=auth(token),
        )
        assert pushed_again.status_code == 200, pushed_again.json()
        assert pushed_again.json()["added_count"] == 5
        assert pushed_again.json()["created_count"] == 0
        assert pushed_again.json()["merged_count"] == 5

    def test_push_week_only_uses_selected_family_week_and_target_list_family(self):
        token, family_id = _seed_member("*", "week-scope")
        list_id = seed_shopping_list(family_id)

        in_week = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Soup",
                "ingredients": [ingredient("Carrot", 2, "pcs")],
            },
            headers=auth(token),
        )
        assert in_week.status_code == 200
        out_of_week = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-20",
                "slot": "noon",
                "meal_name": "Next soup",
                "ingredients": [ingredient("Potato", 3, "pcs")],
            },
            headers=auth(token),
        )
        assert out_of_week.status_code == 200

        push = client.post(
            "/meal-plans/week/add-to-shopping",
            json={"family_id": family_id, "week_start": "2026-04-13", "shopping_list_id": list_id},
            headers=auth(token),
        )
        assert push.status_code == 200
        assert push.json()["added_count"] == 1
        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert [(item["name"], item["spec"]) for item in items] == [("Carrot", "2 pcs")]

        _, other_family_id = _seed_member("*", "week-other")
        other_list = seed_shopping_list(other_family_id)
        bad = client.post(
            "/meal-plans/week/add-to-shopping",
            json={"family_id": family_id, "week_start": "2026-04-13", "shopping_list_id": other_list},
            headers=auth(token),
        )
        assert bad.status_code == 404
        assert "SHOPPING_LIST_NOT_FOUND" in str(bad.json())


class TestMealPlanShoppingIntegration:
    def test_push_all_ingredients_formats_spec(self):
        token, family_id = _seed_member("*", "shop-a")
        list_id = seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Spaghetti",
                "ingredients": [
                    ingredient("Spaghetti", 500, "g"),
                    ingredient("Tomaten", 4, "Stueck"),
                    ingredient("Basilikum"),
                ],
            },
            headers=auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id},
            headers=auth(token),
        )
        assert push.status_code == 200, push.json()
        assert push.json()["added_count"] == 3

        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        by_name = {i["name"]: i for i in items}
        assert by_name["Spaghetti"]["spec"] == "500 g"
        assert by_name["Tomaten"]["spec"] == "4 Stueck"
        assert by_name["Basilikum"]["spec"] is None

    def test_push_subset_by_name(self):
        token, family_id = _seed_member("*", "shop-b")
        list_id = seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Stew",
                "ingredients": [
                    ingredient("Rind", 500, "g"),
                    ingredient("Karotten", 3, "Stueck"),
                    ingredient("Zwiebeln", 2, "Stueck"),
                    ingredient("Kartoffeln", 1, "kg"),
                ],
            },
            headers=auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={
                "shopping_list_id": list_id,
                "ingredient_names": ["zwiebeln", "Kartoffeln"],  # case-insensitive match
            },
            headers=auth(token),
        )
        assert push.status_code == 200
        assert push.json()["added_count"] == 2

        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert sorted(i["name"] for i in items) == ["Kartoffeln", "Zwiebeln"]

        pushed_again = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Zwiebeln", "Kartoffeln"]},
            headers=auth(token),
        )
        assert pushed_again.status_code == 200, pushed_again.json()
        assert pushed_again.json()["created_count"] == 0
        assert pushed_again.json()["merged_count"] == 2
        merged = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert sorted((item["name"], item["spec"]) for item in merged) == [
            ("Kartoffeln", "2 kg"),
            ("Zwiebeln", "4 Stueck"),
        ]

    def test_push_unknown_ingredient_returns_400(self):
        """Reject names that aren't on the meal so this endpoint can't be a backdoor shopping writer."""
        token, family_id = _seed_member("*", "shop-attack")
        list_id = seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Salad",
                "ingredients": [ingredient("Tomate")],
            },
            headers=auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={
                "shopping_list_id": list_id,
                "ingredient_names": ["Tomate", "arbitrary.text.payload"],
            },
            headers=auth(token),
        )
        assert push.status_code == 400
        assert "MEAL_INGREDIENT_NOT_IN_PLAN" in str(push.json())

    def test_legacy_string_ingredients_are_normalized_on_read_and_push(self):
        """Rows written before the structured-ingredient rollout must still
        serialize cleanly and push ingredients into a shopping list."""
        token, family_id = _seed_member("*", "legacy")
        list_id = seed_shopping_list(family_id)

        # Simulate a row written by 08b44cb: ingredients stored as list[str].
        db = TestSession()
        plan = MealPlan(
            family_id=family_id,
            plan_date=date(2026, 4, 13),
            slot="noon",
            meal_name="Legacy stew",
            ingredients=["Mehl", "Tomaten", ""],
            created_by_user_id=None,
        )
        db.add(plan)
        db.commit()
        plan_id = plan.id
        db.close()

        # GET must normalize without a 500.
        listing = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-13",
            headers=auth(token),
        )
        assert listing.status_code == 200, listing.json()
        ingredients = listing.json()[0]["ingredients"]
        assert [i["name"] for i in ingredients] == ["Mehl", "Tomaten"]
        assert all(i["amount"] is None and i["unit"] is None for i in ingredients)

        # Autocomplete works.
        ac = client.get(f"/meal-plans/ingredients?family_id={family_id}", headers=auth(token)).json()
        assert ac["items"] == ["Mehl", "Tomaten"]

        # Shopping push treats the legacy names as real ingredients.
        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Mehl"]},
            headers=auth(token),
        )
        assert push.status_code == 200
        assert push.json()["added_count"] == 1
        items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
        assert [i["name"] for i in items] == ["Mehl"]
        assert items[0]["spec"] is None  # legacy rows had no amount/unit

    def test_push_to_shopping_list_from_other_family_returns_404(self):
        token, family_id = _seed_member("*", "shop-c-own")
        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Soup",
                "ingredients": [ingredient("Broth")],
            },
            headers=auth(token),
        )
        plan_id = post.json()["id"]

        _, other_family_id = _seed_member("*", "shop-c-other")
        other_list = seed_shopping_list(other_family_id)
        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": other_list},
            headers=auth(token),
        )
        assert push.status_code == 404
        assert "SHOPPING_LIST_NOT_FOUND" in str(push.json())
