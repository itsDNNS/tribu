"""Display-device endpoints (issue #172).

Two surfaces in one router:

1. Admin-facing CRUD under ``/families/{family_id}/display-devices``
   — gated by ``ensure_family_admin`` and ``current_user``. Creating a
   device returns the plaintext token exactly once; listing never
   exposes it again.

2. Display-runtime endpoints under ``/display/me`` and
   ``/display/dashboard`` — gated by ``current_display_device``, which
   only accepts ``tribu_display_...`` bearer tokens. The token is
   bound to a single family at creation time, so the display does not
   pass ``family_id`` on these calls and cannot widen its view.

The display dashboard is a *curated* projection of the family
state. It deliberately excludes member emails, admin metadata, and
audit fragments so a token leak from a wall tablet does not leak
account identifiers.
"""

from datetime import UTC, date, datetime, time, timedelta
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.core.clock import local_today, local_wall_now, to_local_wall_naive, utcnow
from app.core.deps import current_display_device, current_user, ensure_family_admin, next_birthday_date
from app.core.errors import DISPLAY_DEVICE_NOT_FOUND, WEATHER_SEARCH_UNAVAILABLE, error_detail
from app.core.recurrence import expand_event
from app.core.scopes import require_scope
from app.core.display_layouts import normalize_config
from app.core import weather as weather_service
from app.database import get_db
from app.models import (
    CalendarEvent,
    DisplayDevice,
    Family,
    FamilyBirthday,
    MealPlan,
    Membership,
    Reward,
    RewardCurrency,
    SchoolTimetable,
    SchoolTimetableAssignment,
    SchoolTimetableLesson,
    ShoppingItem,
    ShoppingList,
    Task,
    User,
)
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    DisplayDashboardBirthday,
    DisplayDashboardEvent,
    DisplayDashboardMember,
    DisplayDashboardResponse,
    DisplayDashboardTask,
    DisplayCountdown,
    DisplayMeal,
    DisplayRewardMember,
    DisplayRewards,
    DisplayRoutine,
    DisplayShopping,
    DisplayShoppingList,
    DisplayWeather,
    DisplaySchoolTimetableGroup,
    DisplaySchoolTimetableLesson,
    SchoolTimetableMemberResponse,
    DisplayDeviceCreate,
    DisplayDeviceCreatedResponse,
    DisplayDeviceResponse,
    DisplayDeviceUpdate,
    DisplayDeviceConfig,
    DisplayMeResponse,
    FamilyWeatherLocation,
    FamilyWeatherLocationUpdate,
    WeatherPlace,
    sanitize_profile_image_data_url,
)
from app.core.utils import get_setting
from app.modules.rewards_router import _compute_balance
from app.security import generate_display_token


admin_router = APIRouter(prefix="/families", tags=["display"], responses={**AUTH_RESPONSES})
display_router = APIRouter(prefix="/display", tags=["display"], responses={**AUTH_RESPONSES})

_HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-f]{3}|[0-9a-f]{6})$", re.IGNORECASE)


