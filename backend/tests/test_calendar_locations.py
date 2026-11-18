import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import CalendarEvent
from tests.calendar_feed_support import seed_calendar_admin
from tests.support import TestSession, auth


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def test_create_list_update_and_clear_calendar_event_location():
    token, family_id = seed_calendar_admin()

    created = client.post(
        "/calendar/events",
        json={
            "family_id": family_id,
            "title": "Football practice",
            "starts_at": "2026-05-12T16:00:00",
            "location": "Sports Park, Field 2",
        },
        headers=auth(token),
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["location"] == "Sports Park, Field 2"

    listed = client.get(f"/calendar/events?family_id={family_id}", headers=auth(token))
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["location"] == "Sports Park, Field 2"

    updated = client.patch(
        f"/calendar/events/{body['id']}",
        json={"location": "Sports Park Main Entrance"},
        headers=auth(token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["location"] == "Sports Park Main Entrance"

    cleared = client.patch(
        f"/calendar/events/{body['id']}",
        json={"location": None},
        headers=auth(token),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["location"] is None

    db = TestSession()
    try:
        event = db.query(CalendarEvent).filter(CalendarEvent.id == body["id"]).one()
        assert event.location is None
    finally:
        db.close()


def test_create_update_clear_and_reject_calendar_event_icons():
    token, family_id = seed_calendar_admin()

    created = client.post(
        "/calendar/events",
        json={
            "family_id": family_id,
            "title": "Football practice",
            "starts_at": "2026-05-12T16:00:00",
            "icon": "soccer",
        },
        headers=auth(token),
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["icon"] == "soccer"

    listed = client.get(f"/calendar/events?family_id={family_id}", headers=auth(token))
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["icon"] == "soccer"

    updated = client.patch(
        f"/calendar/events/{body['id']}",
        json={"icon": "dentist"},
        headers=auth(token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["icon"] == "dentist"

    cleared = client.patch(
        f"/calendar/events/{body['id']}",
        json={"icon": None},
        headers=auth(token),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["icon"] is None

    invalid = client.post(
        "/calendar/events",
        json={
            "family_id": family_id,
            "title": "Unsafe icon",
            "starts_at": "2026-05-13T16:00:00",
            "icon": "<svg/onload=alert(1)>",
        },
        headers=auth(token),
    )
    assert invalid.status_code == 422, invalid.text

    db = TestSession()
    try:
        event = db.query(CalendarEvent).filter(CalendarEvent.id == body["id"]).one()
        assert event.icon is None
    finally:
        db.close()


def test_clear_optional_event_dates_without_changing_omitted_fields():
    token, family_id = seed_calendar_admin()
    headers = auth(token)
    created = client.post('/calendar/events', headers=headers, json={
        'family_id': family_id, 'title': 'Long plan',
        'starts_at': '2026-09-15T14:00:00', 'ends_at': '2026-09-17T15:00:00',
        'recurrence': 'weekly', 'recurrence_end': '2026-12-31T00:00:00',
    })
    assert created.status_code == 200, created.text
    event_id = created.json()['id']
    renamed = client.patch(f'/calendar/events/{event_id}', headers=headers, json={'title': 'Renamed'})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()['ends_at'] == '2026-09-17T15:00:00'
    assert renamed.json()['recurrence_end'] == '2026-12-31T00:00:00'
    cleared = client.patch(f'/calendar/events/{event_id}', headers=headers, json={'ends_at': None, 'recurrence_end': None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()['ends_at'] is None
    assert cleared.json()['recurrence_end'] is None
    assert cleared.json()['recurrence'] == 'weekly'
