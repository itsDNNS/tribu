"""ICS (RFC 5545) import/export utilities for Tribu calendar events."""

import re
from datetime import datetime, date, timedelta
from typing import Mapping, Optional

from app.core.clock import to_local_wall_naive
from app.core.recurrence import is_last_weekday_of_month, normalize_weekdays, weekday_position
from app.core.utils import utcnow

from icalendar import Calendar, Event, vCalAddress, vText

RECURRENCE_MAP = {
    "daily": "DAILY",
    "weekly": "WEEKLY",
    "biweekly": "WEEKLY",
    "monthly": "MONTHLY",
    "monthly_weekday": "MONTHLY",
    "monthly_last_weekday": "MONTHLY",
    "yearly": "YEARLY",
    "yearly_weekday": "YEARLY",
    "yearly_last_weekday": "YEARLY",
}


def _assigned_member_ids(assigned_to, member_names: Mapping[int, str]) -> list[int]:
    """Resolve an event's ``assigned_to`` value to current member ids.

    ``assigned_to`` is null (nobody), ``"all"`` (whole family), or a list
    of user ids. Membership is recomputed against ``member_names`` so
    stale ids of users who left the family are silently skipped.
    """
    if assigned_to == "all":
        return sorted(member_names)
    if not isinstance(assigned_to, list):
        return []
    ids: list[int] = []
    for value in assigned_to:
        if isinstance(value, bool):
            continue
        try:
            user_id = int(value)
        except (TypeError, ValueError):
            continue
        if user_id in member_names and user_id not in ids:
            ids.append(user_id)
    return ids


def _member_attendee(user_id: int, display_name: str) -> vCalAddress:
    """Build a privacy-safe ATTENDEE for a family member.

    The cal-address is synthetic (``.invalid`` is reserved by RFC 2606,
    so no mail can ever be routed to it); the member's real login email
    must never leak into calendar data. ``X-TRIBU-USER-ID`` carries the
    stable id for round-tripping/debugging.
    """
    address = vCalAddress(f"mailto:user-{user_id}@tribu.invalid")
    address.params["CN"] = vText(display_name)
    address.params["CUTYPE"] = vText("INDIVIDUAL")
    address.params["ROLE"] = vText("REQ-PARTICIPANT")
    address.params["PARTSTAT"] = vText("ACCEPTED")
    address.params["RSVP"] = vText("FALSE")
    address.params["X-TRIBU-USER-ID"] = vText(str(user_id))
    return address


