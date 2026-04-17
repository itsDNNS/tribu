"""Integration tests for the meal planning module.

Covers scope enforcement, child + adult access, CRUD flow, ingredient
structure + sanitization, slot and range validation, the one-meal-per-
slot-per-day invariant, ingredient autocomplete, and the
push-ingredients-onto-a-shopping-list integration (including the
subset-of-meal guard that stops the endpoint from being used as a
backdoor shopping writer).
"""

import hashlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, MealPlan, Membership, PersonalAccessToken, ShoppingList, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-meal-plans.db",
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


def _seed_member(scopes: str, suffix: str, is_adult: bool = True, family_id: int | None = None) -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"meal-{suffix}@example.com",
        password_hash=hash_password("password"),
        display_name="Meal User",
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name="Meal Family")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))

    plain = f"{PAT_PREFIX}mealpat-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="meal-pat",
        token_hash=hashlib.sha256(plain.encode()).hexdigest(),
        token_lookup=hashlib.sha256(plain.encode()).hexdigest(),
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain, family_id


def _seed_shopping_list(family_id: int, name: str = "Meal Ingredients") -> int:
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name=name)
    db.add(shopping_list)
    db.commit()
    list_id = shopping_list.id
    db.close()
    return list_id


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _ing(name: str, amount: float | None = None, unit: str | None = None) -> dict:
    out: dict = {"name": name}
    if amount is not None:
        out["amount"] = amount
    if unit is not None:
        out["unit"] = unit
    return out


