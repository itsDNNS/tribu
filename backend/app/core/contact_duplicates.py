"""Finding and merging contacts that are the same person.

Contacts arrive from several phones over CardDAV, from imports and from
Tribu itself, so the same person easily ends up twice. Two contacts count as
the same person when they share an email address, a phone number (compared
by their last nine digits, so "0170 1234567" matches "+49 170 1234567") or
their name (ignoring case, accents, punctuation and word order). Pairs
someone marked as different people are left alone.

Merging keeps one contact, adds the other's addresses, numbers, notes and
birthday to it, and deletes the other; phones pick both changes up on their
next sync.

A contact can also be a family member: the phone sends "Hannelore Müller"
and Hannelore is in Tribu. A first name alone says little, so a contact is
suggested for a member when they share an email address, the whole name, or
the first name and the birthday.
"""

from __future__ import annotations

import re
import unicodedata
from itertools import combinations
from typing import Iterable, Optional

import vobject
from sqlalchemy.orm import Session

from app.core.contact_birthdays import delete_synced_birthday_for_contact, sync_contact_birthday
from app.core.vcard_utils import _split_name, _synced_card, contact_channel_values
from app.models import Contact, ContactDuplicateDismissal, ContactMemberDismissal, Membership, User

_PHONE_DIGITS = 9


def normalize_name(name: Optional[str]) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    words = re.findall(r"[a-z0-9]+", text.replace("ß", "ss"))
    return " ".join(sorted(words))