def events_to_ics(
    events,
    calendar_name="Tribu",
    member_names: Optional[Mapping[int, str]] = None,
) -> str:
    """Convert a list of CalendarEvent ORM objects to an RFC 5545 ICS string.

    ``member_names`` is an optional preloaded ``{user_id: display_name}``
    mapping for the events' family. When supplied, assigned members are
    projected as ATTENDEE properties; without it no attendee data is
    emitted at all, so callers stay in control of what member
    information leaves the system.
    """
    cal = Calendar()
    cal.add("prodid", "-//Tribu//Family Calendar//EN")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", calendar_name)

    for ev in events:
        vevent = Event()
        # Honor a client-chosen UID from CalDAV PUTs when present so the
        # next GET returns exactly the UID the client stored.
        uid = getattr(ev, "ical_uid", None) or f"tribu-event-{ev.id}@tribu.local"
        vevent.add("uid", uid)
        recurrence_id = getattr(ev, "recurrence_id", None)
        if recurrence_id is not None:
            # A changed occurrence that repeats changes all following ones.
            vevent.add(
                "recurrence-id",
                recurrence_id.date() if ev.all_day else recurrence_id,
                parameters={"RANGE": "THISANDFUTURE"} if ev.recurrence else None,
            )
        vevent.add("summary", ev.title)

        if ev.description:
            vevent.add("description", ev.description)
        if getattr(ev, "location", None):
            vevent.add("location", ev.location)

        assigned_to = getattr(ev, "assigned_to", None)
        if member_names:
            for user_id in _assigned_member_ids(assigned_to, member_names):
                vevent.add("attendee", _member_attendee(user_id, member_names[user_id]), encode=False)
            if assigned_to == "all":
                vevent.add("X-TRIBU-ASSIGNED", vText("ALL"))

        category = getattr(ev, "category", None)
        if isinstance(category, str) and category.strip():
            # One Tribu category maps to one CATEGORIES entry; the list
            # form makes icalendar escape embedded commas instead of
            # splitting the value into several categories.
            vevent.add("categories", [category])

        color = getattr(ev, "color", None)
        if isinstance(color, str) and color.strip():
            # Tribu colors are exact hex strings, but RFC 7986 COLOR only
            # permits CSS3 color names. Emitting a rounded name would be
            # lossy, so the exact value travels as an X- property instead.
            vevent.add("X-TRIBU-COLOR", vText(color))

        if ev.all_day:
            dt_start = ev.starts_at.date() if isinstance(ev.starts_at, datetime) else ev.starts_at
            vevent.add("dtstart", dt_start)
            dt_end = dt_start + timedelta(days=1)
            vevent.add("dtend", dt_end)
        else:
            vevent.add("dtstart", ev.starts_at)
            if ev.ends_at:
                vevent.add("dtend", ev.ends_at)

        # A changed occurrence follows the series' RRULE and EXDATEs.
        if ev.recurrence and ev.recurrence in RECURRENCE_MAP and recurrence_id is None:
            vevent.add("rrule", _rrule(ev))

        if ev.excluded_dates and recurrence_id is None:
            for d_str in ev.excluded_dates:
                try:
                    exdate = datetime.strptime(d_str, "%Y-%m-%d").date()
                    vevent.add("exdate", exdate)
                except (ValueError, TypeError):
                    pass

        dtstamp = ev.created_at if ev.created_at else utcnow()
        vevent.add("dtstamp", dtstamp)

        cal.add_component(vevent)

    return cal.to_ical().decode("utf-8")