class TestMealPlanScopes:
    def test_list_requires_read_scope(self):
        token, family_id = _seed_member("meal_plans:write", "scope-a")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=_auth(token),
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
            headers=_auth(token),
        )
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = _seed_member("*", "scope-c")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=_auth(token),
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
            headers=_auth(token),
        )
        assert post.status_code == 200, post.json()
        listed = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-19",
            headers=_auth(token),
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
            headers=_auth(owner_token),
        )
        plan_id = post.json()["id"]

        intruder_token, _ = _seed_member("*", "outsider-other")
        resp = client.patch(
            f"/meal-plans/{plan_id}",
            json={"meal_name": "Hacked"},
            headers=_auth(intruder_token),
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
                    _ing("Mehl", 500, "g"),
                    _ing("mehl ", 300, "g"),     # duplicate by name, case-insensitive
                    _ing("  Tomaten  ", 4, "Stueck"),
                    _ing("Kaese"),
                ],
                "notes": "Friday family dinner",
            },
            headers=_auth(token),
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
            json={"ingredients": [_ing("Basilikum"), _ing("Basilikum")]},
            headers=_auth(token),
        )
        assert patch.status_code == 200
        assert [i["name"] for i in patch.json()["ingredients"]] == ["Basilikum"]

        delete = client.delete(f"/meal-plans/{plan_id}", headers=_auth(token))
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
            headers=_auth(token),
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
            headers=_auth(token),
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
            headers=_auth(token),
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
            headers=_auth(token),
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
            headers=_auth(token),
        )
        other_id = other.json()["id"]

        collision = client.patch(
            f"/meal-plans/{other_id}",
            json={"slot": "noon"},
            headers=_auth(token),
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
            headers=_auth(token),
        ).json()
        patch = client.patch(
            f"/meal-plans/{created['id']}",
            json={"meal_name": "Porridge"},
            headers=_auth(token),
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
                headers=_auth(token),
            )
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-13&end=2026-04-14",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        names = [e["meal_name"] for e in resp.json()]
        assert "D" not in names
        assert len(names) == 3

    def test_end_before_start_returns_400(self):
        token, family_id = _seed_member("*", "range-invalid")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2026-04-19&end=2026-04-13",
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_MEAL_RANGE" in str(resp.json())

    def test_range_cap_returns_400(self):
        token, family_id = _seed_member("*", "range-cap")
        resp = client.get(
            f"/meal-plans?family_id={family_id}&start=2024-01-01&end=2026-12-31",
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_MEAL_RANGE" in str(resp.json())


class TestMealPlanIngredients:
    def test_autocomplete_distinct_case_insensitive_sorted(self):
        token, family_id = _seed_member("*", "ing-a")
        meals = [
            ("morning", [_ing("Mehl", 500, "g"), _ing("Tomaten", 4, "Stueck"), _ing("Kaese")]),
            ("noon", [_ing("mehl", 200, "g"), _ing("Basilikum", 1, "Bund")]),
            ("evening", [_ing("Olivenoel", 2, "EL"), _ing("Tomaten", 200, "g")]),
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
                headers=_auth(token),
            )
        resp = client.get(
            f"/meal-plans/ingredients?family_id={family_id}",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items == ["Basilikum", "Kaese", "Mehl", "Olivenoel", "Tomaten"]


class TestMealPlanShoppingIntegration:
    def test_push_all_ingredients_formats_spec(self):
        token, family_id = _seed_member("*", "shop-a")
        list_id = _seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Spaghetti",
                "ingredients": [
                    _ing("Spaghetti", 500, "g"),
                    _ing("Tomaten", 4, "Stueck"),
                    _ing("Basilikum"),
                ],
            },
            headers=_auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id},
            headers=_auth(token),
        )
        assert push.status_code == 200, push.json()
        assert push.json()["added_count"] == 3

        items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token)).json()
        by_name = {i["name"]: i for i in items}
        assert by_name["Spaghetti"]["spec"] == "500 g"
        assert by_name["Tomaten"]["spec"] == "4 Stueck"
        assert by_name["Basilikum"]["spec"] is None

    def test_push_subset_by_name(self):
        token, family_id = _seed_member("*", "shop-b")
        list_id = _seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Stew",
                "ingredients": [
                    _ing("Rind", 500, "g"),
                    _ing("Karotten", 3, "Stueck"),
                    _ing("Zwiebeln", 2, "Stueck"),
                    _ing("Kartoffeln", 1, "kg"),
                ],
            },
            headers=_auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={
                "shopping_list_id": list_id,
                "ingredient_names": ["zwiebeln", "Kartoffeln"],  # case-insensitive match
            },
            headers=_auth(token),
        )
        assert push.status_code == 200
        assert push.json()["added_count"] == 2

        items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token)).json()
        assert sorted(i["name"] for i in items) == ["Kartoffeln", "Zwiebeln"]

    def test_push_unknown_ingredient_returns_400(self):
        """Reject names that aren't on the meal so this endpoint can't be a backdoor shopping writer."""
        token, family_id = _seed_member("*", "shop-attack")
        list_id = _seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Salad",
                "ingredients": [_ing("Tomate")],
            },
            headers=_auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={
                "shopping_list_id": list_id,
                "ingredient_names": ["Tomate", "arbitrary.text.payload"],
            },
            headers=_auth(token),
        )
        assert push.status_code == 400
        assert "MEAL_INGREDIENT_NOT_IN_PLAN" in str(push.json())

    def test_legacy_string_ingredients_are_normalized_on_read_and_push(self):
        """Rows written before the structured-ingredient rollout must still
        serialize cleanly and push ingredients into a shopping list."""
        token, family_id = _seed_member("*", "legacy")
        list_id = _seed_shopping_list(family_id)

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
            headers=_auth(token),
        )
        assert listing.status_code == 200, listing.json()
        ingredients = listing.json()[0]["ingredients"]
        assert [i["name"] for i in ingredients] == ["Mehl", "Tomaten"]
        assert all(i["amount"] is None and i["unit"] is None for i in ingredients)

        # Autocomplete works.
        ac = client.get(f"/meal-plans/ingredients?family_id={family_id}", headers=_auth(token)).json()
        assert ac["items"] == ["Mehl", "Tomaten"]

        # Shopping push treats the legacy names as real ingredients.
        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredient_names": ["Mehl"]},
            headers=_auth(token),
        )
        assert push.status_code == 200
        assert push.json()["added_count"] == 1
        items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token)).json()
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
                "ingredients": [_ing("Broth")],
            },
            headers=_auth(token),
        )
        plan_id = post.json()["id"]

        _, other_family_id = _seed_member("*", "shop-c-other")
        other_list = _seed_shopping_list(other_family_id)
        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": other_list},
            headers=_auth(token),
        )
        assert push.status_code == 404
        assert "SHOPPING_LIST_NOT_FOUND" in str(push.json())
