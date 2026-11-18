"""Meal reminders with an "Add to list" button (Tribu 2.0, N-2)."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import MealPlan, Notification, ShoppingItem, ShoppingList
from tests.notification_support import add_reader
from tests.support import TestSession, capture_pushes, freeze_scheduler

pytestmark = pytest.mark.usefixtures("scheduler_db", "berlin_tz")

client = TestClient(app)


def _meal(monkeypatch, *, hour: int = 18, adult: bool = True, on_list: tuple[str, ...] = ("tomatoes",), with_list: bool = True):
    """A meal for tomorrow and the pushes of one scheduler run at ``hour``."""
    with TestSession() as db:
        user, family = add_reader(db, language="de", adult=adult)
        if with_list:
            groceries = ShoppingList(family_id=family.id, name="Groceries", created_by_user_id=user.id)
            db.add(groceries)
            db.flush()
            for name in on_list:
                db.add(ShoppingItem(list_id=groceries.id, name=name, checked=False))
        plan = MealPlan(
            family_id=family.id,
            plan_date=datetime(2026, 9, 18).date(),
            slot="evening",
            meal_name="Lasagne",
            ingredients=[
                {"name": "Pasta sheets", "amount": 250, "unit": "g"},
                {"name": "Tomatoes", "amount": None, "unit": None},
                {"name": "Parmesan", "amount": None, "unit": None},
            ],
            created_by_user_id=user.id,
        )
        db.add(plan)
        db.commit()
        plan_id = plan.id
    freeze_scheduler(monkeypatch, datetime(2026, 9, 17, hour - 2, 0), datetime(2026, 9, 17, hour, 0))
    calls = capture_pushes(monkeypatch)
    from app.core import scheduler as scheduler_module

    scheduler_module._check_notifications()
    return calls, plan_id


def test_the_evening_before_names_what_is_missing_with_an_add_button(monkeypatch):
    calls, _ = _meal(monkeypatch)
    assert len(calls) == 1
    push = calls[0]
    assert push["title"] == "Lasagne"
    assert push["body"] == "Morgen · fehlt noch auf der Liste: Pasta sheets, Parmesan"
    assert push["link"] == "/meal_plans"
    assert push["actions"] == ("shopping",)
    assert push["action_labels"] == {"shopping": "Auf die Liste"}
    with TestSession() as db:
        assert db.query(Notification).one().type == "meal_reminder"

    # Once per meal and day.
    from app.core import scheduler as scheduler_module

    scheduler_module._check_notifications()
    assert len(calls) == 1


def test_the_button_puts_the_missing_ingredients_on_the_list(monkeypatch):
    calls, _ = _meal(monkeypatch)
    token = calls[0]["action_token"]
    response = client.post("/notifications/actions", json={"token": token, "action": "shopping"})
    assert response.status_code == 200, response.json()
    assert response.json()["added_count"] == 2
    with TestSession() as db:
        items = {item.name: (item.spec, item.source) for item in db.query(ShoppingItem).all()}
    assert items == {
        "tomatoes": (None, None),
        "Pasta sheets": ("250 g", "Lasagne"),
        "Parmesan": (None, "Lasagne"),
    }
    # Pressing again adds nothing twice.
    again = client.post("/notifications/actions", json={"token": token, "action": "shopping"})
    assert again.status_code == 200
    assert again.json()["added_count"] == 0


def test_no_meal_reminder_before_the_evening(monkeypatch):
    calls, _ = _meal(monkeypatch, hour=16)
    assert calls == []


def test_no_meal_reminder_when_everything_is_on_the_list(monkeypatch):
    calls, _ = _meal(monkeypatch, on_list=("Tomatoes", "pasta sheets", "Parmesan"))
    assert calls == []


def test_no_meal_reminder_without_a_list(monkeypatch):
    calls, _ = _meal(monkeypatch, with_list=False)
    assert calls == []


def test_children_get_no_meal_reminder(monkeypatch):
    calls, _ = _meal(monkeypatch, adult=False)
    assert calls == []
