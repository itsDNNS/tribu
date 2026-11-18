"""Universal quick capture and inbox tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Notification, ShoppingItem, Task, User, UserNavOrder
from tests.support import TestSession, auth, seed_member


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(scopes: str, suffix: str, *, is_adult: bool = True, family_id: int | None = None) -> tuple[str, int, int]:
    member = seed_member(
        f"capture-{suffix}@example.com", scopes=scopes, family_id=family_id, is_adult=is_adult, display_name="Capture User",
    )
    return member.token, member.family_id, member.user_id


def test_quick_capture_routes_to_task_shopping_and_inbox_public_safely():
    token, family_id, _ = _seed_member("*", "routes")

    task_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "  Pack sports bag  ", "destination": "task"},
        headers=auth(token),
    )
    assert task_resp.status_code == 200, task_resp.json()
    assert task_resp.json()["destination"] == "task"
    assert task_resp.json()["created_item"]["title"] == "Pack sports bag"

    shopping_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Milk", "destination": "shopping"},
        headers=auth(token),
    )
    assert shopping_resp.status_code == 200, shopping_resp.json()
    assert shopping_resp.json()["destination"] == "shopping"
    assert shopping_resp.json()["created_item"]["name"] == "Milk"

    inbox_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Call pediatrician tomorrow private token", "destination": "inbox"},
        headers=auth(token),
    )
    assert inbox_resp.status_code == 200, inbox_resp.json()
    item = inbox_resp.json()["inbox_item"]
    assert item["text"] == "Call pediatrician tomorrow private token"
    assert item["status"] == "open"
    assert "family_id" not in item
    assert "created_by_user_id" not in item
    assert item["suggested_by_user_id"] is None
    assert "converted_object_id" not in item

    db = TestSession()
    assert db.query(Task).filter(Task.family_id == family_id, Task.title == "Pack sports bag").count() == 1
    assert db.query(ShoppingItem).filter(ShoppingItem.name == "Milk").count() == 1
    db.close()

    inbox = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=auth(token))
    assert inbox.status_code == 200, inbox.json()
    assert inbox.json()["total"] == 1
    assert inbox.json()["items"][0]["text"] == "Call pediatrician tomorrow private token"
    assert "password" not in str(inbox.json()).lower()

    long_text = "Call school about the class trip, bring the signed form, ask about lunch, and confirm pickup details before Friday afternoon"
    long_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": long_text, "destination": "inbox"},
        headers=auth(token),
    )
    assert long_resp.status_code == 200, long_resp.json()
    assert long_resp.json()["inbox_item"]["text"] == long_text


def test_quick_capture_preserves_240_character_task_titles_during_create_and_conversion():
    token, family_id, _ = _seed_member("*", "task-title-boundary")
    text = "T" * 240

    direct = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": text, "destination": "task"},
        headers=auth(token),
    )
    assert direct.status_code == 200, direct.json()
    assert direct.json()["created_item"]["title"] == text

    captured = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": text, "destination": "inbox"},
        headers=auth(token),
    )
    assert captured.status_code == 200, captured.json()

    converted = client.post(
        f"/quick-capture/inbox/{captured.json()['inbox_item']['id']}/convert",
        json={"destination": "task"},
        headers=auth(token),
    )
    assert converted.status_code == 200, converted.json()
    assert converted.json()["converted_item"]["title"] == text


def test_quick_capture_direct_and_inbox_conversion_reuse_active_item():
    token, family_id, _ = _seed_member("*", "shopping-reuse")
    first = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "dish soap", "destination": "shopping"},
        headers=auth(token),
    )
    second = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": " Dish soap ", "destination": "shopping"},
        headers=auth(token),
    )
    inbox = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "DISH SOAP", "destination": "inbox"},
        headers=auth(token),
    )
    converted = client.post(
        f"/quick-capture/inbox/{inbox.json()['inbox_item']['id']}/convert",
        json={"destination": "shopping"},
        headers=auth(token),
    )

    assert first.status_code == second.status_code == converted.status_code == 200
    item_id = first.json()["created_item"]["id"]
    assert second.json()["created_item"]["id"] == item_id
    assert converted.json()["converted_item"]["id"] == item_id
    db = TestSession()
    try:
        assert db.query(ShoppingItem).filter(ShoppingItem.id == item_id).count() == 1
    finally:
        db.close()


def test_quick_capture_inbox_convert_and_dismiss_enforces_family_scope():
    token, family_id, _ = _seed_member("*", "owner")
    intruder_token, _, _ = _seed_member("*", "intruder")

    inbox_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Book dentist appointment", "destination": "inbox"},
        headers=auth(token),
    )
    item_id = inbox_resp.json()["inbox_item"]["id"]

    denied = client.post(
        f"/quick-capture/inbox/{item_id}/convert",
        json={"destination": "task"},
        headers=auth(intruder_token),
    )
    assert denied.status_code == 403

    converted = client.post(
        f"/quick-capture/inbox/{item_id}/convert",
        json={"destination": "task"},
        headers=auth(token),
    )
    assert converted.status_code == 200, converted.json()
    assert converted.json()["status"] == "converted"
    assert converted.json()["converted_to"] == "task"
    assert converted.json()["converted_item"]["title"] == "Book dentist appointment"

    inbox = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=auth(token))
    assert inbox.json()["total"] == 0

    second = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Bring cake Friday", "destination": "inbox"},
        headers=auth(token),
    ).json()["inbox_item"]
    dismissed = client.post(f"/quick-capture/inbox/{second['id']}/dismiss", headers=auth(token))
    assert dismissed.status_code == 200, dismissed.json()
    assert dismissed.json()["status"] == "dismissed"


def test_quick_capture_scope_and_adult_rules():
    child_token, family_id, _ = _seed_member("*", "child", is_adult=False)
    bad_scope_token, bad_family_id, _ = _seed_member("tasks:read", "bad-scope")

    child_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Clean room", "destination": "task"},
        headers=auth(child_token),
    )
    assert child_resp.status_code == 403

    bad_scope = client.get(f"/quick-capture/inbox?family_id={bad_family_id}", headers=auth(bad_scope_token))
    assert bad_scope.status_code == 403

    child_read = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=auth(child_token))
    assert child_read.status_code == 403

    invalid = client.post(
        "/quick-capture",
        json={"family_id": bad_family_id, "text": "x", "destination": "voice"},
        headers=auth(bad_scope_token),
    )
    assert invalid.status_code == 403


def test_children_suggest_into_the_inbox_and_adults_are_told():
    adult_token, family_id, adult_id = _seed_member("*", "parent")
    child_token, _, child_id = _seed_member("*", "kid", is_adult=False, family_id=family_id)
    with TestSession() as db:
        db.get(User, child_id).display_name = "Lena Braun"
        db.add(UserNavOrder(user_id=adult_id, nav_order=[], ui_language="de"))
        db.commit()

    for destination in ("task", "shopping"):
        direct = client.post(
            "/quick-capture",
            json={"family_id": family_id, "text": "Pizza", "destination": destination},
            headers=auth(child_token),
        )
        assert direct.status_code == 403

    suggested = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Pizza on Friday"},
        headers=auth(child_token),
    )
    assert suggested.status_code == 200, suggested.json()
    assert suggested.json()["destination"] == "inbox"
    assert suggested.json()["inbox_item"]["suggested_by_user_id"] == child_id

    inbox = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=auth(adult_token)).json()
    assert [(item["text"], item["suggested_by_user_id"]) for item in inbox["items"]] == [("Pizza on Friday", child_id)]

    with TestSession() as db:
        notes = db.query(Notification).filter(Notification.type == "capture_suggestion").all()
        # Only the adult hears about it, in their language.
        assert [(n.user_id, n.title, n.body, n.link) for n in notes] == [
            (adult_id, "Pizza on Friday", "Vorschlag von Lena", "/dashboard?inbox=1"),
        ]

    # The adult confirms it; the child still cannot.
    item_id = inbox["items"][0]["id"]
    assert client.post(
        f"/quick-capture/inbox/{item_id}/convert", json={"destination": "task"}, headers=auth(child_token),
    ).status_code == 403
    converted = client.post(
        f"/quick-capture/inbox/{item_id}/convert", json={"destination": "task"}, headers=auth(adult_token),
    )
    assert converted.status_code == 200