def name_tokens(name: Optional[str]) -> list[str]:
    """The words of a name in their order, folded like ``normalize_name``."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    return re.findall(r"[a-z0-9]+", text.replace("ß", "ss"))


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-_PHONE_DIGITS:] if len(digits) >= _PHONE_DIGITS - 2 else None


def normalize_email(email: Optional[str]) -> Optional[str]:
    value = (email or "").strip().casefold()
    return value if "@" in value else None


def contact_keys(contact: Contact) -> dict[str, set[str]]:
    """What identifies a contact: its emails, phones and name."""
    emails, phones = contact_channel_values(contact)
    name = normalize_name(contact.full_name)
    return {
        "email": {key for key in (normalize_email(e) for e in emails) if key},
        "phone": {key for key in (normalize_phone(p) for p in phones) if key},
        # A single word ("Mama") is too little to go on.
        "name": {name} if len(name.split()) >= 2 else set(),
    }


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def dismissed_pairs(db: Session, family_id: int) -> set[tuple[int, int]]:
    rows = (
        db.query(ContactDuplicateDismissal.first_contact_id, ContactDuplicateDismissal.second_contact_id)
        .filter(ContactDuplicateDismissal.family_id == family_id)
        .all()
    )
    return {_pair(a, b) for a, b in rows}


def find_duplicate_groups(db: Session, family_id: int) -> list[dict]:
    """Groups of contacts that look like the same person, with why."""
    contacts = db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.id).all()
    keys = {c.id: contact_keys(c) for c in contacts}
    dismissed = dismissed_pairs(db, family_id)

    parent = {c.id: c.id for c in contacts}

    def root(cid: int) -> int:
        while parent[cid] != cid:
            parent[cid] = parent[parent[cid]]
            cid = parent[cid]
        return cid

    reasons: dict[tuple[int, int], set[str]] = {}
    index: dict[tuple[str, str], list[int]] = {}
    for cid, kinds in keys.items():
        for kind, values in kinds.items():
            for value in values:
                index.setdefault((kind, value), []).append(cid)
    for (kind, _), ids in index.items():
        for a, b in combinations(sorted(set(ids)), 2):
            if (a, b) in dismissed:
                continue
            reasons.setdefault((a, b), set()).add(kind)
    for a, b in reasons:
        parent[root(a)] = root(b)

    groups: dict[int, list[int]] = {}
    for cid in parent:
        groups.setdefault(root(cid), []).append(cid)
    result = []
    for ids in groups.values():
        if len(ids) < 2:
            continue
        ids.sort()
        why = sorted({kind for pair, kinds in reasons.items() if pair[0] in ids for kind in kinds})
        result.append({"contact_ids": ids, "reasons": why})
    result.sort(key=lambda group: group["contact_ids"][0])
    return result


def find_member_matches(db: Session, family_id: int) -> list[dict]:
    """Contacts that look like a family member, with why.

    Members someone already linked a contact to, and pairs marked as
    different people, are left out.
    """
    contacts = db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.id).all()
    linked = {contact.member_user_id for contact in contacts if contact.member_user_id}
    dismissed = {
        (row.contact_id, row.member_user_id)
        for row in db.query(ContactMemberDismissal).filter(ContactMemberDismissal.family_id == family_id)
    }
    members = (
        db.query(Membership, User)
        .join(User, User.id == Membership.user_id)
        .filter(Membership.family_id == family_id)
        .order_by(Membership.user_id)
        .all()
    )
    result = []
    for membership, user in members:
        if user.id in linked:
            continue
        email = normalize_email(user.email)
        words = name_tokens(user.display_name)
        full = normalize_name(user.display_name)
        born = membership.date_of_birth
        for contact in contacts:
            if contact.member_user_id or (contact.id, user.id) in dismissed:
                continue
            keys = contact_keys(contact)
            same_birthday = bool(
                born
                and contact.birthday_month == born.month
                and contact.birthday_day == born.day
                and (not contact.birthday_year or contact.birthday_year == born.year)
            )
            reasons: set[str] = set()
            if email and email in keys["email"]:
                reasons.add("email")
            if len(full.split()) >= 2 and full == normalize_name(contact.full_name):
                reasons.add("name")
            elif words and words[0] in name_tokens(contact.full_name) and same_birthday:
                reasons.update({"first_name", "birthday"})
            if reasons and same_birthday:
                reasons.add("birthday")
            if reasons:
                result.append({"contact_ids": [contact.id], "member_user_id": user.id, "reasons": sorted(reasons)})
    return result


def find_match(db: Session, family_id: int, *, full_name: str, email: Optional[str], phone: Optional[str]) -> Optional[Contact]:
    """An existing contact that is clearly the same person, for imports.

    Only a shared email or phone number counts, or the same full name when
    neither side contradicts it with a different email or phone.
    """
    email_key = normalize_email(email)
    phone_key = normalize_phone(phone)
    name_key = normalize_name(full_name)
    by_name = None
    for contact in db.query(Contact).filter(Contact.family_id == family_id).order_by(Contact.id):
        keys = contact_keys(contact)
        if (email_key and email_key in keys["email"]) or (phone_key and phone_key in keys["phone"]):
            return contact
        if by_name is None and name_key and name_key == normalize_name(contact.full_name):
            conflicting = (email_key and keys["email"] and email_key not in keys["email"]) or (
                phone_key and keys["phone"] and phone_key not in keys["phone"]
            )
            if not conflicting:
                by_name = contact
    return by_name


def fill_missing(contact: Contact, *, email=None, phone=None, month=None, day=None, year=None) -> bool:
    """Complete ``contact`` with what it lacks; True if anything changed."""
    changed = False
    if email and not contact.email:
        contact.email = email
        changed = True
    if phone and not contact.phone:
        contact.phone = phone
        changed = True
    if month and day and not (contact.birthday_month and contact.birthday_day):
        contact.birthday_month, contact.birthday_day = month, day
        changed = True
    if year and not contact.birthday_year and (contact.birthday_month, contact.birthday_day) == (month, day):
        contact.birthday_year = year
        changed = True
    return changed


def merge_contacts(db: Session, keep: Contact, others: Iterable[Contact]) -> Contact:
    """Fold ``others`` into ``keep`` and delete them."""
    card = _synced_card(keep)
    for other in others:
        if other.member_user_id and not keep.member_user_id:
            keep.member_user_id = other.member_user_id
        fill_missing(
            keep,
            email=other.email,
            phone=other.phone,
            month=other.birthday_month,
            day=other.birthday_day,
            year=other.birthday_year,
        )
        other_card = _synced_card(other)
        if other_card is not None or other.email or other.phone:
            if card is None:
                card = _card_from_contact(keep)
            _merge_cards(card, other_card, other)
        delete_synced_birthday_for_contact(db, other.family_id, other.id)
        db.delete(other)
    if card is not None:
        keep.raw_vcard = card.serialize()
    db.flush()
    sync_contact_birthday(
        db, keep.family_id, keep.id, keep.full_name, keep.birthday_month, keep.birthday_day, keep.birthday_year
    )
    return keep


def _card_from_contact(contact: Contact):
    card = vobject.vCard()
    card.add("fn").value = contact.full_name
    family, given = _split_name(contact.full_name)
    card.add("n").value = vobject.vcard.Name(family=family, given=given)
    if contact.email:
        prop = card.add("email")
        prop.value = contact.email
        prop.type_param = "INTERNET"
    if contact.phone:
        prop = card.add("tel")
        prop.value = contact.phone
        prop.type_param = "CELL"
    return card


def _merge_cards(card, other_card, other: Contact) -> None:
    """Add the other contact's numbers, addresses and details to ``card``."""
    known_emails = {normalize_email(p.value) for p in card.contents.get("email", []) if isinstance(p.value, str)}
    known_phones = {normalize_phone(p.value) for p in card.contents.get("tel", []) if isinstance(p.value, str)}
    source = other_card if other_card is not None else _card_from_contact(other)
    for prop in source.contents.get("email", []):
        if isinstance(prop.value, str) and normalize_email(prop.value) not in known_emails:
            card.add(prop.duplicate(prop))
            known_emails.add(normalize_email(prop.value))
    for prop in source.contents.get("tel", []):
        if isinstance(prop.value, str) and normalize_phone(prop.value) not in known_phones:
            card.add(prop.duplicate(prop))
            known_phones.add(normalize_phone(prop.value))
    known_addresses = {str(p.value) for p in card.contents.get("adr", [])}
    for prop in source.contents.get("adr", []):
        if str(prop.value) not in known_addresses:
            card.add(prop.duplicate(prop))
    for name in ("org", "title", "note", "url", "photo"):
        if name not in card.contents and name in source.contents:
            for prop in source.contents[name]:
                card.add(prop.duplicate(prop))
