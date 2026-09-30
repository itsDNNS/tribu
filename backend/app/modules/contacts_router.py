import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core import cache
from app.core.contact_birthdays import (
    delete_synced_birthday_for_contact, sync_contact_birthday, sync_member_birthday, valid_birth_year,
)
from app.core.contact_duplicates import fill_missing, find_duplicate_groups, find_match, find_member_matches, merge_contacts
from app.core.deps import current_user, current_user_via_token_param, ensure_adult, ensure_family_membership
from app.core.scopes import require_scope
from app.core.vcard_utils import contact_channel_values, contact_extras
from app.core.vcf_utils import contacts_to_vcf
from app.database import get_db
from app.models import Contact, ContactDuplicateDismissal, ContactMemberDismissal, Membership, User
from app.schemas import (
    AUTH_RESPONSES,
    CRUD_RESPONSES,
    ContactCreate,
    ContactDuplicateDismiss,
    ContactDuplicateGroup,
    ContactMemberLink,
    ContactMerge,
    ContactResponse,
    ContactUpdate,
    ContactsCsvImport,
)
from app.core.errors import error_detail, CONTACT_NOT_FOUND, CSV_MISSING_COLUMN, INVALID_YEAR, MEMBER_NOT_FOUND

router = APIRouter(prefix="/contacts", tags=["contacts"], responses={**AUTH_RESPONSES})

def _check_year(year) -> None:
    if not valid_birth_year(year):
        raise HTTPException(status_code=400, detail=error_detail(INVALID_YEAR))


def _sync_birthday(db: Session, contact: Contact) -> None:
    sync_contact_birthday(
        db,
        contact.family_id,
        contact.id,
        contact.full_name,
        contact.birthday_month,
        contact.birthday_day,
        contact.birthday_year,
    )


def serialize_contact(contact: Contact) -> ContactResponse:
    email_values, phone_values = contact_channel_values(contact)
    extras = contact_extras(contact)
    return ContactResponse(
        id=contact.id,
        family_id=contact.family_id,
        full_name=contact.full_name,
        email=contact.email,
        phone=contact.phone,
        email_values=email_values,
        phone_values=phone_values,
        birthday_month=contact.birthday_month,
        birthday_day=contact.birthday_day,
        birthday_year=contact.birthday_year,
        organization=extras["organization"],
        addresses=extras["addresses"],
        note=extras["note"],
        synced=bool(contact.dav_href),
        member_user_id=contact.member_user_id,
    )


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
    contacts = db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.full_name.asc()).all()
    return [serialize_contact(contact) for contact in contacts]


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
    _check_year(payload.birthday_year)

    contact = Contact(
        family_id=payload.family_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        birthday_month=payload.birthday_month,
        birthday_day=payload.birthday_day,
        birthday_year=payload.birthday_year if payload.birthday_month and payload.birthday_day else None,
    )
    db.add(contact)
    # Flush so the synced birthday row can reference contact.id.
    db.flush()
    _sync_birthday(db, contact)
    db.commit()
    db.refresh(contact)
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return serialize_contact(contact)


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

    update_data = payload.model_dump(exclude_unset=True)
    _check_year(update_data.get("birthday_year"))
    for key, value in update_data.items():
        setattr(contact, key, value)
    if not (contact.birthday_month and contact.birthday_day):
        contact.birthday_year = None

    _sync_birthday(db, contact)

    db.commit()
    db.refresh(contact)
    cache.invalidate_pattern(f"tribu:dashboard:{contact.family_id}:*")
    return serialize_contact(contact)


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

    delete_synced_birthday_for_contact(db, contact.family_id, contact.id)

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
    writer.writerow(["full_name", "email", "phone", "birthday_month", "birthday_day", "birthday_year"])
    for c in contacts:
        writer.writerow([c.full_name, c.email or "", c.phone or "", c.birthday_month or "", c.birthday_day or "", c.birthday_year or ""])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tribu-contacts.csv"},
    )


