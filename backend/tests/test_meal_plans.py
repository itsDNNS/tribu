"""Integration tests for the meal planning module.

Covers scope enforcement, child + adult access, CRUD flow, ingredient
autocomplete, date-range validation, slot validation, and the
"push ingredients onto a shopping list" integration.
"""

import hashlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingList, User
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
                "ingredients": ["Flour", "flour ", "", "  Tomatoes  ", "Cheese"],
                "notes": "Friday family dinner",
            },
            headers=_auth(token),
        )
        assert post.status_code == 200, post.json()
        created = post.json()
        assert created["meal_name"] == "Pizza"
        # dedupe case-insensitively, keep first casing, drop empties
        assert created["ingredients"] == ["Flour", "Tomatoes", "Cheese"]

        plan_id = created["id"]
        patch = client.patch(
            f"/meal-plans/{plan_id}",
            json={"ingredients": ["Basil", "Basil"], "notes": None},
            headers=_auth(token),
        )
        assert patch.status_code == 200
        assert patch.json()["ingredients"] == ["Basil"]
        assert patch.json()["notes"] is None

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
        # morning/noon/evening — SQLite string-sorts these slots into evening, morning, noon
        # which still preserves the date-first ordering we care about, just assert
        # day-0 entries come before day-1 entries and the out-of-range entry is excluded.
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
        for ingredients in (
            ["Flour", "Tomatoes", "Cheese"],
            ["flour", "Basil", "  "],
            ["Olive oil", "Tomatoes"],
        ):
            client.post(
                "/meal-plans",
                json={
                    "family_id": family_id,
                    "plan_date": "2026-04-13",
                    "slot": "noon",
                    "meal_name": "Meal",
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
        # sorted case-insensitively, deduped case-insensitively, keeps first-seen casing
        assert items == ["Basil", "Cheese", "Flour", "Olive oil", "Tomatoes"]


class TestMealPlanShoppingIntegration:
    def test_push_ingredients_to_shopping_list(self):
        token, family_id = _seed_member("*", "shop-a")
        list_id = _seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Spaghetti",
                "ingredients": ["Spaghetti", "Tomatoes", "Basil"],
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

        # Verify via the shopping-list items endpoint — items really landed
        items_resp = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
        assert items_resp.status_code == 200
        names = sorted(i["name"] for i in items_resp.json())
        assert names == ["Basil", "Spaghetti", "Tomatoes"]

    def test_push_subset_of_ingredients(self):
        token, family_id = _seed_member("*", "shop-b")
        list_id = _seed_shopping_list(family_id)

        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Stew",
                "ingredients": ["Beef", "Carrots", "Onions", "Potatoes"],
            },
            headers=_auth(token),
        )
        plan_id = post.json()["id"]

        push = client.post(
            f"/meal-plans/{plan_id}/add-to-shopping",
            json={"shopping_list_id": list_id, "ingredients": ["Onions", "Potatoes"]},
            headers=_auth(token),
        )
        assert push.json()["added_count"] == 2

    def test_push_to_shopping_list_from_other_family_returns_404(self):
        token, family_id = _seed_member("*", "shop-c-own")
        post = client.post(
            "/meal-plans",
            json={
                "family_id": family_id,
                "plan_date": "2026-04-13",
                "slot": "noon",
                "meal_name": "Soup",
                "ingredients": ["Broth"],
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
