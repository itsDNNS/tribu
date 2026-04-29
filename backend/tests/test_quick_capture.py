"""Universal quick capture and inbox tests."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, Task, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-quick-capture.db",
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


def _seed_member(scopes: str, suffix: str, *, is_adult: bool = True, family_id: int | None = None) -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"capture-{suffix}@example.com",
        password_hash=hash_password("Password123"),
        display_name="Capture User",
    )
    db.add(user)
    db.flush()
    if family_id is None:
        family = Family(name=f"Capture Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}capture-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="quick-capture-pat",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    ))
    db.commit()
    user_id = user.id
    db.close()
    return plain, family_id, user_id


def test_quick_capture_routes_to_task_shopping_and_inbox_public_safely():
    token, family_id, _ = _seed_member("*", "routes")

    task_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "  Pack sports bag  ", "destination": "task"},
        headers=_auth(token),
    )
    assert task_resp.status_code == 200, task_resp.json()
    assert task_resp.json()["destination"] == "task"
    assert task_resp.json()["created_item"]["title"] == "Pack sports bag"

    shopping_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Milk", "destination": "shopping"},
        headers=_auth(token),
    )
    assert shopping_resp.status_code == 200, shopping_resp.json()
    assert shopping_resp.json()["destination"] == "shopping"
    assert shopping_resp.json()["created_item"]["name"] == "Milk"

    inbox_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Call pediatrician tomorrow private token", "destination": "inbox"},
        headers=_auth(token),
    )
    assert inbox_resp.status_code == 200, inbox_resp.json()
    item = inbox_resp.json()["inbox_item"]
    assert item["text"] == "Call pediatrician tomorrow private token"
    assert item["status"] == "open"
    assert "family_id" not in item
    assert "created_by_user_id" not in item
    assert "converted_object_id" not in item

    db = TestSession()
    assert db.query(Task).filter(Task.family_id == family_id, Task.title == "Pack sports bag").count() == 1
    assert db.query(ShoppingItem).filter(ShoppingItem.name == "Milk").count() == 1
    db.close()

    inbox = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=_auth(token))
    assert inbox.status_code == 200, inbox.json()
    assert inbox.json()["total"] == 1
    assert inbox.json()["items"][0]["text"] == "Call pediatrician tomorrow private token"
    assert "password" not in str(inbox.json()).lower()

    long_text = "Call school about the class trip, bring the signed form, ask about lunch, and confirm pickup details before Friday afternoon"
    long_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": long_text, "destination": "inbox"},
        headers=_auth(token),
    )
    assert long_resp.status_code == 200, long_resp.json()
    assert long_resp.json()["inbox_item"]["text"] == long_text


def test_quick_capture_inbox_convert_and_dismiss_enforces_family_scope():
    token, family_id, _ = _seed_member("*", "owner")
    intruder_token, _, _ = _seed_member("*", "intruder")

    inbox_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Book dentist appointment", "destination": "inbox"},
        headers=_auth(token),
    )
    item_id = inbox_resp.json()["inbox_item"]["id"]

    denied = client.post(
        f"/quick-capture/inbox/{item_id}/convert",
        json={"destination": "task"},
        headers=_auth(intruder_token),
    )
    assert denied.status_code == 403

    converted = client.post(
        f"/quick-capture/inbox/{item_id}/convert",
        json={"destination": "task"},
        headers=_auth(token),
    )
    assert converted.status_code == 200, converted.json()
    assert converted.json()["status"] == "converted"
    assert converted.json()["converted_to"] == "task"
    assert converted.json()["converted_item"]["title"] == "Book dentist appointment"

    inbox = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=_auth(token))
    assert inbox.json()["total"] == 0

    second = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Bring cake Friday", "destination": "inbox"},
        headers=_auth(token),
    ).json()["inbox_item"]
    dismissed = client.post(f"/quick-capture/inbox/{second['id']}/dismiss", headers=_auth(token))
    assert dismissed.status_code == 200, dismissed.json()
    assert dismissed.json()["status"] == "dismissed"


def test_quick_capture_scope_and_adult_rules():
    child_token, family_id, _ = _seed_member("*", "child", is_adult=False)
    bad_scope_token, bad_family_id, _ = _seed_member("tasks:read", "bad-scope")

    child_resp = client.post(
        "/quick-capture",
        json={"family_id": family_id, "text": "Clean room", "destination": "task"},
        headers=_auth(child_token),
    )
    assert child_resp.status_code == 403

    bad_scope = client.get(f"/quick-capture/inbox?family_id={bad_family_id}", headers=_auth(bad_scope_token))
    assert bad_scope.status_code == 403

    child_read = client.get(f"/quick-capture/inbox?family_id={family_id}", headers=_auth(child_token))
    assert child_read.status_code == 403

    invalid = client.post(
        "/quick-capture",
        json={"family_id": bad_family_id, "text": "x", "destination": "voice"},
        headers=_auth(bad_scope_token),
    )
    assert invalid.status_code == 403
