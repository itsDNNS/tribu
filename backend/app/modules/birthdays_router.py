from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, ErrorResponse, BirthdayCreate, BirthdayResponse

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
        raise HTTPException(status_code=400, detail="Monat muss zwischen 1 und 12 liegen")
    if payload.day < 1 or payload.day > 31:
        raise HTTPException(status_code=400, detail="Tag muss zwischen 1 und 31 liegen")

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