@router.post(
    "/import-csv",
    summary="Import contacts from CSV",
    description="Parse CSV text and create contacts (max 500 rows). A row for a person already in Tribu (same email or phone, or same name) completes that contact instead of adding a second one. Auto-creates birthday entries. Adult only. Scope: `contacts:write`.",
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
    merged = 0
    skipped = 0
    row_errors = []
    row_num = 1
    for row in reader:
        row_num += 1
        if created + merged + skipped >= MAX_ROWS:
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

        try:
            year = int(row["birthday_year"]) if row.get("birthday_year") else None
        except (ValueError, TypeError):
            year = None
            errors_for_row.append(f"Invalid birthday_year: {row.get('birthday_year')}")
        if year is not None and not (valid_birth_year(year) and month and day):
            errors_for_row.append(f"birthday_year out of range: {year}")
            year = None

        if errors_for_row:
            row_errors.append({"row": row_num, "name": name, "errors": errors_for_row})

        phone = (row.get("phone") or "").strip() or None
        # The same person already in Tribu (same email or phone, or the
        # same name without a different one) is completed, not doubled.
        existing = find_match(db, payload.family_id, full_name=name, email=email, phone=phone)
        if existing is not None:
            if fill_missing(existing, email=email, phone=phone, month=month, day=day, year=year):
                _sync_birthday(db, existing)
            merged += 1
            continue

        contact = Contact(
            family_id=payload.family_id,
            full_name=name,
            email=email,
            phone=phone,
            birthday_month=month,
            birthday_day=day,
            birthday_year=year,
        )
        db.add(contact)
        db.flush()
        _sync_birthday(db, contact)
        created += 1

    db.commit()
    if created or merged:
        cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return {"status": "ok", "created": created, "merged": merged, "skipped": skipped, "row_errors": row_errors}


def _family_contacts(db: Session, family_id: int, ids) -> list[Contact]:
    wanted = set(ids)
    rows = db.query(Contact).filter(Contact.family_id == family_id, Contact.id.in_(wanted)).all()
    if len(rows) != len(wanted):
        raise HTTPException(status_code=404, detail=error_detail(CONTACT_NOT_FOUND))
    return rows


@router.get(
    "/duplicates",
    response_model=list[ContactDuplicateGroup],
    summary="Possible duplicate contacts",
    description="Groups of contacts that look like the same person: a shared email address or phone number, or the same name. Also contacts that look like a family member (`member_user_id`): a shared email address, the whole name, or the first name and the birthday. Pairs marked as different people are left out. Scope: `contacts:read`.",
    response_description="Groups of contact IDs with what they share",
)
def list_duplicates(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return find_duplicate_groups(db, family_id) + find_member_matches(db, family_id)


@router.post(
    "/merge",
    response_model=ContactResponse,
    responses={**CRUD_RESPONSES},
    summary="Merge contacts",
    description="Fold contacts into one: the kept contact gets the others' email addresses, phone numbers, addresses, notes and birthday where it lacks them, and the others are deleted. Phones pick up both changes on their next sync. Adult only. Scope: `contacts:write`.",
    response_description="The merged contact",
)
def merge(
    payload: ContactMerge,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    others = [cid for cid in dict.fromkeys(payload.merge_ids) if cid != payload.keep_id]
    rows = {c.id: c for c in _family_contacts(db, payload.family_id, [payload.keep_id, *others])}
    keep = merge_contacts(db, rows[payload.keep_id], [rows[cid] for cid in others])
    db.commit()
    db.refresh(keep)
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return serialize_contact(keep)


@router.post(
    "/duplicates/dismiss",
    responses={**CRUD_RESPONSES},
    summary="Mark contacts as different people",
    description="Stop suggesting these contacts as duplicates of each other. Adult only. Scope: `contacts:write`.",
    response_description="Confirmation",
)
def dismiss_duplicates(
    payload: ContactDuplicateDismiss,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    ids = sorted(set(payload.contact_ids))
    _family_contacts(db, payload.family_id, ids)
    if payload.member_user_id is not None:
        _family_member(db, payload.family_id, payload.member_user_id)
        known = {
            row.contact_id
            for row in db.query(ContactMemberDismissal).filter(
                ContactMemberDismissal.member_user_id == payload.member_user_id,
                ContactMemberDismissal.contact_id.in_(ids),
            )
        }
        for contact_id in ids:
            if contact_id not in known:
                db.add(ContactMemberDismissal(
                    family_id=payload.family_id, contact_id=contact_id, member_user_id=payload.member_user_id,
                ))
        db.commit()
        return {"status": "ok"}
    existing = {
        (row.first_contact_id, row.second_contact_id)
        for row in db.query(ContactDuplicateDismissal).filter(ContactDuplicateDismissal.family_id == payload.family_id)
    }
    for index, first in enumerate(ids):
        for second in ids[index + 1:]:
            if (first, second) not in existing:
                db.add(ContactDuplicateDismissal(family_id=payload.family_id, first_contact_id=first, second_contact_id=second))
    db.commit()
    return {"status": "ok"}


def _family_member(db: Session, family_id: int, user_id: int) -> Membership:
    membership = db.query(Membership).filter(
        Membership.family_id == family_id, Membership.user_id == user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))
    return membership


@router.post(
    "/{contact_id}/member",
    response_model=ContactResponse,
    responses={**CRUD_RESPONSES},
    summary="Link a contact to a family member",
    description="Say which family member a contact is (the phone's \"Hannelore Müller\" for member \"Hannelore\"), or null to unlink. The member's birthday then stands for both; a member without one takes the contact's when it has a year. Adult only. Scope: `contacts:write`.",
    response_description="The contact",
)
def link_member(
    contact_id: int,
    payload: ContactMemberLink,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("contacts:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    contact = _family_contacts(db, payload.family_id, [contact_id])[0]
    if payload.member_user_id is not None:
        membership = _family_member(db, payload.family_id, payload.member_user_id)
        if (
            membership.date_of_birth is None
            and contact.birthday_month and contact.birthday_day and contact.birthday_year
        ):
            try:
                membership.date_of_birth = date(contact.birthday_year, contact.birthday_month, contact.birthday_day)
            except ValueError:
                pass
    contact.member_user_id = payload.member_user_id
    db.flush()
    if payload.member_user_id is not None:
        sync_member_birthday(db, payload.family_id, payload.member_user_id)
    _sync_birthday(db, contact)
    db.commit()
    db.refresh(contact)
    cache.invalidate(f"tribu:members:{payload.family_id}")
    cache.invalidate_pattern(f"tribu:dashboard:{payload.family_id}:*")
    return serialize_contact(contact)
