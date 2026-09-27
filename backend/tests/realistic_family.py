"""A family whose data looks like a real one after a few years of use.

Small fixtures hid two crashes that real data hit on day one: a cross join
over school timetables with phone-sized avatars (#491) and 29 February
birthdays (#490). Budget tests seed this family instead (issue #495).
"""

from __future__ import annotations

import base64
import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import lru_cache

from PIL import Image, ImageDraw

from app.core.avatars import set_profile_image
from app.core.clock import local_today, utcnow
from app.models import (
    CalendarEvent, Family, FamilyBirthday, MealPlan, Membership, PersonalAccessToken, Reward, RewardCurrency,
    SchoolTimetable, SchoolTimetableAssignment, SchoolTimetableLesson, SchoolTimetablePeriod, ShoppingItem,
    ShoppingList, Task, TokenTransaction, User,
)
from app.security import PAT_PREFIX, hash_password

MEMBERS = [
    ("Anna", True, "#7c3aed"),
    ("Ben", True, "#06b6d4"),
    ("Clara", False, "#f43f5e"),
    ("David", False, "#f59e0b"),
    ("Grandma Ilse", True, None),
]
CHILDREN = ("Clara", "David")


@dataclass
class RealisticFamily:
    family_id: int
    admin_token: str
    child_ids: list[int]