def _sanitize_display_color(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if _HEX_COLOR_RE.fullmatch(trimmed) else None


def _participant_colors(assigned_to, member_colors_by_user_id: dict[int, str]) -> list[str]:
    """Return display-safe member colors for an event assignment."""
    if assigned_to == "all":
        return list(dict.fromkeys(member_colors_by_user_id.values()))
    if not isinstance(assigned_to, list):
        return []

    colors: list[str] = []
    seen: set[str] = set()
    for value in assigned_to:
        if isinstance(value, bool):
            continue
        try:
            user_id = int(value)
        except (TypeError, ValueError):
            continue
        color = member_colors_by_user_id.get(user_id)
        if color and color not in seen:
            seen.add(color)
            colors.append(color)
    return colors


def _device_config(device: DisplayDevice) -> DisplayDeviceConfig:
    config = normalize_config(
        mode=device.display_mode,
        refresh_interval_seconds=device.refresh_interval_seconds,
        layout_preset=device.layout_preset,
        layout_config=device.layout_config,
    )
    return DisplayDeviceConfig(**config)


# ---------------------------------------------------------------------------
# Admin CRUD (user-authenticated, family-admin gated)
# ---------------------------------------------------------------------------


@admin_router.get(
    "/{family_id}/display-devices",
    response_model=List[DisplayDeviceResponse],
    summary="List display devices for a family",
    description=(
        "Return all display devices bound to this family, including revoked ones. "
        "Admin role required. Plaintext tokens are NEVER included — they are only "
        "returned once at creation. Scope: `families:read`."
    ),
    response_description="List of display device metadata (no plaintext tokens)",
)
def list_display_devices(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)
    return (
        db.query(DisplayDevice)
        .filter(DisplayDevice.family_id == family_id)
        .order_by(DisplayDevice.created_at.desc())
        .all()
    )


@admin_router.post(
    "/{family_id}/display-devices",
    response_model=DisplayDeviceCreatedResponse,
    summary="Create a display device",
    description=(
        "Mint a new display device for this family. The plaintext bearer token "
        "is returned exactly once — pair it with the device immediately. Admin "
        "role required. Scope: `families:write`."
    ),
    response_description="Token value (shown once) and device metadata",
)
def create_display_device(
    family_id: int,
    payload: DisplayDeviceCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    plain, token_hash, lookup_key = generate_display_token()
    config = normalize_config(
        mode=payload.display_mode,
        refresh_interval_seconds=payload.refresh_interval_seconds,
        layout_preset=payload.layout_preset,
        layout_config=payload.layout_config,
    )
    device = DisplayDevice(
        family_id=family_id,
        name=payload.name,
        token_hash=token_hash,
        token_lookup=lookup_key,
        created_by_user_id=user.id,
        display_mode=config["display_mode"],
        refresh_interval_seconds=config["refresh_interval_seconds"],
        layout_preset=config["layout_preset"],
        layout_config=config["layout_config"],
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    return DisplayDeviceCreatedResponse(
        token=plain,
        device=DisplayDeviceResponse.model_validate(device),
    )


@admin_router.patch(
    "/{family_id}/display-devices/{device_id}",
    response_model=DisplayDeviceResponse,
    summary="Update a display device",
    response_description="Updated display device metadata (no plaintext token)",
    responses={**NOT_FOUND_RESPONSE},
)
def update_display_device(
    family_id: int,
    device_id: int,
    payload: DisplayDeviceUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    device = (
        db.query(DisplayDevice)
        .filter(DisplayDevice.id == device_id, DisplayDevice.family_id == family_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))
    if device.revoked_at is not None:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        device.name = data["name"]
    if {"display_mode", "refresh_interval_seconds", "layout_preset", "layout_config"} & data.keys():
        config = normalize_config(
            mode=data.get("display_mode", device.display_mode),
            refresh_interval_seconds=data.get("refresh_interval_seconds", device.refresh_interval_seconds),
            layout_preset=data.get("layout_preset", device.layout_preset),
            layout_config=data.get("layout_config", device.layout_config),
        )
        device.display_mode = config["display_mode"]
        device.refresh_interval_seconds = config["refresh_interval_seconds"]
        device.layout_preset = config["layout_preset"]
        device.layout_config = config["layout_config"]
    db.commit()
    db.refresh(device)
    return DisplayDeviceResponse.model_validate(device)


@admin_router.delete(
    "/{family_id}/display-devices/{device_id}",
    summary="Revoke a display device",
    description=(
        "Soft-revoke the display device by stamping ``revoked_at``. The token "
        "stops authenticating immediately but the row is preserved for audit. "
        "Admin role required. Scope: `families:write`."
    ),
    response_description="Revocation confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def revoke_display_device(
    family_id: int,
    device_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    device = (
        db.query(DisplayDevice)
        .filter(
            DisplayDevice.id == device_id,
            DisplayDevice.family_id == family_id,
        )
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail=error_detail(DISPLAY_DEVICE_NOT_FOUND))
    if device.revoked_at is None:
        device.revoked_at = utcnow()
        db.commit()
    return {"status": "revoked", "device_id": device_id}


@admin_router.get(
    "/{family_id}/weather-location",
    response_model=FamilyWeatherLocation,
    summary="Get the family weather place",
    description="Return the place used for the shared-display weather card. Admin role required. Scope: `families:read`.",
)
def get_weather_location(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)
    family = db.query(Family).filter(Family.id == family_id).first()
    return FamilyWeatherLocation(
        name=family.weather_location_name if family else None,
        latitude=family.weather_latitude if family else None,
        longitude=family.weather_longitude if family else None,
    )


@admin_router.put(
    "/{family_id}/weather-location",
    response_model=FamilyWeatherLocation,
    summary="Set the family weather place",
    description=(
        "Store the place whose Open-Meteo forecast is shown on shared displays. "
        "Only the coordinates are sent to Open-Meteo. Admin role required. Scope: `families:write`."
    ),
)
def set_weather_location(
    family_id: int,
    payload: FamilyWeatherLocationUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    family = db.query(Family).filter(Family.id == family_id).first()
    family.weather_location_name = payload.name.strip()
    family.weather_latitude = payload.latitude
    family.weather_longitude = payload.longitude
    db.commit()
    return FamilyWeatherLocation(name=family.weather_location_name, latitude=family.weather_latitude, longitude=family.weather_longitude)


@admin_router.delete(
    "/{family_id}/weather-location",
    response_model=FamilyWeatherLocation,
    summary="Turn off display weather",
    description="Remove the family weather place; displays stop showing weather. Admin role required. Scope: `families:write`.",
)
def clear_weather_location(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)
    family = db.query(Family).filter(Family.id == family_id).first()
    family.weather_location_name = None
    family.weather_latitude = None
    family.weather_longitude = None
    db.commit()
    return FamilyWeatherLocation()


@admin_router.get(
    "/{family_id}/weather-location/search",
    response_model=List[WeatherPlace],
    summary="Search places for display weather",
    description="Look up places with the Open-Meteo geocoder. Admin role required. Scope: `families:read`.",
    responses={502: {"description": "The geocoder could not be reached"}},
)
def search_weather_location(
    family_id: int,
    q: str = Query(..., min_length=2, max_length=80),
    lang: str = Query("en", pattern=r"^[a-z]{2}$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)
    try:
        return weather_service.search_places(q.strip(), lang)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=error_detail(WEATHER_SEARCH_UNAVAILABLE)) from exc


# ---------------------------------------------------------------------------
# Display runtime (display-token authenticated, family bound by the token)
# ---------------------------------------------------------------------------


@display_router.get(
    "/me",
    response_model=DisplayMeResponse,
    summary="Get current display device identity",
    description=(
        "Return the identity of the display device backing this token. Bound "
        "to a single family at creation time; no user/email data is returned."
    ),
    response_description="Display device identity",
)
def display_me(
    device: DisplayDevice = Depends(current_display_device),
    db: Session = Depends(get_db),
):
    family = db.query(Family).filter(Family.id == device.family_id).first()
    family_name = family.name if family else ""
    return DisplayMeResponse(
        device_id=device.id,
        family_id=device.family_id,
        family_name=family_name,
        name=device.name,
        config=_device_config(device),
    )


MEAL_SLOT_ORDER = {"morning": 0, "noon": 1, "evening": 2}
MAX_WEEK_EVENTS = 60
MAX_SHOPPING_LISTS = 3
MAX_SHOPPING_ITEMS = 12
MAX_ROUTINES = 40
MAX_DUE_TASKS = 12
COUNTDOWN_DAYS = 60
MAX_COUNTDOWNS = 5


def _member_refs(assigned_to, ref_by_user_id: dict[int, int]) -> list[int]:
    """Positions in the display member list for an event assignment."""
    if assigned_to == "all":
        return sorted(ref_by_user_id.values())
    if not isinstance(assigned_to, list):
        return []
    refs: list[int] = []
    for value in assigned_to:
        if isinstance(value, bool):
            continue
        try:
            ref = ref_by_user_id.get(int(value))
        except (TypeError, ValueError):
            continue
        if ref is not None and ref not in refs:
            refs.append(ref)
    return refs


def _occurrences_overlapping(db: Session, family_id: int, start: datetime, end: datetime) -> list[dict]:
    """Expanded event occurrences that overlap [start, end), sorted by start."""
    candidates = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.family_id == family_id)
        .filter(
            CalendarEvent.recurrence.isnot(None)
            | ((CalendarEvent.starts_at < end) & ((CalendarEvent.ends_at > start) | (CalendarEvent.starts_at >= start)))
        )
        .all()
    )
    occurrences: list[dict] = []
    for event in candidates:
        duration = (event.ends_at - event.starts_at) if event.starts_at and event.ends_at and event.ends_at > event.starts_at else timedelta(0)
        for row in expand_event(event, start - duration, end):
            row_end = row.get("ends_at")
            if row["starts_at"] < end and (row_end > start if row_end else row["starts_at"] >= start):
                occurrences.append(row)
    occurrences.sort(key=lambda row: (row["starts_at"], row.get("title") or ""))
    return occurrences


def _event_projection(row: dict, colors: dict[int, str], refs: dict[int, int]) -> DisplayDashboardEvent:
    return DisplayDashboardEvent(
        title=row["title"],
        starts_at=row["starts_at"],
        ends_at=row.get("ends_at"),
        all_day=bool(row.get("all_day", False)),
        occurrence_date=row.get("occurrence_date"),
        color=row.get("color"),
        category=row.get("category"),
        icon=row.get("icon"),
        participant_colors=_participant_colors(row.get("assigned_to"), colors),
        member_refs=_member_refs(row.get("assigned_to"), refs),
        location=row.get("location"),
    )


def _school_timetables_for(db: Session, family_id: int, day: date, membership_by_user_id: dict) -> list[DisplaySchoolTimetableGroup]:
    weekday = day.isoweekday()
    if not 1 <= weekday <= 6:
        return []
    timetables = (
        db.query(SchoolTimetable)
        .options(
            joinedload(SchoolTimetable.periods),
            joinedload(SchoolTimetable.lessons).joinedload(SchoolTimetableLesson.period),
            joinedload(SchoolTimetable.assignments).joinedload(SchoolTimetableAssignment.member),
        )
        .filter(SchoolTimetable.family_id == family_id)
        .order_by(SchoolTimetable.name.asc())
        .all()
    )
    groups: list[DisplaySchoolTimetableGroup] = []
    for timetable in timetables:
        if weekday == 6 and not timetable.include_saturday:
            continue
        lessons_by_period_id = {lesson.period_id: lesson for lesson in timetable.lessons if lesson.weekday == weekday}
        display_lessons: list[DisplaySchoolTimetableLesson] = []
        for period in sorted(timetable.periods, key=lambda p: p.position):
            lesson = lessons_by_period_id.get(period.id)
            if period.kind == "break" or lesson is not None:
                display_lessons.append(DisplaySchoolTimetableLesson(
                    period_label=period.label,
                    start_time=period.start_time,
                    end_time=period.end_time,
                    kind=period.kind,
                    break_label=period.break_label,
                    subject=lesson.subject if lesson else None,
                    color=lesson.color if lesson else None,
                ))
        if not any(lesson.kind != "break" for lesson in display_lessons):
            continue
        children = []
        for assignment in timetable.assignments:
            member = assignment.member
            membership = membership_by_user_id.get(assignment.member_user_id)
            if not member or not membership:
                continue
            children.append(SchoolTimetableMemberResponse(
                display_name=member.display_name,
                color=membership.color,
                profile_image=sanitize_profile_image_data_url(member.profile_image),
            ))
        groups.append(DisplaySchoolTimetableGroup(
            name=timetable.name,
            class_label=timetable.class_label,
            children=children,
            lessons=display_lessons,
        ))
    return groups


def _upcoming_birthdays(db: Session, family_id: int, today: date) -> list[DisplayDashboardBirthday]:
    upcoming: list[DisplayDashboardBirthday] = []
    for birthday in db.query(FamilyBirthday).filter(FamilyBirthday.family_id == family_id).all():
        occurs_on = next_birthday_date(birthday.month, birthday.day, today)
        days_until = (occurs_on - today).days
        if days_until <= 28:
            upcoming.append(DisplayDashboardBirthday(
                person_name=birthday.person_name,
                occurs_on=occurs_on.isoformat(),
                days_until=days_until,
            ))
    upcoming.sort(key=lambda item: item.days_until)
    return upcoming


def _meals(db: Session, family_id: int, today: date) -> list[DisplayMeal]:
    rows = (
        db.query(MealPlan)
        .filter(MealPlan.family_id == family_id, MealPlan.plan_date >= today, MealPlan.plan_date <= today + timedelta(days=1))
        .all()
    )
    rows.sort(key=lambda meal: (meal.plan_date, MEAL_SLOT_ORDER.get(meal.slot, 9)))
    return [DisplayMeal(plan_date=meal.plan_date, slot=meal.slot, meal_name=meal.meal_name) for meal in rows]


def _shopping(db: Session, family_id: int) -> DisplayShopping:
    lists: list[DisplayShoppingList] = []
    total = 0
    for shopping_list in db.query(ShoppingList).filter(ShoppingList.family_id == family_id).order_by(ShoppingList.id.asc()).all():
        open_items = (
            db.query(ShoppingItem)
            .filter(ShoppingItem.list_id == shopping_list.id, ShoppingItem.archived.is_(False), ShoppingItem.checked.is_(False))
            .order_by(ShoppingItem.position.asc(), ShoppingItem.id.asc())
            .all()
        )
        if not open_items:
            continue
        total += len(open_items)
        lists.append(DisplayShoppingList(
            name=shopping_list.name,
            open_count=len(open_items),
            items=[item.name for item in open_items[:MAX_SHOPPING_ITEMS]],
        ))
    lists.sort(key=lambda item: -item.open_count)
    return DisplayShopping(open_count=total, lists=lists[:MAX_SHOPPING_LISTS])


def _routines(db: Session, family_id: int, today: date, refs: dict[int, int]) -> list[DisplayRoutine]:
    """Recurring tasks due today (or overdue) plus those completed today, as in the dashboard."""
    tomorrow_start = datetime.combine(today + timedelta(days=1), time.min)
    rows = (
        db.query(Task)
        .filter(Task.family_id == family_id, Task.recurrence.isnot(None))
        .filter(
            ((Task.status == "open") & Task.due_date.isnot(None) & (Task.due_date < tomorrow_start))
            | ((Task.status == "done") & Task.completed_at.isnot(None))
        )
        .order_by(Task.due_date.asc().nullslast(), Task.id.asc())
        .all()
    )
    routines: list[DisplayRoutine] = []
    for task in rows:
        if task.status == "done":
            completed = to_local_wall_naive(task.completed_at.replace(tzinfo=UTC))
            if completed is None or completed.date() != today:
                continue
        routines.append(DisplayRoutine(
            title=task.title,
            done=task.status == "done",
            member_ref=refs.get(task.assigned_to_user_id) if task.assigned_to_user_id is not None else None,
        ))
    return routines[:MAX_ROUTINES]


def _due_tasks(db: Session, family_id: int, today: date, colors: dict[int, str], refs: dict[int, int]) -> list[DisplayDashboardTask]:
    today_start = datetime.combine(today, time.min)
    tomorrow_start = today_start + timedelta(days=1)
    after_tomorrow = tomorrow_start + timedelta(days=1)
    rows = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status == "open",
            Task.recurrence.is_(None),
            Task.due_date.isnot(None),
            Task.due_date < after_tomorrow,
        )
        .order_by(Task.due_date.asc(), Task.id.asc())
        .limit(MAX_DUE_TASKS)
        .all()
    )
    return [
        DisplayDashboardTask(
            title=task.title,
            priority=task.priority,
            due_date=task.due_date,
            participant_colors=[colors[task.assigned_to_user_id]] if task.assigned_to_user_id in colors else [],
            member_ref=refs.get(task.assigned_to_user_id) if task.assigned_to_user_id is not None else None,
            due_state="overdue" if task.due_date < today_start else "today" if task.due_date < tomorrow_start else "tomorrow",
        )
        for task in rows
    ]


def _rewards(db: Session, family_id: int, memberships: list[Membership], refs: dict[int, int]) -> DisplayRewards | None:
    currency = db.query(RewardCurrency).filter(RewardCurrency.family_id == family_id).first()
    if not currency:
        return None
    costs = sorted(
        (reward.cost, reward.name)
        for reward in db.query(Reward).filter(Reward.family_id == family_id, Reward.is_active.is_(True)).all()
    )
    members: list[DisplayRewardMember] = []
    for membership in memberships:
        ref = refs.get(membership.user_id)
        if ref is None:
            continue
        balance = _compute_balance(db, family_id, membership.user_id)
        # Children always appear; adults only once they actually collect.
        if membership.is_adult and balance <= 0:
            continue
        goal = next(((cost, name) for cost, name in costs if cost > balance), costs[-1] if costs else None)
        members.append(DisplayRewardMember(
            member_ref=ref,
            balance=balance,
            next_reward_name=goal[1] if goal else None,
            next_reward_cost=goal[0] if goal else None,
        ))
    return DisplayRewards(currency_name=currency.name, currency_icon=currency.icon, members=members)


def _countdowns(db: Session, family_id: int, today: date) -> list[DisplayCountdown]:
    start = datetime.combine(today + timedelta(days=1), time.min)
    end = datetime.combine(today + timedelta(days=COUNTDOWN_DAYS + 1), time.min)
    seen: set[tuple[str, date]] = set()
    countdowns: list[DisplayCountdown] = []
    for row in _occurrences_overlapping(db, family_id, start, end):
        starts_on = row["starts_at"].date()
        if not row.get("all_day") or starts_on < start.date() or (row["title"], starts_on) in seen:
            continue
        seen.add((row["title"], starts_on))
        countdowns.append(DisplayCountdown(title=row["title"], starts_on=starts_on.isoformat(), days_until=(starts_on - today).days))
        if len(countdowns) >= MAX_COUNTDOWNS:
            break
    return countdowns


def _weather(family: Family | None) -> DisplayWeather | None:
    if not family or family.weather_latitude is None or family.weather_longitude is None:
        return None
    forecast = weather_service.get_forecast(family.weather_latitude, family.weather_longitude)
    if not forecast:
        return None
    return DisplayWeather(location_name=family.weather_location_name or "", **{k: v for k, v in forecast.items() if k != "observed_at"})


@display_router.get(
    "/dashboard",
    response_model=DisplayDashboardResponse,
    summary="Get the shared-home display dashboard",
    description=(
        "Return a curated, read-only dashboard for the family this display "
        "is bound to: members (no emails), today/tomorrow/week events, the "
        "next events (14 days), routines, due tasks, meals, shopping, rewards, "
        "birthdays, countdowns, school timetables and optional weather. The "
        "display token determines the family — there is no ``family_id`` query parameter."
    ),
    response_description="Display dashboard payload",
)
def display_dashboard(
    device: DisplayDevice = Depends(current_display_device),
    db: Session = Depends(get_db),
):
    family_id = device.family_id
    family = db.query(Family).filter(Family.id == family_id).first()

    memberships = [
        m
        for m in (
            db.query(Membership)
            .join(User, User.id == Membership.user_id)
            .options(joinedload(Membership.user))
            .filter(Membership.family_id == family_id)
            .order_by(User.display_name.asc(), Membership.user_id.asc())
            .all()
        )
        if m.user
    ]
    members = [
        DisplayDashboardMember(
            display_name=m.user.display_name,
            color=m.color,
            profile_image=sanitize_profile_image_data_url(m.user.profile_image),
        )
        for m in memberships
    ]
    refs = {int(m.user_id): index for index, m in enumerate(memberships)}
    colors = {int(m.user_id): color for m in memberships if (color := _sanitize_display_color(m.color))}
    membership_by_user_id = {m.user_id: m for m in memberships}

    now = local_wall_now(utcnow())
    today = local_today()
    today_start = datetime.combine(today, time.min)
    tomorrow_start = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today.weekday())

    upcoming = _occurrences_overlapping(db, family_id, now, now + timedelta(days=14))
    next_events = [_event_projection(row, colors, refs) for row in upcoming if row["starts_at"] >= now][:8]
    week = _occurrences_overlapping(db, family_id, week_start, week_start + timedelta(days=7))

    open_tasks = [
        DisplayDashboardTask(
            title=task.title,
            priority=task.priority,
            due_date=task.due_date,
            participant_colors=[colors[task.assigned_to_user_id]] if task.assigned_to_user_id in colors else [],
            member_ref=refs.get(task.assigned_to_user_id) if task.assigned_to_user_id is not None else None,
        )
        for task in (
            db.query(Task)
            .filter(Task.family_id == family_id, Task.status == "open")
            .order_by(Task.due_date.asc().nullslast(), Task.created_at.asc(), Task.id.asc())
            .limit(8)
            .all()
        )
    ]

    return DisplayDashboardResponse(
        family_id=family_id,
        family_name=family.name if family else "",
        device_name=device.name,
        members=members,
        next_events=next_events,
        upcoming_birthdays=_upcoming_birthdays(db, family_id, today),
        open_tasks=open_tasks,
        today_school_timetables=_school_timetables_for(db, family_id, today, membership_by_user_id),
        tomorrow_school_timetables=_school_timetables_for(db, family_id, today + timedelta(days=1), membership_by_user_id),
        generated_at=now,
        time_format="12h" if get_setting(db, "time_format", "24h") == "12h" else "24h",
        today_events=[_event_projection(row, colors, refs) for row in _occurrences_overlapping(db, family_id, today_start, tomorrow_start)],
        tomorrow_events=[
            _event_projection(row, colors, refs)
            for row in _occurrences_overlapping(db, family_id, tomorrow_start, tomorrow_start + timedelta(days=1))
        ],
        week_events=[_event_projection(row, colors, refs) for row in week[:MAX_WEEK_EVENTS]],
        meals=_meals(db, family_id, today),
        shopping=_shopping(db, family_id),
        routines=_routines(db, family_id, today, refs),
        due_tasks=_due_tasks(db, family_id, today, colors, refs),
        rewards=_rewards(db, family_id, memberships, refs),
        countdowns=_countdowns(db, family_id, today),
        weather=_weather(family),
        config=_device_config(device),
    )
