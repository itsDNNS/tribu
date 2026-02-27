import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, current_user_via_token_param, ensure_adult, ensure_family_membership
from app.core.scopes import require_scope
from app.core.vcf_utils import contacts_to_vcf
from app.database import get_db
from app.models import Contact, FamilyBirthday, User
from app.schemas import AUTH_RESPONSES, CRUD_RESPONSES, ErrorResponse, ContactCreate, ContactResponse, ContactUpdate, ContactsCsvImport
from app.core.errors import error_detail, CONTACT_NOT_FOUND, CSV_MISSING_COLUMN

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


@router.patch(
    "/{contact_id}",
    response_model=ContactResponse,
    responses={**CRUD_RESPONSES},
    summary="Update a contact",
    description="Partially update a contact. Auto-updates or removes the birthday entry. Adult only. Scope: `contacts:write`.",
    response_description="The updated contact",
)
def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail=error_detail(CONTACT_NOT_FOUND))
    ensure_adult(db, user.id, contact.family_id)

    old_name = contact.full_name
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)

    new_name = contact.full_name
    new_month = contact.birthday_month
    new_day = contact.birthday_day

    # If the name changed, update the linked birthday entry
    if old_name != new_name:
        existing_bday = db.query(FamilyBirthday).filter(
            FamilyBirthday.family_id == contact.family_id,
            FamilyBirthday.person_name == old_name,
        ).first()
        if existing_bday:
            existing_bday.person_name = new_name

    # Upsert or remove birthday
    if new_month and new_day:
        upsert_birthday(db, contact.family_id, new_name, new_month, new_day)
    else:
        # Remove birthday entry if birthday fields were cleared
        db.query(FamilyBirthday).filter(
            FamilyBirthday.family_id == contact.family_id,
            FamilyBirthday.person_name == new_name,
        ).delete()

    db.commit()
    db.refresh(contact)
    cache.invalidate_pattern(f"tribu:dashboard:{contact.family_id}:*")
    return contact


@router.delete(
    "/{contact_id}",
    responses={**CRUD_RESPONSES},
    summary="Delete a contact",
    description="Delete a contact and its associated birthday entry. Adult only. Scope: `contacts:write`.",
    response_description="Deletion confirmed",
)
def delete_contact(
    contact_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail=error_detail(CONTACT_NOT_FOUND))
    ensure_adult(db, user.id, contact.family_id)

    # Remove associated birthday entry
    db.query(FamilyBirthday).filter(
        FamilyBirthday.family_id == contact.family_id,
        FamilyBirthday.person_name == contact.full_name,
    ).delete()

    db.delete(contact)
    db.commit()
    cache.invalidate_pattern(f"tribu:dashboard:{contact.family_id}:*")
    return {"status": "ok"}


@router.get(
    "/feed.vcf",
    summary="Contacts subscription feed",
    description="VCF feed URL for contacts app subscriptions. Supports `?token=` query parameter for authentication. Scope: `contacts:read`.",
    response_description="VCF contacts feed",
)
def contacts_feed_vcf(
    family_id: int,
    user: User = Depends(current_user_via_token_param),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:read"),
):
    ensure_family_membership(db, user.id, family_id)
    contacts = db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.full_name.asc()).all()
    vcf_text = contacts_to_vcf(contacts)
    return Response(
        content=vcf_text,
        media_type="text/vcard",
        headers={"Content-Disposition": "inline; filename=tribu-contacts.vcf"},
    )


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
        raise HTTPException(status_code=400, detail=error_detail(CSV_MISSING_COLUMN))

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
