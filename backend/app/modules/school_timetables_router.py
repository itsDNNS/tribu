"""School timetable module.

Family-bound weekly school timetables for children. The time grid is
stored as user-configured periods/breaks, and children are assigned to a
timetable so twins/multiples can share one class plan without duplicate
lesson rows.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import (
    Membership,
    SchoolTimetable,
    SchoolTimetableAssignment,
    SchoolTimetableLesson,
    SchoolTimetablePeriod,
    User,
)
from app.schemas import (
    AUTH_RESPONSES,
    SchoolTimetableCreate,
    SchoolTimetableLessonCreate,
    SchoolTimetableLessonResponse,
    SchoolTimetableMemberResponse,
    SchoolTimetablePeriodCreate,
    SchoolTimetablePeriodResponse,
    SchoolTimetableResponse,
    SchoolTimetableUpdate,
    sanitize_profile_image_data_url,
)

router = APIRouter(prefix="/school-timetables", tags=["school_timetables"], responses={**AUTH_RESPONSES})

VALID_KINDS = {"lesson", "break"}


def _adult_membership(db: Session, user: User, family_id: int) -> Membership:
    membership = ensure_family_membership(db, user.id, family_id)
    if not membership.is_adult:
        raise HTTPException(status_code=403, detail="Adult family member required")
    return membership


def _load_for_caller(db: Session, user: User, timetable_id: int) -> SchoolTimetable:
    timetable = (
        db.query(SchoolTimetable)
        .options(
            joinedload(SchoolTimetable.periods),
            joinedload(SchoolTimetable.lessons).joinedload(SchoolTimetableLesson.period),
            joinedload(SchoolTimetable.assignments).joinedload(SchoolTimetableAssignment.member),
        )
        .filter(SchoolTimetable.id == timetable_id)
        .first()
    )
    if timetable is None:
        raise HTTPException(status_code=404, detail="School timetable not found")
    membership = db.query(Membership.id).filter(
        Membership.user_id == user.id,
        Membership.family_id == timetable.family_id,
    ).first()
    if membership is None:
        raise HTTPException(status_code=404, detail="School timetable not found")
    return timetable


def _validate_periods(periods: list[SchoolTimetablePeriodCreate]) -> None:
    if not periods:
        raise HTTPException(status_code=400, detail="At least one school period is required")
    seen: set[int] = set()
    previous_end = None
    for period in sorted(periods, key=lambda p: p.position):
        if period.position in seen:
            raise HTTPException(status_code=400, detail="Duplicate period position")
        seen.add(period.position)
        if period.kind not in VALID_KINDS:
            raise HTTPException(status_code=400, detail="Period kind must be lesson or break")
        if period.start_time >= period.end_time:
            raise HTTPException(status_code=400, detail="Period start_time must be before end_time")
        if previous_end and period.start_time < previous_end:
            raise HTTPException(status_code=400, detail="Periods must not overlap")
        previous_end = period.end_time


def _validate_lessons(
    lessons: list[SchoolTimetableLessonCreate],
    periods: list[SchoolTimetablePeriodCreate],
    include_saturday: bool,
) -> None:
    period_positions = {p.position for p in periods}
    lesson_positions = {p.position for p in periods if p.kind == "lesson"}
    seen: set[tuple[int, int]] = set()
    for lesson in lessons:
        if lesson.weekday == 6 and not include_saturday:
            raise HTTPException(status_code=400, detail="Saturday lessons require include_saturday")
        if lesson.period_position not in period_positions:
            raise HTTPException(status_code=400, detail="Lesson references an unknown period")
        if lesson.period_position not in lesson_positions:
            raise HTTPException(status_code=400, detail="Lessons cannot be assigned to break periods")
        key = (lesson.weekday, lesson.period_position)
        if key in seen:
            raise HTTPException(status_code=400, detail="Duplicate lesson for weekday and period")
        seen.add(key)


def _validate_assignments(db: Session, family_id: int, member_user_ids: list[int]) -> list[int]:
    unique_ids = list(dict.fromkeys(int(uid) for uid in member_user_ids))
    if not unique_ids:
        return []
    rows = db.query(Membership.user_id).filter(
        Membership.family_id == family_id,
        Membership.user_id.in_(unique_ids),
        Membership.is_adult.is_(False),
    ).all()
    found = {row.user_id for row in rows}
    missing = [uid for uid in unique_ids if uid not in found]
    if missing:
        raise HTTPException(status_code=400, detail="Assigned members must be child family members")
    return unique_ids


def _member_response(member: User, membership_by_user_id: dict[int, Membership]) -> SchoolTimetableMemberResponse:
    membership = membership_by_user_id.get(member.id)
    return SchoolTimetableMemberResponse(
        display_name=member.display_name,
        color=membership.color if membership else None,
        profile_image=sanitize_profile_image_data_url(member.profile_image),
    )


def _serialize(db: Session, timetable: SchoolTimetable) -> SchoolTimetableResponse:
    memberships = db.query(Membership).filter(Membership.family_id == timetable.family_id).all()
    membership_by_user_id = {m.user_id: m for m in memberships}
    period_by_id = {p.id: p for p in timetable.periods}
    assigned_members = [
        _member_response(assignment.member, membership_by_user_id)
        for assignment in timetable.assignments
        if assignment.member is not None
    ]
    return SchoolTimetableResponse(
        id=timetable.id,
        family_id=timetable.family_id,
        name=timetable.name,
        class_label=timetable.class_label,
        include_saturday=timetable.include_saturday,
        notes=timetable.notes,
        assigned_member_user_ids=[a.member_user_id for a in timetable.assignments],
        assigned_members=assigned_members,
        periods=[
            SchoolTimetablePeriodResponse(
                id=p.id,
                position=p.position,
                label=p.label,
                start_time=p.start_time,
                end_time=p.end_time,
                kind=p.kind,
                break_label=p.break_label,
            )
            for p in sorted(timetable.periods, key=lambda p: p.position)
        ],
        lessons=[
            SchoolTimetableLessonResponse(
                id=lesson.id,
                period_id=lesson.period_id,
                weekday=lesson.weekday,
                period_position=period_by_id[lesson.period_id].position,
                subject=lesson.subject,
                room=lesson.room,
                teacher=lesson.teacher,
                color=lesson.color,
            )
            for lesson in sorted(timetable.lessons, key=lambda l: (l.weekday, period_by_id[l.period_id].position))
        ],
        created_by_user_id=timetable.created_by_user_id,
        created_at=timetable.created_at,
        updated_at=timetable.updated_at,
    )


def _replace_nested(
    db: Session,
    timetable: SchoolTimetable,
    periods: list[SchoolTimetablePeriodCreate],
    lessons: list[SchoolTimetableLessonCreate],
    assigned_member_user_ids: list[int],
) -> None:
    _validate_periods(periods)
    _validate_lessons(lessons, periods, timetable.include_saturday)
    member_ids = _validate_assignments(db, timetable.family_id, assigned_member_user_ids)
    timetable.updated_at = utcnow()

    timetable.periods.clear()
    timetable.lessons.clear()
    timetable.assignments.clear()
    db.flush()

    period_rows: dict[int, SchoolTimetablePeriod] = {}
    for period in sorted(periods, key=lambda p: p.position):
        row = SchoolTimetablePeriod(
            timetable=timetable,
            position=period.position,
            label=period.label.strip(),
            start_time=period.start_time,
            end_time=period.end_time,
            kind=period.kind,
            break_label=period.break_label.strip() if period.break_label else None,
        )
        timetable.periods.append(row)
        period_rows[period.position] = row
    db.flush()

    for lesson in lessons:
        timetable.lessons.append(SchoolTimetableLesson(
            timetable=timetable,
            weekday=lesson.weekday,
            period=period_rows[lesson.period_position],
            subject=lesson.subject.strip(),
            room=lesson.room.strip() if lesson.room else None,
            teacher=lesson.teacher.strip() if lesson.teacher else None,
            color=lesson.color.strip() if lesson.color else None,
        ))

    for member_id in member_ids:
        timetable.assignments.append(SchoolTimetableAssignment(member_user_id=member_id))


@router.get("", response_model=list[SchoolTimetableResponse], summary="List family school timetables")
def list_school_timetables(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("school_timetables:read"),
):
    ensure_family_membership(db, user.id, family_id)
    rows = (
        db.query(SchoolTimetable)
        .options(
            joinedload(SchoolTimetable.periods),
            joinedload(SchoolTimetable.lessons),
            joinedload(SchoolTimetable.assignments).joinedload(SchoolTimetableAssignment.member),
        )
        .filter(SchoolTimetable.family_id == family_id)
        .order_by(SchoolTimetable.name.asc())
        .all()
    )
    return [_serialize(db, row) for row in rows]


@router.post("", response_model=SchoolTimetableResponse, summary="Create a school timetable")
def create_school_timetable(
    payload: SchoolTimetableCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("school_timetables:write"),
):
    _adult_membership(db, user, payload.family_id)
    timetable = SchoolTimetable(
        family_id=payload.family_id,
        name=payload.name.strip(),
        class_label=payload.class_label.strip() if payload.class_label else None,
        include_saturday=payload.include_saturday,
        notes=payload.notes,
        created_by_user_id=user.id,
    )
    db.add(timetable)
    db.flush()
    _replace_nested(db, timetable, payload.periods, payload.lessons, payload.assigned_member_user_ids)
    db.commit()
    db.refresh(timetable)
    return _serialize(db, _load_for_caller(db, user, timetable.id))


@router.patch("/{timetable_id}", response_model=SchoolTimetableResponse, summary="Update a school timetable")
def update_school_timetable(
    timetable_id: int,
    payload: SchoolTimetableUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("school_timetables:write"),
):
    timetable = _load_for_caller(db, user, timetable_id)
    _adult_membership(db, user, timetable.family_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        timetable.name = data["name"].strip()
    if "class_label" in data:
        timetable.class_label = data["class_label"].strip() if data["class_label"] else None
    if "include_saturday" in data and data["include_saturday"] is not None:
        timetable.include_saturday = data["include_saturday"]
    if "notes" in data:
        timetable.notes = data["notes"]
    if any(key in data for key in ("periods", "lessons", "assigned_member_user_ids")):
        periods = payload.periods if payload.periods is not None else [
            SchoolTimetablePeriodCreate(
                position=p.position,
                label=p.label,
                start_time=p.start_time,
                end_time=p.end_time,
                kind=p.kind,
                break_label=p.break_label,
            )
            for p in timetable.periods
        ]
        period_by_id = {p.id: p for p in timetable.periods}
        lessons = payload.lessons if payload.lessons is not None else [
            SchoolTimetableLessonCreate(
                weekday=l.weekday,
                period_position=period_by_id[l.period_id].position,
                subject=l.subject,
                room=l.room,
                teacher=l.teacher,
                color=l.color,
            )
            for l in timetable.lessons
        ]
        assigned = payload.assigned_member_user_ids if payload.assigned_member_user_ids is not None else [
            a.member_user_id for a in timetable.assignments
        ]
        _replace_nested(db, timetable, periods, lessons, assigned)
    db.commit()
    return _serialize(db, _load_for_caller(db, user, timetable.id))


@router.delete("/{timetable_id}", summary="Delete a school timetable")
def delete_school_timetable(
    timetable_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("school_timetables:write"),
):
    timetable = _load_for_caller(db, user, timetable_id)
    _adult_membership(db, user, timetable.family_id)
    db.delete(timetable)
    db.commit()
    return {"school_timetable_id": timetable_id, "deleted": True}
