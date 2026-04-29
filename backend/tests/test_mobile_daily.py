"""Mobile daily snapshot API tests."""

import hashlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import (
    CalendarEvent,
    Family,
    Membership,
    Notification,
    PersonalAccessToken,
    QuickCaptureItem,
    ShoppingItem,
    ShoppingList,
    Task,
    User,
)
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-mobile-daily.db",
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
    Base.metadata.drop_all(bind=engine)
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


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_member(scopes: str, suffix: str, *, family_id: int | None = None, role: str = "admin") -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"mobile-{suffix}@example.com",
        password_hash=hash_password("Password123"),
        display_name=f"Mobile {suffix}",
    )
    db.add(user)
    db.flush()
    if family_id is None:
        family = Family(name=f"Mobile Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(user_id=user.id, family_id=family_id, role=role, is_adult=True, color="#7c3aed"))
    plain = f"{PAT_PREFIX}mobile-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="mobile-daily-pat",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    ))
    db.commit()
    user_id = user.id
    db.close()
    return plain, family_id, user_id


def test_mobile_daily_snapshot_collects_today_loop_without_secrets():
    token, family_id, user_id = _seed_member("*", "owner")
    _, _, child_user_id = _seed_member("*", "child", family_id=family_id, role="member")
    target_day = datetime(2026, 5, 4, 9, 0, 0)

    db = TestSession()
    db.add_all([
        CalendarEvent(
            family_id=family_id,
            title="Morning practice",
            starts_at=datetime(2026, 5, 4, 8, 30, 0),
            ends_at=datetime(2026, 5, 4, 9, 30, 0),
            assigned_to=[child_user_id],
            color="#7c3aed",
            category="sports",
            created_by_user_id=user_id,
        ),
        CalendarEvent(
            family_id=family_id,
            title="Daily medication",
            starts_at=datetime(2026, 5, 1, 7, 0, 0),
            ends_at=datetime(2026, 5, 1, 7, 15, 0),
            recurrence="daily",
            recurrence_end=datetime(2026, 5, 6, 0, 0, 0),
            created_by_user_id=user_id,
        ),
        CalendarEvent(
            family_id=family_id,
            title="Ends at midnight",
            starts_at=datetime(2026, 5, 3, 23, 0, 0),
            ends_at=datetime(2026, 5, 4, 0, 0, 0),
            created_by_user_id=user_id,
        ),
        CalendarEvent(
            family_id=family_id,
            title="Overnight recurring care",
            starts_at=datetime(2026, 5, 1, 23, 30, 0),
            ends_at=datetime(2026, 5, 2, 0, 30, 0),
            recurrence="daily",
            recurrence_end=datetime(2026, 5, 6, 0, 0, 0),
            created_by_user_id=user_id,
        ),
        CalendarEvent(
            family_id=family_id,
            title="Tomorrow only",
            starts_at=datetime(2026, 5, 5, 10, 0, 0),
            ends_at=datetime(2026, 5, 5, 11, 0, 0),
            created_by_user_id=user_id,
        ),
        Task(family_id=family_id, title="Pack bag", status="open", priority="high", due_date=datetime(2026, 5, 4, 18, 0, 0), assigned_to_user_id=child_user_id),
        Task(family_id=family_id, title="Return library books", status="open", priority="normal", due_date=datetime(2026, 5, 3, 12, 0, 0)),
        Task(family_id=family_id, title="Already done", status="done", priority="normal", due_date=target_day, completed_at=target_day),
        Task(family_id=family_id, title="Later this week", status="open", priority="normal", due_date=datetime(2026, 5, 7, 12, 0, 0)),
        QuickCaptureItem(family_id=family_id, text="Open note", status="open", created_by_user_id=user_id),
        QuickCaptureItem(family_id=family_id, text="Done note", status="dismissed", created_by_user_id=user_id),
        Notification(user_id=user_id, family_id=family_id, type="task", title="Unread", body="Task due", read=False),
        Notification(user_id=user_id, family_id=family_id, type="task", title="Read", body="Done", read=True),
    ])
    shopping = ShoppingList(family_id=family_id, name="Groceries", created_by_user_id=user_id)
    db.add(shopping)
    db.flush()
    db.add_all([
        ShoppingItem(list_id=shopping.id, name="Milk", checked=False, position=1),
        ShoppingItem(list_id=shopping.id, name="Bread", checked=True, position=2),
    ])
    db.commit()
    shopping_id = shopping.id
    db.close()

    resp = client.get(f"/mobile/daily?family_id={family_id}&date=2026-05-04", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert data["family_id"] == family_id
    assert data["date"] == "2026-05-04"
    assert data["sync"]["scope"] == "mobile_daily"
    assert {m["user_id"] for m in data["members"]} == {user_id, child_user_id}
    assert [event["title"] for event in data["agenda"]] == ["Overnight recurring care", "Daily medication", "Morning practice", "Overnight recurring care"]
    assert data["agenda"][0]["starts_at"].startswith("2026-05-03T23:30:00")
    assert data["agenda"][1]["starts_at"].startswith("2026-05-04T07:00:00")
    assert data["agenda"][3]["starts_at"].startswith("2026-05-04T23:30:00")
    assert [task["title"] for task in data["tasks"]] == ["Return library books", "Pack bag"]
    assert data["tasks"][0]["due_state"] == "overdue"
    assert data["tasks"][1]["due_state"] == "today"
    assert data["shopping_lists"] == [{
        "id": shopping_id,
        "name": "Groceries",
        "item_count": 2,
        "checked_count": 1,
        "open_count": 1,
    }]
    assert data["quick_capture"]["open_count"] == 1
    assert data["notifications"]["unread_count"] == 1
    serialized = str(data).lower()
    assert "token" not in serialized
    assert "password" not in serialized
    assert "display_device" not in serialized
    assert "role" not in data["members"][0]
    assert "is_adult" not in data["members"][0]


def test_mobile_daily_enforces_family_scope_and_required_read_scopes():
    owner_token, family_id, _ = _seed_member("*", "owner-scope")
    intruder_token, _, _ = _seed_member("*", "intruder")
    limited_token, limited_family_id, _ = _seed_member("calendar:read,tasks:read", "limited")

    denied = client.get(f"/mobile/daily?family_id={family_id}&date=2026-05-04", headers=_auth(intruder_token))
    assert denied.status_code == 403

    limited = client.get(f"/mobile/daily?family_id={limited_family_id}&date=2026-05-04", headers=_auth(limited_token))
    assert limited.status_code == 403

    ok = client.get(f"/mobile/daily?family_id={family_id}&date=2026-05-04", headers=_auth(owner_token))
    assert ok.status_code == 200, ok.json()
    assert ok.json()["agenda"] == []
    assert ok.json()["tasks"] == []
    assert ok.json()["shopping_lists"] == []
    assert ok.json()["quick_capture"]["open_count"] == 0
    assert ok.json()["notifications"]["unread_count"] == 0
