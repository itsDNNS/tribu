"""ICS (RFC 5545) import/export utilities for Tribu calendar events."""

from datetime import datetime, date, timedelta
from typing import Mapping, Optional

from app.core.clock import to_local_wall_naive
from app.core.utils import utcnow

from icalendar import Calendar, Event, vCalAddress, vText

RECURRENCE_MAP = {
    "daily": "DAILY",
    "weekly": "WEEKLY",
    "biweekly": "WEEKLY",
    "monthly": "MONTHLY",
    "yearly": "YEARLY",
}

ICS_FREQ_TO_TRIBU = {
    "DAILY": "daily",
    "WEEKLY": "weekly",
    "MONTHLY": "monthly",
    "YEARLY": "yearly",
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

        if ev.recurrence and ev.recurrence in RECURRENCE_MAP:
            rrule = {"freq": RECURRENCE_MAP[ev.recurrence]}
            if ev.recurrence == "biweekly":
                rrule["interval"] = 2
            if ev.recurrence_end:
                until = ev.recurrence_end.date() if isinstance(ev.recurrence_end, datetime) else ev.recurrence_end
                rrule["until"] = until
            vevent.add("rrule", rrule)

        if ev.excluded_dates:
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

    Each error is {"index": int, "summary": str, "error": str}.
    """
    imported_at = utcnow()
    valid_events = []
    errors = []

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

        if not summary.strip():
            errors.append({"index": index, "summary": summary, "error": "Missing SUMMARY"})
            continue

        dtstart = component.get("dtstart")
        if not dtstart:
            errors.append({"index": index, "summary": summary, "error": "Missing DTSTART"})
            continue

        dtstart_val = dtstart.dt
        all_day = isinstance(dtstart_val, date) and not isinstance(dtstart_val, datetime)

        if all_day:
            starts_at = datetime(dtstart_val.year, dtstart_val.month, dtstart_val.day)
        else:
            if dtstart_val.tzinfo:
                starts_at = to_local_wall_naive(dtstart_val)
            else:
                starts_at = dtstart_val

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
        rrule = component.get("rrule")
        if rrule:
            freq_list = rrule.get("freq", [])
            freq = freq_list[0] if freq_list else None
            interval = rrule.get("interval", [1])[0] if rrule.get("interval") else 1

            if freq == "WEEKLY" and interval == 2:
                recurrence = "biweekly"
            elif freq in ICS_FREQ_TO_TRIBU:
                if interval != 1 and freq != "WEEKLY":
                    errors.append({
                        "index": index, "summary": summary,
                        "error": f"Unsupported RRULE INTERVAL={interval} for FREQ={freq}, imported without recurrence",
                    })
                else:
                    recurrence = ICS_FREQ_TO_TRIBU[freq]
            else:
                errors.append({
                    "index": index, "summary": summary,
                    "error": f"Unsupported RRULE FREQ={freq}, imported without recurrence",
                })

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
            "excluded_dates": excluded_dates or None,
            "created_by_user_id": user_id,
            "ical_uid": ical_uid,
            "source_type": source_type,
            "source_name": source_name,
            "source_url": source_url,
            "imported_at": imported_at,
            "last_synced_at": imported_at,
            "sync_status": "ok",
        }
        valid_events.append(event_dict)

    return valid_events, errors