def ics_to_event_dicts(
    ics_text: str,
    family_id: int,
    user_id: int,
    *,
    source_type: str = "import",
    source_name: str | None = None,
    source_url: str | None = None,
) -> tuple[list[dict], list[dict]]:
    """Parse an ICS string and return (valid_events, errors).

    Each valid_event is a dict ready for CalendarEvent(**dict). The
    VEVENT UID is preserved as ``ical_uid`` so a re-import of the same
    feed can be merged into the existing row instead of duplicated.
    Source metadata (``source_type`` / ``source_name`` / ``source_url``)
    flags the rows as non-local; ``imported_at`` is set to the current
    UTC time.

    A VEVENT with a RECURRENCE-ID replaces one occurrence of the series
    with the same UID and comes back with ``recurrence_id`` set to that
    occurrence's original start; the series itself has ``recurrence_id``
    None. A cancelled occurrence is not returned but excluded from its
    series. When a feed repeats the same UID and RECURRENCE-ID, only the
    VEVENT with the highest SEQUENCE is kept.

    Each error is {"index": int, "summary": str, "error": str}.
    """
    imported_at = utcnow()
    valid_events = []
    errors = []
    # (ical_uid, recurrence_id) -> (position in valid_events, SEQUENCE)
    seen: dict[tuple[str, Optional[datetime]], tuple[int, int]] = {}
    this_and_future_keys: set[tuple[str, datetime]] = set()
    cancelled_dates: dict[str, set[str]] = {}
    cancelled_from: dict[str, datetime] = {}

    try:
        cal = Calendar.from_ical(ics_text)
    except Exception:
        errors.append({"index": 0, "summary": "", "error": "Invalid ICS data"})
        return valid_events, errors

    index = 0
    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        summary = str(component.get("summary", "")) or ""
        index += 1

        uid_prop = component.get("uid")
        ical_uid = str(uid_prop).strip() if uid_prop else None
        if not ical_uid:
            ical_uid = None

        # Without a UID there is no series the occurrence could belong to.
        recurrence_id_prop = component.get("recurrence-id") if ical_uid else None
        recurrence_id = _local_wall_datetime(recurrence_id_prop.dt) if recurrence_id_prop is not None else None
        this_and_future = (
            recurrence_id is not None
            and str(recurrence_id_prop.params.get("RANGE", "")).upper() == "THISANDFUTURE"
        )
        if recurrence_id is not None and str(component.get("status", "")).upper() == "CANCELLED":
            if this_and_future:
                previous = cancelled_from.get(ical_uid)
                cancelled_from[ical_uid] = min(previous, recurrence_id) if previous else recurrence_id
            else:
                cancelled_dates.setdefault(ical_uid, set()).add(recurrence_id.strftime("%Y-%m-%d"))
            continue

        if not summary.strip():
            errors.append({"index": index, "summary": summary, "error": "Missing SUMMARY"})
            continue

        dtstart = component.get("dtstart")
        if not dtstart:
            errors.append({"index": index, "summary": summary, "error": "Missing DTSTART"})
            continue

        dtstart_val = dtstart.dt
        all_day = isinstance(dtstart_val, date) and not isinstance(dtstart_val, datetime)
        starts_at = _local_wall_datetime(dtstart_val)

        dtend = component.get("dtend")
        ends_at = None
        if dtend:
            dtend_val = dtend.dt
            if all_day:
                pass  # All-day events: DTEND is exclusive, we don't store ends_at for all-day
            else:
                if isinstance(dtend_val, datetime):
                    if dtend_val.tzinfo:
                        ends_at = to_local_wall_naive(dtend_val)
                    else:
                        ends_at = dtend_val

        recurrence = None
        recurrence_end = None
        recurrence_weekdays = None
        # A changed occurrence follows its series' RRULE, so its own is
        # ignored.
        rrule = component.get("rrule") if recurrence_id is None else None
        if rrule:
            rule = _tribu_recurrence(rrule, dtstart_val, starts_at)
            if rule is None:
                errors.append({
                    "index": index, "summary": summary,
                    "error": f"Unsupported RRULE {rrule.to_ical().decode()}, imported without recurrence",
                })
            else:
                recurrence, recurrence_weekdays = rule

            until_list = rrule.get("until", [])
            if until_list:
                until_val = until_list[0]
                if isinstance(until_val, datetime):
                    if until_val.tzinfo:
                        recurrence_end = to_local_wall_naive(until_val)
                    else:
                        recurrence_end = until_val
                elif isinstance(until_val, date):
                    recurrence_end = datetime(until_val.year, until_val.month, until_val.day)

            if rrule.get("count"):
                errors.append({
                    "index": index, "summary": summary,
                    "error": "RRULE COUNT not supported, imported without recurrence end",
                })

        excluded_dates = []
        exdates = component.get("exdate")
        if exdates:
            if not isinstance(exdates, list):
                exdates = [exdates]
            for exdate_prop in exdates:
                if hasattr(exdate_prop, "dts"):
                    for dt_item in exdate_prop.dts:
                        d = dt_item.dt
                        if isinstance(d, datetime):
                            excluded_dates.append(d.strftime("%Y-%m-%d"))
                        elif isinstance(d, date):
                            excluded_dates.append(d.strftime("%Y-%m-%d"))
                else:
                    d = exdate_prop.dt if hasattr(exdate_prop, "dt") else exdate_prop
                    if isinstance(d, (date, datetime)):
                        excluded_dates.append(d.strftime("%Y-%m-%d"))

        event_dict = {
            "family_id": family_id,
            "title": summary.strip(),
            "description": str(component.get("description", "")).strip() or None,
            "location": str(component.get("location", "")).strip() or None,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "all_day": all_day,
            "recurrence": recurrence,
            "recurrence_end": recurrence_end,
            "recurrence_weekdays": recurrence_weekdays,
            "excluded_dates": excluded_dates or None,
            "created_by_user_id": user_id,
            "ical_uid": ical_uid,
            "recurrence_id": recurrence_id,
            "source_type": source_type,
            "source_name": source_name,
            "source_url": source_url,
            "imported_at": imported_at,
            "last_synced_at": imported_at,
            "sync_status": "ok",
        }

        if ical_uid is None:
            valid_events.append(event_dict)
            continue
        key = (ical_uid, recurrence_id)
        sequence = _sequence(component)
        if key in seen:
            position, kept_sequence = seen[key]
            if sequence >= kept_sequence:
                valid_events[position] = event_dict
                seen[key] = (position, sequence)
                this_and_future_keys.discard(key)
                if this_and_future:
                    this_and_future_keys.add(key)
            continue
        seen[key] = (len(valid_events), sequence)
        valid_events.append(event_dict)
        if this_and_future:
            this_and_future_keys.add(key)

    for (ical_uid, recurrence_id) in this_and_future_keys:
        series = seen.get((ical_uid, None))
        if series is not None:
            _continue_series(valid_events[seen[(ical_uid, recurrence_id)][0]], valid_events[series[0]])

    for ical_uid, dates in cancelled_dates.items():
        series = seen.get((ical_uid, None))
        if series is None:
            continue
        event_dict = valid_events[series[0]]
        excluded = event_dict["excluded_dates"] or []
        event_dict["excluded_dates"] = excluded + sorted(dates - set(excluded))

    for ical_uid, cancelled_at in cancelled_from.items():
        series = seen.get((ical_uid, None))
        if series is None:
            continue
        # Cancelling this and all following occurrences ends the series.
        event_dict = valid_events[series[0]]
        new_end = cancelled_at - timedelta(seconds=1)
        if event_dict["recurrence_end"] is None or event_dict["recurrence_end"] > new_end:
            event_dict["recurrence_end"] = new_end

    return valid_events, errors


