"""Meal reminders with an "Add to list" button (Tribu 2.0, N-2)."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.core.push import PushResult
from app.main import app
from app.models import (
    Family,
    MealPlan,
    Membership,
    Notification,
    NotificationPreference,
    ShoppingItem,
    ShoppingList,
    User,
    UserNavOrder,
)
from app.security import hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Berlin")
    from app.core.clock import app_timezone
    from app.core import scheduler as scheduler_module

    app_timezone.cache_clear()
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    app_timezone.cache_clear()
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _seed(db, *, language: str | None = None, adult: bool = True) -> tuple[User, Family]:
    user = User(email="act@example.com", password_hash=hash_password("p"), display_name="Anna")
    family = Family(name="Act-Family")
    db.add_all([user, family])
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin" if adult else "member", is_adult=adult))
    db.add(NotificationPreference(user_id=user.id, reminders_enabled=True, reminder_minutes=30, push_enabled=True))
    if language:
        db.add(UserNavOrder(user_id=user.id, nav_order=[], ui_language=language))
    db.flush()
    return user, family


def _freeze(monkeypatch, *, audit_now: datetime, wall_now: datetime) -> None:
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: audit_now)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: wall_now)


def _capture_pushes(monkeypatch) -> list:
    from app.core import scheduler as scheduler_module

    calls = []

    def send(db, uid, title, body, link, **options):
        calls.append({"title": title, "body": body, "link": link, **options})
        return PushResult(attempted=1, succeeded=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", send)
    return calls


def _meal(monkeypatch, *, hour: int = 18, adult: bool = True, on_list: tuple[str, ...] = ("tomatoes",), with_list: bool = True):
    """A meal for tomorrow and the pushes of one scheduler run at ``hour``."""
    with TestSession() as db:
        user, family = _seed(db, language="de", adult=adult)
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
    _freeze(monkeypatch, audit_now=datetime(2026, 9, 17, hour - 2, 0), wall_now=datetime(2026, 9, 17, hour, 0))
    calls = _capture_pushes(monkeypatch)
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
