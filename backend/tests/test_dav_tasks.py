"""Integration coverage for the separately scoped VTODO collection."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import tempfile
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from icalendar import Calendar

from app.database import Base, SessionLocal, engine
from app.models import (
    Family,
    Membership,
    PersonalAccessToken,
    RewardCurrency,
    Task,
    TokenTransaction,
    User,
)
from app.security import PAT_PREFIX, hash_password


EMAIL = "dav-tasks-integration@example.com"


@pytest.fixture(scope="module")
def app_under_test():
    with tempfile.TemporaryDirectory(prefix="tribu-dav-task-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        from app.main import app
        Base.metadata.create_all(bind=engine)
        yield app
        Base.metadata.drop_all(bind=engine)
        os.environ.pop("DAV_STORAGE_FOLDER", None)


def _basic(email: str, token: str) -> str:
    value = base64.b64encode(f"{email}:{token}".encode()).decode()
    return f"Basic {value}"


def _token(db, user_id: int, scopes: str, suffix: str) -> str:
    plain = f"{PAT_PREFIX}task-dav-{suffix}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user_id, name=suffix, token_hash=lookup, token_lookup=lookup, scopes=scopes,
    ))
    return plain


@pytest.fixture
def seeded(app_under_test):
    db = SessionLocal()
    adult = User(email=EMAIL, password_hash=hash_password("x"), display_name="Task Adult")
    child = User(email="dav-task-child@example.com", password_hash=hash_password("x"), display_name="Task Child")
    family = Family(name="Task Family")
    db.add_all([adult, child, family])
    db.flush()
    db.add_all([
        Membership(user_id=adult.id, family_id=family.id, role="admin", is_adult=True),
        Membership(user_id=child.id, family_id=family.id, role="member", is_adult=False),
    ])
    tokens = {
        "rw": _token(db, adult.id, "tasks:read,tasks:write", "rw"),
        "ro": _token(db, adult.id, "tasks:read", "ro"),
        "star": _token(db, adult.id, "*", "star"),
        "child": _token(db, child.id, "tasks:read,tasks:write", "child"),
    }
    assigned = Task(
        family_id=family.id,
        title="Assigned legacy",
        description="Private notes",
        priority="high",
        due_date=datetime(2026, 8, 27),
        due_is_date=True,
        recurrence="weekly",
        assigned_to_user_id=child.id,
        created_by_user_id=adult.id,
        token_reward_amount=5,
    )
    hidden = Task(family_id=family.id, title="Adults", priority="normal", created_by_user_id=adult.id)
    db.add_all([assigned, hidden])
    db.commit()
    result = {**tokens, "family_id": family.id, "assigned_id": assigned.id, "hidden_id": hidden.id}
    db.close()
    yield result
    db = SessionLocal()
    for model in (Task, Membership, PersonalAccessToken):
        db.query(model).delete()
    db.query(User).filter(User.email.in_([EMAIL, "dav-task-child@example.com"])).delete(synchronize_session=False)
    db.query(Family).delete()
    db.commit()
    db.close()


def _headers(token: str, email: str = EMAIL) -> dict[str, str]:
    return {"Authorization": _basic(email, token)}


def _vtodo(uid="client-one", summary="A task", extra="") -> str:
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n"
        f"BEGIN:VTODO\r\nUID:{uid}\r\nSUMMARY:{summary}\r\n{extra}END:VTODO\r\nEND:VCALENDAR\r\n"
    )


def _propfind(client, path, headers, depth="1"):
    return client.request(
        "PROPFIND", path,
        headers={**headers, "Depth": depth, "Content-Type": "application/xml"},
        content='<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><prop><displayname/><getetag/><C:supported-calendar-component-set/></prop></propfind>',
    )


def test_discovery_is_literal_opt_in_and_vtodo_only(app_under_test, seeded):
    client = TestClient(app_under_test)
    path = f"/dav/{EMAIL}/"
    task = _propfind(client, path, _headers(seeded["rw"]))
    assert task.status_code == 207
    assert f"task-{seeded['family_id']}" in task.text
    assert "VTODO" in task.text
    wildcard = _propfind(client, path, _headers(seeded["star"]))
    assert f"task-{seeded['family_id']}" not in wildcard.text


def test_crud_round_trip_preserves_unknown_fields_and_precision(app_under_test, seeded):
    client = TestClient(app_under_test)
    href = f"/dav/{EMAIL}/task-{seeded['family_id']}/new.ics"
    wire = _vtodo(
        summary="Client task",
        extra=(
            "DESCRIPTION:Notes\r\nDUE;VALUE=DATE:20260827\r\nPRIORITY:9\r\n"
            "CATEGORIES:Home\r\nX-CLIENT-COLOR:blue\r\n"
            "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Alarm\r\nTRIGGER:-PT10M\r\nEND:VALARM\r\n"
        ),
    )
    put = client.put(href, headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"}, content=wire)
    assert put.status_code in (201, 204), put.text
    fetched = client.get(href, headers=_headers(seeded["rw"]))
    assert fetched.status_code == 200
    assert "DUE;VALUE=DATE:20260827" in fetched.text
    assert "PRIORITY:9" in fetched.text
    assert "CATEGORIES:Home" in fetched.text
    assert "BEGIN:VALARM" in fetched.text

    db = SessionLocal()
    row = db.query(Task).filter(Task.family_id == seeded["family_id"], Task.dav_href == "new.ics").one()
    assert row.due_is_date is True
    assert row.priority == "low"
    db.close()

    deleted = client.delete(href, headers=_headers(seeded["rw"]))
    assert deleted.status_code in (200, 204)
    assert client.get(href, headers=_headers(seeded["rw"])).status_code == 404


def test_child_can_resend_unchanged_fields_while_completing_but_not_edit_protected_values(app_under_test, seeded):
    client = TestClient(app_under_test)
    href = f"/dav/dav-task-child@example.com/task-{seeded['family_id']}/tribu-task-{seeded['assigned_id']}.ics"
    auth = _headers(seeded["child"], "dav-task-child@example.com")
    current = client.get(href, headers=auth)
    assert current.status_code == 200
    completed = current.text.replace("STATUS:NEEDS-ACTION", "STATUS:COMPLETED").replace("PERCENT-COMPLETE:0", "PERCENT-COMPLETE:100")
    put = client.put(href, headers={**auth, "Content-Type": "text/calendar"}, content=completed)
    assert put.status_code in (201, 204), put.text

    forbidden = completed.replace("SUMMARY:Assigned legacy", "SUMMARY:Changed by child")
    denied = client.put(href, headers={**auth, "Content-Type": "text/calendar"}, content=forbidden)
    assert 400 <= denied.status_code < 500
    assert client.get(
        f"/dav/dav-task-child@example.com/task-{seeded['family_id']}/tribu-task-{seeded['hidden_id']}.ics",
        headers=auth,
    ).status_code == 404

    db = SessionLocal()
    row = db.query(Task).filter(Task.id == seeded["assigned_id"]).one()
    assert row.title == "Assigned legacy"
    assert row.recurrence == "weekly"
    assert row.assigned_to_user_id is not None
    assert row.token_reward_amount == 5
    db.close()


def test_read_only_uid_conflicts_recurrence_and_event_calendar_are_rejected(app_under_test, seeded):
    client = TestClient(app_under_test)
    base = f"/dav/{EMAIL}/task-{seeded['family_id']}"
    readable = client.get(
        f"{base}/tribu-task-{seeded['assigned_id']}.ics",
        headers=_headers(seeded["ro"]),
    )
    assert readable.status_code == 200
    assert "SUMMARY:Assigned legacy" in readable.text
    ro = client.put(
        f"{base}/readonly.ics",
        headers={**_headers(seeded["ro"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="readonly"),
    )
    assert ro.status_code in (401, 403)

    first = client.put(
        f"{base}/one.ics",
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="duplicate"),
    )
    assert first.status_code in (201, 204)
    duplicate = client.put(
        f"{base}/two.ics",
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="duplicate"),
    )
    assert 400 <= duplicate.status_code < 500
    reserved_href = client.put(
        f"{base}/tribu-task-999999.ics",
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="external-reserved-href"),
    )
    assert 400 <= reserved_href.status_code < 500
    reserved_uid = client.put(
        f"{base}/external.ics",
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="tribu-task-999999@tribu.local"),
    )
    assert 400 <= reserved_uid.status_code < 500
    recurring = client.put(
        f"{base}/recurring.ics",
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="rrule", extra="RRULE:FREQ=DAILY\r\n"),
    )
    assert 400 <= recurring.status_code < 500
    event_calendar = client.put(
        f"/dav/{EMAIL}/cal-{seeded['family_id']}/todo.ics",
        headers={**_headers(seeded["star"]), "Content-Type": "text/calendar"},
        content=_vtodo(uid="wrong-collection"),
    )
    assert 400 <= event_calendar.status_code < 500


def test_malformed_payload_returns_safe_4xx_without_logging_contents(app_under_test, seeded, caplog):
    client = TestClient(app_under_test)
    secret_title = "PRIVATE-TASK-TITLE-458"
    wire = _vtodo(uid="private-uid-458", summary=secret_title, extra="RRULE:FREQ=DAILY\r\n")
    with caplog.at_level(logging.WARNING):
        response = client.put(
            f"/dav/{EMAIL}/task-{seeded['family_id']}/malformed.ics",
            headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
            content=wire,
        )
    assert 400 <= response.status_code < 500
    assert secret_title not in caplog.text
    assert "private-uid-458" not in caplog.text
    assert "RRULE:FREQ=DAILY" not in caplog.text


def test_task_etag_rejects_stale_if_match(app_under_test, seeded):
    client = TestClient(app_under_test)
    href = f"/dav/{EMAIL}/task-{seeded['family_id']}/etag.ics"
    headers = {**_headers(seeded["rw"]), "Content-Type": "text/calendar"}
    assert client.put(href, headers=headers, content=_vtodo(uid="etag", summary="One")).status_code in (201, 204)
    fetched = client.get(href, headers=_headers(seeded["rw"]))
    old_etag = fetched.headers["etag"]
    first = client.put(
        href,
        headers={**headers, "If-Match": old_etag},
        content=_vtodo(uid="etag", summary="Two"),
    )
    assert first.status_code in (201, 204)
    stale = client.put(
        href,
        headers={**headers, "If-Match": old_etag},
        content=_vtodo(uid="etag", summary="Stale"),
    )
    assert stale.status_code == 412


def test_rest_created_updated_and_deleted_task_converges_in_dav(app_under_test, seeded):
    client = TestClient(app_under_test)
    api_headers = {"Authorization": f"Bearer {seeded['rw']}"}
    created = client.post(
        "/tasks",
        headers=api_headers,
        json={
            "family_id": seeded["family_id"],
            "title": "Created in Tribu",
            "priority": "high",
            "due_date": "2026-08-28T09:30:00",
        },
    )
    assert created.status_code == 200, created.text
    task_id = created.json()["id"]
    href = f"/dav/{EMAIL}/task-{seeded['family_id']}/tribu-task-{task_id}.ics"

    fetched = client.get(href, headers=_headers(seeded["rw"]))
    assert fetched.status_code == 200
    assert "SUMMARY:Created in Tribu" in fetched.text
    assert "PRIORITY:1" in fetched.text

    updated = client.patch(
        f"/tasks/{task_id}",
        headers=api_headers,
        json={"title": "Updated in Tribu", "priority": "low"},
    )
    assert updated.status_code == 200, updated.text
    fetched = client.get(href, headers=_headers(seeded["rw"]))
    assert "SUMMARY:Updated in Tribu" in fetched.text
    assert "PRIORITY:9" in fetched.text

    deleted = client.delete(f"/tasks/{task_id}", headers=api_headers)
    assert deleted.status_code == 200
    assert client.get(href, headers=_headers(seeded["rw"])).status_code == 404


def test_existing_240_character_task_round_trips_through_dav(app_under_test, seeded):
    title = "T" * 240
    db = SessionLocal()
    adult = db.query(User).filter(User.email == EMAIL).one()
    task = Task(
        family_id=seeded["family_id"],
        title=title,
        priority="normal",
        created_by_user_id=adult.id,
    )
    db.add(task)
    db.commit()
    task_id = task.id
    db.close()

    client = TestClient(app_under_test)
    href = f"/dav/{EMAIL}/task-{seeded['family_id']}/tribu-task-{task_id}.ics"
    fetched = client.get(href, headers=_headers(seeded["rw"]))
    assert fetched.status_code == 200
    fetched_calendar = Calendar.from_ical(fetched.text)
    fetched_todo = next(component for component in fetched_calendar.walk() if component.name == "VTODO")
    assert str(fetched_todo["SUMMARY"]) == title

    stored = client.put(
        href,
        headers={**_headers(seeded["rw"]), "Content-Type": "text/calendar"},
        content=fetched.text,
    )
    assert stored.status_code in (201, 204)

    db = SessionLocal()
    assert db.get(Task, task_id).title == title
    db.close()


def test_dav_completion_reopen_and_repeat_put_use_domain_effects_once(app_under_test, seeded):
    client = TestClient(app_under_test)
    db = SessionLocal()
    db.add(RewardCurrency(family_id=seeded["family_id"], name="Stars", icon="star"))
    db.commit()
    db.close()

    href = f"/dav/{EMAIL}/task-{seeded['family_id']}/tribu-task-{seeded['assigned_id']}.ics"
    headers = {**_headers(seeded["rw"]), "Content-Type": "text/calendar"}
    current = client.get(href, headers=_headers(seeded["rw"]))
    assert current.status_code == 200
    calendar = Calendar.from_ical(current.text)
    todo = next(component for component in calendar.walk() if component.name == "VTODO")
    todo["STATUS"] = "COMPLETED"
    todo["PERCENT-COMPLETE"] = 100
    completed_wire = calendar.to_ical().decode()

    first = client.put(href, headers=headers, content=completed_wire)
    second = client.put(href, headers=headers, content=completed_wire)
    assert first.status_code in (201, 204), first.text
    assert second.status_code in (201, 204), second.text

    db = SessionLocal()
    row = db.query(Task).filter(Task.id == seeded["assigned_id"]).one()
    assert row.status == "done"
    assert row.completed_at is not None
    assert db.query(TokenTransaction).filter(
        TokenTransaction.source_task_id == seeded["assigned_id"]
    ).count() == 1
    assert db.query(Task).filter(
        Task.family_id == seeded["family_id"],
        Task.id != seeded["assigned_id"],
        Task.title == "Assigned legacy",
    ).count() == 1
    db.close()

    completed = client.get(href, headers=_headers(seeded["rw"]))
    calendar = Calendar.from_ical(completed.text)
    todo = next(component for component in calendar.walk() if component.name == "VTODO")
    todo["STATUS"] = "NEEDS-ACTION"
    todo["PERCENT-COMPLETE"] = 0
    if "COMPLETED" in todo:
        del todo["COMPLETED"]
    reopened = client.put(href, headers=headers, content=calendar.to_ical().decode())
    assert reopened.status_code in (201, 204), reopened.text

    db = SessionLocal()
    row = db.query(Task).filter(Task.id == seeded["assigned_id"]).one()
    assert row.status == "open"
    assert row.completed_at is None
    assert db.query(TokenTransaction).filter(
        TokenTransaction.source_task_id == seeded["assigned_id"]
    ).count() == 1
    assert db.query(Task).filter(
        Task.family_id == seeded["family_id"],
        Task.id != seeded["assigned_id"],
        Task.title == "Assigned legacy",
    ).count() == 1
    db.close()

    removed = client.delete(href, headers=_headers(seeded["rw"]))
    assert removed.status_code in (200, 204)
    assert client.get(href, headers=_headers(seeded["rw"])).status_code == 404