def _continue_series(occurrence: dict, series: dict) -> None:
    """Let a RANGE=THISANDFUTURE occurrence carry its series' rule onward.

    RFC 5545 applies the occurrence's changes, including a shift of its
    start, to all following occurrences.
    """
    if not series["recurrence"]:
        return
    cutoff = occurrence["recurrence_id"].strftime("%Y-%m-%d")
    shift = (occurrence["starts_at"].date() - occurrence["recurrence_id"].date()).days
    occurrence["recurrence"] = series["recurrence"]
    occurrence["recurrence_end"] = series["recurrence_end"]
    occurrence["recurrence_weekdays"] = (
        normalize_weekdays([(day + shift) % 7 for day in series["recurrence_weekdays"]], occurrence["starts_at"])
        if series["recurrence_weekdays"]
        else None
    )
    occurrence["excluded_dates"] = [d for d in series["excluded_dates"] or [] if d >= cutoff] or None


_BYDAY = re.compile(r"^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$")
_ICS_WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")


def _rrule(ev) -> dict:
    """The RRULE for a Tribu recurrence; weekday rules take their day from starts_at."""
    rrule = {"freq": RECURRENCE_MAP[ev.recurrence]}
    start = ev.starts_at
    weekday = _ICS_WEEKDAYS[start.weekday()]
    if ev.recurrence == "biweekly":
        rrule["interval"] = 2
    if ev.recurrence in ("weekly", "biweekly"):
        weekdays = normalize_weekdays(getattr(ev, "recurrence_weekdays", None), start)
        if weekdays:
            rrule["byday"] = [_ICS_WEEKDAYS[day] for day in weekdays]
    if ev.recurrence in ("yearly_weekday", "yearly_last_weekday"):
        rrule["bymonth"] = start.month
    if ev.recurrence in ("monthly_weekday", "yearly_weekday"):
        rrule["byday"] = f"{weekday_position(start)}{weekday}"
    if ev.recurrence in ("monthly_last_weekday", "yearly_last_weekday"):
        rrule["byday"] = f"-1{weekday}"
    if ev.recurrence_end:
        until = ev.recurrence_end.date() if isinstance(ev.recurrence_end, datetime) else ev.recurrence_end
        rrule["until"] = until
    return rrule


def _first(rrule, name: str):
    values = rrule.get(name) or []
    return values[0] if values else None


