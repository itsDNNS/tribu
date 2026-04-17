from sqlalchemy.orm import Session

from app.models import FamilyBirthday


def upsert_family_birthday(
    db: Session,
    family_id: int,
    person_name: str,
    month: int | None,
    day: int | None,
) -> None:
    if not person_name or not month or not day:
        return
    existing = (
        db.query(FamilyBirthday)
        .filter(
            FamilyBirthday.family_id == family_id,
            FamilyBirthday.person_name == person_name,
        )
        .first()
    )
    if existing:
        existing.month = month
        existing.day = day
        return
    db.add(FamilyBirthday(family_id=family_id, person_name=person_name, month=month, day=day))


def delete_family_birthday(db: Session, family_id: int, person_name: str) -> None:
    if not person_name:
        return
    (
        db.query(FamilyBirthday)
        .filter(
            FamilyBirthday.family_id == family_id,
            FamilyBirthday.person_name == person_name,
        )
        .delete()
    )


def sync_contact_birthday(
    db: Session,
    family_id: int,
    old_name: str | None,
    new_name: str,
    month: int | None,
    day: int | None,
) -> None:
    if old_name and old_name != new_name:
        existing = (
            db.query(FamilyBirthday)
            .filter(
                FamilyBirthday.family_id == family_id,
                FamilyBirthday.person_name == old_name,
            )
            .first()
        )
        if existing:
            existing.person_name = new_name

    if month and day:
        upsert_family_birthday(db, family_id, new_name, month, day)
        return

    delete_family_birthday(db, family_id, new_name)