@lru_cache(maxsize=1)
def phone_photo_data_url() -> str:
    """A 2600 px JPEG of about 1.6 MB with photo-like gradients, shapes and grain."""
    size = 2600
    shade = Image.radial_gradient("L").resize((size, size))
    image = Image.merge("RGB", (shade, Image.linear_gradient("L").resize((size, size)).rotate(30), shade.rotate(90)))
    image = Image.blend(image, Image.effect_noise((size, size), 28).convert("RGB"), 0.18)
    draw = ImageDraw.Draw(image)
    for index in range(40):
        draw.ellipse([index * 60, index * 50, index * 60 + 400, index * 50 + 300], outline=(255 - index * 5, index * 6, 120), width=12)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def seed_realistic_family(db, suffix: str = "real") -> RealisticFamily:
    today = local_today()
    family = Family(name=f"Family {suffix}")
    db.add(family)
    db.flush()

    ids: dict[str, int] = {}
    admin_token = ""
    photo = phone_photo_data_url()
    for index, (name, adult, color) in enumerate(MEMBERS):
        user = User(email=f"{name.lower().replace(' ', '.')}.{suffix}@example.com", password_hash=hash_password("pw"), display_name=name)
        set_profile_image(user, photo)
        db.add(user)
        db.flush()
        ids[name] = user.id
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin" if index == 0 else "member", is_adult=adult, color=color))
        if index == 0:
            admin_token = f"{PAT_PREFIX}budget-{suffix}"
            lookup = hashlib.sha256(admin_token.encode()).hexdigest()
            db.add(PersonalAccessToken(user_id=user.id, name="budget", token_hash=lookup, token_lookup=lookup, scopes="*"))
    admin_id = ids["Anna"]
    children = [ids[name] for name in CHILDREN]

    # School timetables: 8 periods (one break), lessons Monday to Friday, both children.
    timetable = SchoolTimetable(family_id=family.id, name="Class 4b", class_label="4b", include_saturday=False, created_by_user_id=admin_id)
    db.add(timetable)
    db.flush()
    periods = []
    for position in range(8):
        start = time(8 + position, 0)
        period = SchoolTimetablePeriod(
            timetable_id=timetable.id, position=position + 1, label=f"{position + 1}.", start_time=start,
            end_time=time(8 + position, 45), kind="break" if position == 3 else "lesson",
            break_label="Break" if position == 3 else None,
        )
        db.add(period)
        periods.append(period)
    db.flush()
    subjects = ["Maths", "German", "English", "Science", "Art", "Music", "Sport"]
    lesson_periods = [period for period in periods if period.kind == "lesson"]
    for weekday in range(1, 6):
        for slot, period in enumerate(lesson_periods[:6]):
            db.add(SchoolTimetableLesson(timetable_id=timetable.id, weekday=weekday, period_id=period.id,
                                         subject=subjects[(weekday + slot) % len(subjects)], room=f"R{slot}", teacher="Ms Ada"))
    for child in children:
        db.add(SchoolTimetableAssignment(timetable_id=timetable.id, member_user_id=child))

    # Several years of recurring events plus one-off and imported ones.
    start = today - timedelta(days=3 * 365)
    for index, (title, recurrence) in enumerate([
        ("School run", "daily"), ("Swimming", "weekly"), ("Piano", "weekly"), ("Football", "biweekly"),
        ("Book club", "monthly"), ("Anniversary", "yearly"),
    ]):
        db.add(CalendarEvent(
            family_id=family.id, title=title, starts_at=_at(start + timedelta(days=index), 7 + index),
            ends_at=_at(start + timedelta(days=index), 8 + index), recurrence=recurrence,
            excluded_dates=[(today - timedelta(days=7 * k)).isoformat() for k in range(1, 20)],
            assigned_to=[children[index % 2]] if index % 3 else "all", created_by_user_id=admin_id,
        ))
    for offset in range(-60, 90):
        day = today + timedelta(days=offset)
        db.add(CalendarEvent(family_id=family.id, title=f"Appointment {offset}", starts_at=_at(day, 9 + offset % 8),
                             ends_at=_at(day, 10 + offset % 8), location="Town hall", assigned_to=[admin_id], created_by_user_id=admin_id))
        if offset % 5 == 0:
            db.add(CalendarEvent(family_id=family.id, title=f"School calendar {offset}", starts_at=_at(day, 0), all_day=True,
                                 source_type="subscription", source_name="School", source_url="https://school.example/feed.ics"))
    db.add(CalendarEvent(family_id=family.id, title="Summer holidays", starts_at=_at(today + timedelta(days=20), 0),
                         ends_at=_at(today + timedelta(days=62), 0), all_day=True, created_by_user_id=admin_id))

    # Birthdays, including one on 29 February.
    for month, day, name in [(2, 29, "Leap cousin"), (1, 1, "New year"), (12, 31, "Silvester"),
                             (today.month, today.day, "Today"), ((today + timedelta(days=3)).month, (today + timedelta(days=3)).day, "Soon")]:
        db.add(FamilyBirthday(family_id=family.id, person_name=name, month=month, day=day))

    # Tasks, routines, meals, shopping and rewards.
    now = utcnow()
    for index in range(40):
        db.add(Task(family_id=family.id, title=f"Task {index}", due_date=_at(today + timedelta(days=index % 10 - 3), 9),
                    assigned_to_user_id=children[index % 2] if index % 2 else admin_id, created_by_user_id=admin_id))
    for index in range(10):
        db.add(Task(family_id=family.id, title=f"Routine {index}", recurrence="daily", due_date=_at(today, 7),
                    status="done" if index % 2 else "open", completed_at=now if index % 2 else None,
                    assigned_to_user_id=children[index % 2], created_by_user_id=admin_id))
    for offset in range(-7, 14):
        for slot in ("morning", "noon", "evening"):
            db.add(MealPlan(family_id=family.id, plan_date=today + timedelta(days=offset), slot=slot, meal_name=f"Meal {offset} {slot}"))
    for list_index in range(4):
        shopping = ShoppingList(family_id=family.id, name=f"List {list_index}")
        db.add(shopping)
        db.flush()
        for item in range(60):
            db.add(ShoppingItem(list_id=shopping.id, name=f"Item {item}", position=item, checked=item % 3 == 0, archived=item % 7 == 0))
    currency = RewardCurrency(family_id=family.id, name="Stars", icon="star")
    db.add(currency)
    db.flush()
    for cost in (5, 10, 25, 50, 100):
        db.add(Reward(family_id=family.id, currency_id=currency.id, name=f"Reward {cost}", cost=cost))
    for child in children:
        for amount in range(30):
            db.add(TokenTransaction(family_id=family.id, currency_id=currency.id, user_id=child, kind="earn", amount=1 + amount % 3))

    db.commit()
    return RealisticFamily(family_id=family.id, admin_token=admin_token, child_ids=children)
