from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.clock import utcnow
from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.core.webhooks import dispatch_webhook_event
from app.database import get_db
from app.core.contact_birthdays import sync_contact_birthday
from app.models import Contact, FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, CRUD_RESPONSES, BirthdayCreate, BirthdayUpdate, BirthdayResponse
from app.core.errors import error_detail, BIRTHDAY_NOT_FOUND, INVALID_MONTH, INVALID_DAY, INVALID_YEAR

router = APIRouter(prefix="/birthdays", tags=["birthdays"], responses={**AUTH_RESPONSES})

# Birthdays belong to contacts: adding one here adds a contact with that
# name and date, and changes go to the contact, so the list below keeps
# following the contacts (see migration 0072).


def _contact_for(db: Session, birthday: FamilyBirthday):
    if birthday.contact_id is None:
        return None
    return db.query(Contact).filter(Contact.id == birthday.contact_id).first()

_MIN_BIRTHDAY_YEAR = 1900


def _validate_year(year):
    if year is None:
        return
    upper = utcnow().year + 1
    if year < _MIN_BIRTHDAY_YEAR or year > upper:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_YEAR))


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
    description="Add a birthday for a person: creates a contact with that name and date, which the birthday list follows. Scope: `birthdays:write`.",
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
    _validate_year(payload.year)

    contact = Contact(
        family_id=payload.family_id,
        full_name=payload.person_name,
        birthday_month=payload.month,
        birthday_day=payload.day,
        birthday_year=payload.year,
    )
    db.add(contact)
    db.flush()
    sync_contact_birthday(db, contact.family_id, contact.id, contact.full_name, payload.month, payload.day, payload.year)
    db.flush()
    birthday = db.query(FamilyBirthday).filter(FamilyBirthday.contact_id == contact.id).one()
    db.commit()
    db.refresh(birthday)
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    dispatch_webhook_event(
        db,
        family_id=birthday.family_id,
        event_type="birthday.created",
        data={"birthday_id": birthday.id, "person_name": birthday.person_name, "month": birthday.month, "day": birthday.day},
    )
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
    # Year is nullable and needs true PATCH semantics: an explicit null
    # in the request should clear it, while an absent key should leave it
    # untouched. model_fields_set distinguishes the two cases.
    if "year" in payload.model_fields_set:
        _validate_year(payload.year)
        birthday.year = payload.year

    contact = _contact_for(db, birthday)
    if contact is not None:
        contact.full_name = birthday.person_name
        contact.birthday_month = birthday.month
        contact.birthday_day = birthday.day
        contact.birthday_year = birthday.year

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
    contact = _contact_for(db, birthday)
    if contact is not None:
        # The person stays a contact; only the birthday goes.
        contact.birthday_month = None
        contact.birthday_day = None
        contact.birthday_year = None
    db.delete(birthday)
    db.commit()
    cache.invalidate_pattern(f"tribu:dashboard:{family_id}:*")
