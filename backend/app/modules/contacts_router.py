import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Contact, FamilyBirthday, User
from app.schemas import ContactCreate, ContactResponse, ContactsCsvImport

router = APIRouter(prefix="/contacts", tags=["contacts"])


def upsert_birthday(db: Session, family_id: int, full_name: str, month: int | None, day: int | None):
    if not month or not day:
        return
    existing = db.query(FamilyBirthday).filter(
        FamilyBirthday.family_id == family_id,
        FamilyBirthday.person_name == full_name,
    ).first()
    if existing:
        existing.month = month
        existing.day = day
        return

    db.add(FamilyBirthday(family_id=family_id, person_name=full_name, month=month, day=day))


@router.get("", response_model=list[ContactResponse])
def list_contacts(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.full_name.asc()).all()


@router.post("", response_model=ContactResponse)
def create_contact(
    payload: ContactCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)

    contact = Contact(
        family_id=payload.family_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        birthday_month=payload.birthday_month,
        birthday_day=payload.birthday_day,
    )
    db.add(contact)
    upsert_birthday(db, payload.family_id, payload.full_name, payload.birthday_month, payload.birthday_day)
    db.commit()
    db.refresh(contact)
    return contact


@router.post("/import-csv")
def import_contacts_csv(
    payload: ContactsCsvImport,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)

    reader = csv.DictReader(io.StringIO(payload.csv_text))
    required = {"full_name"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail="CSV braucht mindestens die Spalte full_name")

    MAX_ROWS = 500
    created = 0
    skipped = 0
    for row in reader:
        if created + skipped >= MAX_ROWS:
            break
        name = (row.get("full_name") or "").strip()
        if not name:
            skipped += 1
            continue

        try:
            month = int(row["birthday_month"]) if row.get("birthday_month") else None
        except (ValueError, TypeError):
            month = None
        try:
            day = int(row["birthday_day"]) if row.get("birthday_day") else None
        except (ValueError, TypeError):
            day = None

        if month is not None and not (1 <= month <= 12):
            month = None
        if day is not None and not (1 <= day <= 31):
            day = None

        email_raw = (row.get("email") or "").strip()
        email = email_raw if "@" in email_raw else None

        contact = Contact(
            family_id=payload.family_id,
            full_name=name,
            email=email,
            phone=(row.get("phone") or "").strip() or None,
            birthday_month=month,
            birthday_day=day,
        )
        db.add(contact)
        upsert_birthday(db, payload.family_id, name, month, day)
        created += 1

    db.commit()
    return {"status": "ok", "created": created, "skipped": skipped}
