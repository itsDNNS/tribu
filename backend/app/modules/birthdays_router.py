from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, CRUD_RESPONSES, BirthdayCreate, BirthdayUpdate, BirthdayResponse
from app.core.errors import error_detail, BIRTHDAY_NOT_FOUND, INVALID_MONTH, INVALID_DAY

router = APIRouter(prefix="/birthdays", tags=["birthdays"], responses={**AUTH_RESPONSES})


@router.get(
    "",
    response_model=list[BirthdayResponse],
    summary="List birthdays",
    description="Return all birthday entries for a family sorted by month and day. Scope: `birthdays:read`.",
    response_description="List of birthday entries",
)
def list_birthdays(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("birthdays:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return db.query(FamilyBirthday).filter(FamilyBirthday.family_id == family_id).order_by(FamilyBirthday.month, FamilyBirthday.day).all()


@router.post(
    "",
    response_model=BirthdayResponse,
    summary="Create a birthday",
    description="Add a birthday entry for a person in the family. Scope: `birthdays:write`.",
    response_description="The created birthday entry",
)
def create_birthday(
    payload: BirthdayCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("birthdays:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)

    if payload.month < 1 or payload.month > 12:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_MONTH))
    if payload.day < 1 or payload.day > 31:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_DAY))

    birthday = FamilyBirthday(
        family_id=payload.family_id,
        person_name=payload.person_name,
        month=payload.month,
        day=payload.day,
    )
    db.add(birthday)
    db.commit()
    db.refresh(birthday)
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return birthday


@router.patch(
    "/{birthday_id}",
    response_model=BirthdayResponse,
    responses={**CRUD_RESPONSES},
    summary="Update a birthday",
    description="Partially update a birthday entry. Scope: `birthdays:write`.",
    response_description="The updated birthday entry",
)
def update_birthday(
    birthday_id: int,
    payload: BirthdayUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("birthdays:write"),
):
    birthday = db.query(FamilyBirthday).filter(FamilyBirthday.id == birthday_id).first()
    if not birthday:
        raise HTTPException(status_code=404, detail=error_detail(BIRTHDAY_NOT_FOUND))
    ensure_family_membership(db, user.id, birthday.family_id)

    if payload.person_name is not None:
        birthday.person_name = payload.person_name
    if payload.month is not None:
        if payload.month < 1 or payload.month > 12:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_MONTH))
        birthday.month = payload.month
    if payload.day is not None:
        if payload.day < 1 or payload.day > 31:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_DAY))
        birthday.day = payload.day

    db.commit()
    db.refresh(birthday)
    cache.invalidate_pattern(f"tribu:dashboard:{birthday.family_id}:*")
    return birthday


@router.delete(
    "/{birthday_id}",
    status_code=204,
    responses={**CRUD_RESPONSES},
    summary="Delete a birthday",
    description="Remove a birthday entry. Scope: `birthdays:write`.",
)
def delete_birthday(
    birthday_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("birthdays:write"),
):
    birthday = db.query(FamilyBirthday).filter(FamilyBirthday.id == birthday_id).first()
    if not birthday:
        raise HTTPException(status_code=404, detail=error_detail(BIRTHDAY_NOT_FOUND))
    ensure_family_membership(db, user.id, birthday.family_id)

    family_id = birthday.family_id
    db.delete(birthday)
    db.commit()
    cache.invalidate_pattern(f"tribu:dashboard:{family_id}:*")
