import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Contact, FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, ErrorResponse, ContactCreate, ContactResponse, ContactsCsvImport

router = APIRouter(prefix="/contacts", tags=["contacts"], responses={**AUTH_RESPONSES})


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


@router.get(
    "",
    response_model=list[ContactResponse],
    summary="List contacts",
    description="Return all contacts for a family sorted by name. Scope: `contacts:read`.",
    response_description="List of contacts",
)
def list_contacts(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.full_name.asc()).all()


@router.post(
    "",
    response_model=ContactResponse,
    summary="Create a contact",
    description="Create a new contact. Auto-creates a birthday entry if birthday fields are provided. Adult only. Scope: `contacts:write`.",
    response_description="The created contact",
)
def create_contact(
    payload: ContactCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_adult(db, user.id, payload.family_id)

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
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return contact


@router.get(
    "/export.csv",
    summary="Export contacts as CSV",
    description="Download all family contacts as a CSV file. Adult only. Scope: `contacts:read`.",
    response_description="CSV file download",
)
def export_contacts_csv(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:read"),
):
    ensure_adult(db, user.id, family_id)
    contacts = db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.full_name.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["full_name", "email", "phone", "birthday_month", "birthday_day"])
    for c in contacts:
        writer.writerow([c.full_name, c.email or "", c.phone or "", c.birthday_month or "", c.birthday_day or ""])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tribu-contacts.csv"},
    )


@router.post(
    "/import-csv",
    summary="Import contacts from CSV",
    description="Parse CSV text and create contacts (max 500 rows). Auto-creates birthday entries. Adult only. Scope: `contacts:write`.",
    response_description="Import result with created/skipped counts and row errors",
)
def import_contacts_csv(
    payload: ContactsCsvImport,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_adult(db, user.id, payload.family_id)

    reader = csv.DictReader(io.StringIO(payload.csv_text))
    required = {"full_name"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail="CSV braucht mindestens die Spalte full_name")

    MAX_ROWS = 500
    created = 0
    skipped = 0
    row_errors = []
    row_num = 1
    for row in reader:
        row_num += 1
        if created + skipped >= MAX_ROWS:
            break
        name = (row.get("full_name") or "").strip()
        errors_for_row = []

        if not name:
            skipped += 1
            row_errors.append({"row": row_num, "name": name or "(empty)", "errors": ["Missing full_name"]})
            continue

        try:
            month = int(row["birthday_month"]) if row.get("birthday_month") else None
        except (ValueError, TypeError):
            month = None
            errors_for_row.append(f"Invalid birthday_month: {row.get('birthday_month')}")
        try:
            day = int(row["birthday_day"]) if row.get("birthday_day") else None
        except (ValueError, TypeError):
            day = None
            errors_for_row.append(f"Invalid birthday_day: {row.get('birthday_day')}")

        if month is not None and not (1 <= month <= 12):
            errors_for_row.append(f"birthday_month out of range: {month}")
            month = None
        if day is not None and not (1 <= day <= 31):
            errors_for_row.append(f"birthday_day out of range: {day}")
            day = None

        email_raw = (row.get("email") or "").strip()
        if email_raw and "@" not in email_raw:
            errors_for_row.append(f"Invalid email: {email_raw}")
        email = email_raw if "@" in email_raw else None

        if errors_for_row:
            row_errors.append({"row": row_num, "name": name, "errors": errors_for_row})

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
    if created:
        cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return {"status": "ok", "created": created, "skipped": skipped, "row_errors": row_errors}
