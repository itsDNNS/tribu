import asyncio
from typing import Any, cast

import pytest

from app.core import ws_broadcast


class FakeShoppingManager:
    def __init__(self):
        self.calls = []

    async def broadcast(self, list_id, event):
        self.calls.append(("list", list_id, event))

    async def broadcast_to_family(self, family_id, event):
        self.calls.append(("family", family_id, event))


@pytest.fixture
def captured_broadcasts(monkeypatch):
    manager = FakeShoppingManager()
    monkeypatch.setattr(ws_broadcast, "manager", manager)
    monkeypatch.setattr(ws_broadcast, "_loop", object())

    def run_now(coro, _loop):
        asyncio.run(coro)

    monkeypatch.setattr(ws_broadcast.asyncio, "run_coroutine_threadsafe", run_now)
    return manager.calls


@pytest.mark.parametrize(
    ("event_type", "payload", "expected_event"),
    [
        ("item_added", {"item": {"id": 10, "name": "Milk"}}, {"type": "item_added", "item": {"id": 10, "name": "Milk"}}),
        ("item_updated", {"item": {"id": 11, "checked": True}}, {"type": "item_updated", "item": {"id": 11, "checked": True}}),
        ("item_deleted", {"item_id": 12}, {"type": "item_deleted", "item_id": 12}),
        (
            "items_cleared",
            {"list_id": 42, "deleted_count": 3},
            {"type": "items_cleared", "list_id": 42, "deleted_count": 3},
        ),
    ],
)
def test_broadcast_shopping_event_keeps_list_event_payloads(captured_broadcasts, event_type, payload, expected_event):
    ws_broadcast.broadcast_shopping_event("list", 42, event_type, payload)

    assert captured_broadcasts == [("list", 42, expected_event)]


@pytest.mark.parametrize(
    ("event_type", "payload", "expected_event"),
    [
        ("list_created", {"list": {"id": 42, "name": "Groceries"}}, {"type": "list_created", "list": {"id": 42, "name": "Groceries"}}),
        ("list_deleted", {"list_id": 42}, {"type": "list_deleted", "list_id": 42}),
    ],
)
def test_broadcast_shopping_event_keeps_family_event_payloads(captured_broadcasts, event_type, payload, expected_event):
    ws_broadcast.broadcast_shopping_event("family", 7, event_type, payload)

    assert captured_broadcasts == [("family", 7, expected_event)]


def test_broadcast_shopping_event_rejects_unknown_scope(captured_broadcasts):
    with pytest.raises(ValueError, match="Unsupported shopping broadcast scope"):
        ws_broadcast.broadcast_shopping_event(cast(Any, "household"), 7, "list_created", {})

    assert captured_broadcasts == []
