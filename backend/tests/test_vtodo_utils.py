"""Strict VTODO protocol mapping and safe round-trip tests."""

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from icalendar import Calendar

from app.core.vtodo_utils import MAX_VTODO_BYTES, VTodoError, parse_vtodo, task_to_vtodo


def _ics(body: str) -> str:
    return "\r\n".join((
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN",
        "BEGIN:VTODO", body.strip(), "END:VTODO", "END:VCALENDAR", "",
    ))


def _task(**overrides):
    values = dict(
        id=7, title="Current title", description="Current notes", due_date=None,
        due_is_date=False, priority="normal", status="open", completed_at=None,
        created_at=datetime(2026, 1, 2, 3, 4), updated_at=datetime(2026, 1, 3, 4, 5),
        vtodo_uid="uid-7", raw_vtodo=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def test_parse_due_precision_priority_and_completion():
    parsed = parse_vtodo(_ics(
        "UID:one\r\nSUMMARY:Do it\r\nDUE;VALUE=DATE:20260827\r\n"
        "PRIORITY:2\r\nSTATUS:COMPLETED\r\nPERCENT-COMPLETE:100"
    ))
    assert parsed.uid == "one"
    assert parsed.fields["due_date"] == datetime(2026, 8, 27)
    assert parsed.fields["due_is_date"] is True
    assert parsed.fields["priority"] == "high"
    assert parsed.fields["status"] == "done"
    assert parsed.fields["completed_at"].tzinfo is None


@pytest.mark.parametrize("completion", [
    "PERCENT-COMPLETE:100",
    "COMPLETED:20260827T100000Z",
])
def test_completion_can_be_expressed_without_status(completion):
    parsed = parse_vtodo(_ics(f"UID:u\r\nSUMMARY:S\r\n{completion}"))
    assert parsed.fields["status"] == "done"
    assert parsed.fields["completed_at"] is not None


@pytest.mark.parametrize("value,expected", [(0, "normal"), (5, "normal"), (1, "high"), (4, "high"), (6, "low"), (9, "low")])
def test_priority_mapping(value, expected):
    assert parse_vtodo(_ics(f"UID:u\r\nSUMMARY:S\r\nPRIORITY:{value}")).fields["priority"] == expected


@pytest.mark.parametrize("priority,wire", [("high", 1), ("normal", 5), ("low", 9)])
def test_emits_priority_mapping(priority, wire):
    cal = Calendar.from_ical(task_to_vtodo(_task(priority=priority)))
    todo = next(c for c in cal.walk() if c.name == "VTODO")
    assert int(todo["PRIORITY"]) == wire


def test_timed_due_normalizes_to_local_wall(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Berlin")
    from app.core.clock import app_timezone
    app_timezone.cache_clear()
    try:
        parsed = parse_vtodo(_ics("UID:u\r\nSUMMARY:S\r\nDUE:20260827T100000Z"))
        assert parsed.fields["due_date"] == datetime(2026, 8, 27, 12)
        assert parsed.fields["due_is_date"] is False
    finally:
        app_timezone.cache_clear()


def test_raw_unknown_properties_and_alarm_survive_but_modeled_values_are_overwritten():
    raw = _ics(
        "UID:u\r\nSUMMARY:Old\r\nDESCRIPTION:Old notes\r\nCATEGORIES:Home\r\n"
        "X-CLIENT-COLOR:blue\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\n"
        "DESCRIPTION:Wake up\r\nTRIGGER:-PT15M\r\nEND:VALARM"
    )
    parsed = parse_vtodo(raw)
    rendered = task_to_vtodo(_task(raw_vtodo=parsed.raw_vtodo, vtodo_uid="u"))
    assert "SUMMARY:Current title" in rendered
    assert "DESCRIPTION:Current notes" in rendered
    assert "SUMMARY:Old" not in rendered
    assert "CATEGORIES:Home" in rendered
    assert "X-CLIENT-COLOR:blue" in rendered
    assert "BEGIN:VALARM" in rendered
    assert "DESCRIPTION:Wake up" in rendered


def test_open_and_completed_wire_contracts():
    open_wire = task_to_vtodo(_task())
    assert "STATUS:NEEDS-ACTION" in open_wire
    assert "PERCENT-COMPLETE:0" in open_wire
    assert "COMPLETED:" not in open_wire

    done_wire = task_to_vtodo(_task(status="done", completed_at=datetime(2026, 1, 4, 5, 6)))
    assert "STATUS:COMPLETED" in done_wire
    assert "PERCENT-COMPLETE:100" in done_wire
    assert "COMPLETED:20260104T050600Z" in done_wire


def test_date_only_is_emitted_as_date_not_midnight_datetime():
    wire = task_to_vtodo(_task(due_date=datetime(2026, 8, 27), due_is_date=True))
    assert "DUE;VALUE=DATE:20260827" in wire
    assert "DUE:20260827T000000" not in wire


@pytest.mark.parametrize("body", [
    "UID:u\r\nSUMMARY:S\r\nRRULE:FREQ=DAILY",
    "UID:u\r\nSUMMARY:S\r\nRECURRENCE-ID:20260827T100000Z",
    "UID:u\r\nSUMMARY:S\r\nDTSTART:20260827T100000Z\r\nDURATION:PT1H",
    "UID:u\r\nSUMMARY:S\r\nX-TRIBU-ASSIGNEE:2",
    "UID:u\r\nSUMMARY;X-TRIBU-ROLE=admin:S",
    "UID:u\r\nSUMMARY:S\r\nPRIORITY:10",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:CANCELLED",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:IN-PROCESS\r\nPERCENT-COMPLETE:50",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:NEEDS-ACTION\r\nPERCENT-COMPLETE:50",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:NEEDS-ACTION\r\nPERCENT-COMPLETE:100",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:NEEDS-ACTION\r\nCOMPLETED:20260827T100000Z",
    "UID:u\r\nSUMMARY:S\r\nSTATUS:COMPLETED\r\nPERCENT-COMPLETE:50",
    "UID:u\r\nSUMMARY:S\r\nPERCENT-COMPLETE:not-an-int",
    "UID: \r\nSUMMARY:S",
    "UID:u\r\nSUMMARY: ",
])
def test_rejects_unsafe_or_contradictory_payloads(body):
    with pytest.raises(VTodoError):
        parse_vtodo(_ics(body))


@pytest.mark.parametrize("wire", [
    "not calendar data",
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
    _ics("UID:u\r\nSUMMARY:S").replace("END:VCALENDAR", "BEGIN:VTODO\r\nUID:v\r\nSUMMARY:T\r\nEND:VTODO\r\nEND:VCALENDAR"),
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e\r\nSUMMARY:E\r\nDTSTART:20260827T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
])
def test_rejects_malformed_missing_multiple_or_event_payloads(wire):
    with pytest.raises(VTodoError):
        parse_vtodo(wire)


def test_rejects_oversized_payload_without_echoing_its_content():
    marker = "PRIVATE-OVERSIZED-TASK"
    wire = _ics(f"UID:u\r\nSUMMARY:S\r\nDESCRIPTION:{marker}{'x' * MAX_VTODO_BYTES}")
    with pytest.raises(VTodoError, match="too large") as exc:
        parse_vtodo(wire)
    assert marker not in str(exc.value)


def test_rejects_uid_larger_than_storage_contract():
    with pytest.raises(VTodoError, match="UID is too long"):
        parse_vtodo(_ics(f"UID:{'u' * 201}\r\nSUMMARY:S"))


def test_accepts_quick_capture_title_width_and_rejects_larger_summaries():
    title = "T" * 240
    assert parse_vtodo(_ics(f"UID:u\r\nSUMMARY:{title}")).fields["title"] == title

    with pytest.raises(VTodoError, match="summary is too long"):
        parse_vtodo(_ics(f"UID:u\r\nSUMMARY:{title}X"))
