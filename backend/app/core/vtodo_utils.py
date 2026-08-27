"""Strict VTODO codec for the task DAV boundary.

Only the small, explicitly modeled task surface is projected into Tribu.
The original component is retained for safe client-only properties and
subcomponents, then all modeled properties are overwritten from the Task row
when serializing so DAV data can never restore stale Tribu state.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from icalendar import Calendar, Todo

from app.core.clock import to_local_wall_naive, to_utc_aware, utcnow


class VTodoError(ValueError):
    """A controlled, payload-safe VTODO validation failure."""


@dataclass(frozen=True)
class ParsedVTodo:
    uid: str
    fields: dict[str, Any]
    raw_vtodo: str


_MODELED_PROPERTIES = (
    "UID",
    "SUMMARY",
    "DESCRIPTION",
    "DUE",
    "PRIORITY",
    "STATUS",
    "PERCENT-COMPLETE",
    "COMPLETED",
    "DTSTAMP",
    "CREATED",
    "LAST-MODIFIED",
    "RRULE",
    "RECURRENCE-ID",
)
_OPEN_STATUSES = {"", "NEEDS-ACTION"}
_PRIORITY_TO_WIRE = {"high": 1, "normal": 5, "low": 9}
MAX_VTODO_BYTES = 1024 * 1024


def _clean_required(component: Todo, name: str) -> str:
    prop = component.get(name)
    value = str(prop).strip() if prop is not None else ""
    if not value:
        raise VTodoError(f"VTODO is missing {name}")
    return value


def _walk_components(component):
    yield component
    for child in getattr(component, "subcomponents", ()):
        yield from _walk_components(child)


def _reject_reserved_properties(calendar: Calendar) -> None:
    for component in _walk_components(calendar):
        for key in component.keys():
            if str(key).upper().startswith("X-TRIBU-"):
                raise VTodoError("Reserved task properties are not accepted")
            values = component.get(key)
            if not isinstance(values, list):
                values = [values]
            for value in values:
                for param in getattr(value, "params", {}).keys():
                    if str(param).upper().startswith("X-TRIBU-"):
                        raise VTodoError("Reserved task properties are not accepted")


def _parse_priority(todo: Todo) -> str:
    prop = todo.get("PRIORITY")
    if prop is None:
        return "normal"
    try:
        value = int(str(prop))
    except (TypeError, ValueError) as exc:
        raise VTodoError("VTODO priority must be an integer") from exc
    if not 0 <= value <= 9:
        raise VTodoError("VTODO priority is outside the supported range")
    if 1 <= value <= 4:
        return "high"
    if 6 <= value <= 9:
        return "low"
    return "normal"


def _parse_due(todo: Todo) -> tuple[datetime | None, bool]:
    prop = todo.get("DUE")
    if prop is None:
        return None, False
    try:
        value = prop.dt
    except (AttributeError, ValueError, TypeError) as exc:
        raise VTodoError("VTODO due value is invalid") from exc
    if isinstance(value, datetime):
        return to_local_wall_naive(value), False
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day), True
    raise VTodoError("VTODO due value is invalid")


def _parse_percent(todo: Todo) -> int | None:
    prop = todo.get("PERCENT-COMPLETE")
    if prop is None:
        return None
    try:
        value = int(str(prop))
    except (TypeError, ValueError) as exc:
        raise VTodoError("VTODO percent complete must be an integer") from exc
    if not 0 <= value <= 100:
        raise VTodoError("VTODO percent complete is outside the supported range")
    return value


def _parse_completed(todo: Todo) -> datetime | None:
    prop = todo.get("COMPLETED")
    if prop is None:
        return None
    value = getattr(prop, "dt", None)
    if not isinstance(value, datetime):
        raise VTodoError("VTODO completed timestamp is invalid")
    return to_utc_aware(value).replace(tzinfo=None)


def _parse_completion(todo: Todo) -> tuple[str, datetime | None]:
    status = str(todo.get("STATUS", "")).strip().upper()
    percent = _parse_percent(todo)
    completed = _parse_completed(todo)

    if status == "CANCELLED":
        raise VTodoError("Cancelled VTODOs are not supported")
    if status not in _OPEN_STATUSES | {"COMPLETED"}:
        raise VTodoError("Unsupported VTODO status")
    if percent not in (None, 0, 100):
        raise VTodoError("Partial VTODO completion is not supported")

    if status == "COMPLETED":
        if percent not in (None, 100):
            raise VTodoError("Completed VTODO must be 100 percent complete")
        return "done", completed or utcnow()
    if status == "NEEDS-ACTION":
        if completed is not None or percent == 100:
            raise VTodoError("Open VTODO has conflicting completion fields")
        return "open", None

    # STATUS is optional in RFC 5545. Accept clients that express a completed
    # task through COMPLETED or PERCENT-COMPLETE alone, but reject contradictory
    # signals instead of silently normalizing them.
    if completed is not None or percent == 100:
        if percent == 0:
            raise VTodoError("VTODO has conflicting completion fields")
        return "done", completed or utcnow()
    return "open", None


def parse_vtodo(vtodo_text: str) -> ParsedVTodo:
    """Parse exactly one safe VTODO from a VCALENDAR payload."""
    if not isinstance(vtodo_text, str) or len(vtodo_text.encode("utf-8")) > MAX_VTODO_BYTES:
        raise VTodoError("VTODO calendar data is too large")
    try:
        calendar = Calendar.from_ical(vtodo_text)
    except Exception as exc:  # icalendar exposes several parser exception types
        raise VTodoError("Invalid VTODO calendar data") from exc
    if not isinstance(calendar, Calendar):
        raise VTodoError("Invalid VTODO calendar data")

    todos = []
    for component in calendar.subcomponents:
        name = component.name.upper()
        if name == "VTODO":
            todos.append(component)
        elif name != "VTIMEZONE":
            raise VTodoError("Unsupported calendar data component")
    if len(todos) != 1:
        raise VTodoError("A task payload must contain exactly one VTODO")
    todo: Todo = todos[0]
    _reject_reserved_properties(calendar)
    if todo.get("RRULE") is not None or todo.get("RECURRENCE-ID") is not None:
        raise VTodoError("Recurring VTODO uploads are not supported")
    if todo.get("DURATION") is not None:
        raise VTodoError("VTODO duration is not supported")

    uid = _clean_required(todo, "UID")
    title = _clean_required(todo, "SUMMARY")
    if len(uid) > 200:
        raise VTodoError("VTODO UID is too long")
    if len(title) > 240:
        raise VTodoError("VTODO summary is too long")
    description_prop = todo.get("DESCRIPTION")
    description = str(description_prop) if description_prop is not None else None
    due_date, due_is_date = _parse_due(todo)
    status, completed_at = _parse_completion(todo)
    return ParsedVTodo(
        uid=uid,
        fields={
            "title": title,
            "description": description,
            "due_date": due_date,
            "due_is_date": due_is_date,
            "priority": _parse_priority(todo),
            "status": status,
            "completed_at": completed_at,
        },
        raw_vtodo=vtodo_text,
    )


def _new_calendar() -> tuple[Calendar, Todo]:
    calendar = Calendar()
    calendar.add("PRODID", "-//Tribu//Tasks//EN")
    calendar.add("VERSION", "2.0")
    todo = Todo()
    calendar.add_component(todo)
    return calendar, todo


def _calendar_from_raw(raw: str | None) -> tuple[Calendar, Todo]:
    if not raw:
        return _new_calendar()
    try:
        parsed = parse_vtodo(raw)
        calendar = Calendar.from_ical(parsed.raw_vtodo)
        todo = next(component for component in calendar.subcomponents if component.name == "VTODO")
        return calendar, todo
    except Exception:
        # Stored data predating this codec must never break reads. Falling back
        # drops unsafe passthrough data while retaining the modeled Task row.
        return _new_calendar()


def _utc_property(value: datetime) -> datetime:
    return to_utc_aware(value).astimezone(UTC)


def task_to_vtodo(task) -> str:
    """Serialize a Task while preserving only safe unmodeled DAV data."""
    calendar, todo = _calendar_from_raw(getattr(task, "raw_vtodo", None))
    for name in _MODELED_PROPERTIES:
        while todo.get(name) is not None:
            del todo[name]

    uid = getattr(task, "vtodo_uid", None) or f"tribu-task-{task.id}@tribu.local"
    todo.add("UID", uid)
    todo.add("SUMMARY", task.title)
    if task.description:
        todo.add("DESCRIPTION", task.description)
    if task.due_date is not None:
        due = task.due_date.date() if getattr(task, "due_is_date", False) else task.due_date
        todo.add("DUE", due)
    todo.add("PRIORITY", _PRIORITY_TO_WIRE.get(task.priority, 5))

    if task.status == "done":
        completed = task.completed_at or task.updated_at or utcnow()
        todo.add("STATUS", "COMPLETED")
        todo.add("COMPLETED", _utc_property(completed))
        todo.add("PERCENT-COMPLETE", 100)
    else:
        todo.add("STATUS", "NEEDS-ACTION")
        todo.add("PERCENT-COMPLETE", 0)

    created = task.created_at or utcnow()
    modified = task.updated_at or created
    todo.add("DTSTAMP", _utc_property(modified))
    todo.add("CREATED", _utc_property(created))
    todo.add("LAST-MODIFIED", _utc_property(modified))
    return calendar.to_ical().decode("utf-8")
