"""Sync helpers between Contact rows and their FamilyBirthday row.

Contact-synced birthdays are identified by ``FamilyBirthday.contact_id``
(stable FK to ``contacts.id``), not by ``person_name``. A rename on the
contact updates the existing row in place; two contacts with the same
name each own their own row; deleting one contact only affects its own
linked row. Manual birthdays keep ``contact_id = NULL`` and are
unaffected by contact flows.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import FamilyBirthday


def sync_contact_birthday(
    db: Session,
    family_id: int,
    contact_id: int,
    person_name: str,
    month: int | None,
    day: int | None,
) -> None:
    """Reconcile the synced birthday row for one contact.

    Creates, updates, or deletes the single ``FamilyBirthday`` row that
    belongs to ``contact_id`` within ``family_id``. ``person_name`` is
    stored on the row as the human-readable label; it is *not* used to
    locate the row.

    The ``year`` column is intentionally not touched here: contacts do
    not carry a year, and a year the user set manually on the synced row
    must survive edits/renames on the contact.
    """
    if contact_id is None:
        return

    existing = (
        db.query(FamilyBirthday)
        .filter(
            FamilyBirthday.family_id == family_id,
            FamilyBirthday.contact_id == contact_id,
        )
        .first()
    )

    if month and day and person_name:
        if existing:
            existing.person_name = person_name
            existing.month = month
            existing.day = day
            return
        db.add(FamilyBirthday(
            family_id=family_id,
            contact_id=contact_id,
            person_name=person_name,
            month=month,
            day=day,
        ))
        return

    if existing:
        db.delete(existing)


def delete_synced_birthday_for_contact(
    db: Session,
    family_id: int,
    contact_id: int,
) -> None:
    """Remove the synced birthday row for a contact being deleted.

    Only targets the row with matching ``contact_id``, so a manual
    birthday that happens to share the contact's name/date is left
    alone, and a second same-name contact's row is unaffected.
    """
    if contact_id is None:
        return
    (
        db.query(FamilyBirthday)
        .filter(
            FamilyBirthday.family_id == family_id,
            FamilyBirthday.contact_id == contact_id,
        )
        .delete(synchronize_session=False)
    )


def backfill_contact_id_from_name_match(conn: Connection) -> int:
    """Conservatively link legacy unlinked birthday rows to contacts.

    A legacy row (``contact_id IS NULL``) is linked to a contact only
    when, within the same family, the tuple ``(person_name, month, day)``
    matches *exactly one* contact's ``(full_name, birthday_month,
    birthday_day)`` AND *exactly one* unlinked birthday row. Any
    ambiguity (multiple same-name+date contacts, multiple same-name+date
    birthday rows, a birthday that already links to a different
    contact) is left untouched so no user data is silently collapsed or
    reassigned.

    Returns the number of rows updated. Exposed as a plain helper so the
    alembic migration and unit tests can call it against a live
    connection.
    """
    contact_rows = conn.execute(text(
        """
        SELECT family_id, full_name, birthday_month, birthday_day, MIN(id) AS contact_id
        FROM contacts
        WHERE birthday_month IS NOT NULL
          AND birthday_day IS NOT NULL
          AND full_name IS NOT NULL
        GROUP BY family_id, full_name, birthday_month, birthday_day
        HAVING COUNT(*) = 1
        """
    )).fetchall()

    updated = 0
    for row in contact_rows:
        params = {
            "family_id": row[0],
            "full_name": row[1],
            "month": row[2],
            "day": row[3],
            "contact_id": row[4],
        }
        birthday_rows = conn.execute(text(
            """
            SELECT id FROM family_birthdays
            WHERE family_id = :family_id
              AND person_name = :full_name
              AND month = :month
              AND day = :day
              AND contact_id IS NULL
            """
        ), params).fetchall()
        if len(birthday_rows) != 1:
            continue
        # Guard against double-linking the same contact_id (would fail
        # the partial unique index anyway, but fail early and skip).
        already_linked = conn.execute(text(
            "SELECT 1 FROM family_birthdays WHERE family_id = :family_id AND contact_id = :contact_id"
        ), params).fetchone()
        if already_linked is not None:
            continue
        conn.execute(text(
            "UPDATE family_birthdays SET contact_id = :contact_id WHERE id = :birthday_id"
        ), {"contact_id": params["contact_id"], "birthday_id": birthday_rows[0][0]})
        updated += 1
    return updated