def _tribu_recurrence(rrule, dtstart, starts_at: datetime) -> Optional[tuple[str, Optional[list[int]]]]:
    """The Tribu recurrence and weekday list for an RRULE, or None if unsupported.

    Supported are DAILY; WEEKLY every one or two weeks, also on several
    weekdays (BYDAY=MO,WE, and DAILY;BYDAY=... as weekly); MONTHLY on
    DTSTART's day or on one weekday by its position (BYDAY=2TH,
    BYDAY=-1FR, BYDAY=TH;BYSETPOS=2); YEARLY on DTSTART's date or on one
    weekday by its position in DTSTART's month (BYMONTH=11;BYDAY=4TH).
    Weekday rules must match DTSTART.
    """
    freq = _first(rrule, "freq")
    interval = int(_first(rrule, "interval") or 1)
    parts = set(rrule) - {"FREQ", "INTERVAL", "UNTIL", "COUNT", "WKST"}
    if parts & {"BYYEARDAY", "BYWEEKNO", "BYHOUR", "BYMINUTE", "BYSECOND"}:
        return None
    # Weekdays live in DTSTART's own time zone; converting to Tribu's
    # time zone can move the series by a day.
    source_date = dtstart.date() if isinstance(dtstart, datetime) else dtstart
    shift = (starts_at.date() - source_date).days
    by_day = [_BYDAY.match(str(value).upper()) for value in rrule.get("byday") or []]
    if any(match is None for match in by_day):
        return None

    if freq in ("DAILY", "WEEKLY"):
        if parts - {"BYDAY"} or any(match.group(1) for match in by_day):
            return None
        if freq == "DAILY" and interval != 1:
            return None
        if interval not in (1, 2):
            return None
        days = sorted({_ICS_WEEKDAYS.index(match.group(2)) for match in by_day})
        if freq == "DAILY" and not days:
            return "daily", None
        # With weeks starting on Sunday, a Sunday belongs to the following
        # Monday's week, which changes which weeks repeat.
        if interval == 2 and 6 in days and len(days) > 1 and str(_first(rrule, "wkst") or "MO").upper() != "MO":
            return None
        recurrence = "biweekly" if interval == 2 else "weekly"
        return recurrence, normalize_weekdays([(day + shift) % 7 for day in days], starts_at)

    if interval != 1 or freq not in ("MONTHLY", "YEARLY"):
        return None
    by_month = [int(month) for month in rrule.get("bymonth") or []]
    by_month_day = [int(day) for day in rrule.get("bymonthday") or []]
    by_set_pos = [int(pos) for pos in rrule.get("bysetpos") or []]
    if freq == "MONTHLY" and by_month:
        return None
    if freq == "YEARLY" and by_month not in ([], [source_date.month]):
        return None
    if not by_day:
        # YEARLY with BYMONTHDAY but no BYMONTH repeats in every month.
        if by_set_pos or any(day != source_date.day for day in by_month_day) or (freq == "YEARLY" and by_month_day and not by_month):
            return None
        return ("monthly" if freq == "MONTHLY" else "yearly"), None

    # One weekday by its position; for YEARLY within DTSTART's month.
    if by_month_day or len(by_day) != 1 or len(by_set_pos) > 1 or (freq == "YEARLY" and not by_month):
        return None
    match = by_day[0]
    if match.group(1) and by_set_pos:
        return None
    position = int(match.group(1) or (by_set_pos[0] if by_set_pos else 0))
    if shift or _ICS_WEEKDAYS[source_date.weekday()] != match.group(2):
        return None
    prefix = "monthly" if freq == "MONTHLY" else "yearly"
    if position == -1 and is_last_weekday_of_month(source_date):
        return f"{prefix}_last_weekday", None
    if 1 <= position <= 5 and position == weekday_position(source_date):
        return f"{prefix}_weekday", None
    return None


def _local_wall_datetime(value) -> datetime:
    """A DTSTART-like value as a naive local wall-clock datetime.

    Dates become midnight; aware datetimes are converted to Tribu's
    timezone.
    """
    if not isinstance(value, datetime):
        return datetime(value.year, value.month, value.day)
    return to_local_wall_naive(value)


def _sequence(component) -> int:
    try:
        return int(component.get("sequence", 0))
    except (TypeError, ValueError):
        return 0
