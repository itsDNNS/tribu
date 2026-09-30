"""vCard (RFC 6350 / 2426) helpers for Tribu contacts.

The DAV storage plugin uses these helpers to round-trip ``Contact``
rows through vCard 3.0 so iOS Contacts, DAVx5, and the existing VCF
subscription feed can share the same serialization. Parsing goes
through ``vobject`` so quoted-printable, line folding, multi-value
properties, and non-ASCII names survive intact. Tribu stores the raw
uploaded VCARD on ``Contact.raw_vcard`` so fields the ORM does not
model (ORG, ADR, NOTE, secondary EMAIL/TEL, PHOTO) round-trip on the
next GET instead of silently disappearing.
"""
from __future__ import annotations

from typing import Iterable, Optional, Tuple

import vobject

from app.models import Contact


def contacts_to_vcards(contacts: Iterable[Contact]) -> str:
    """Serialize one or more contacts into a concatenated vCard 3.0 stream."""
    out: list[str] = []
    for c in contacts:
        out.append(contact_to_vcard(c))
    return "\r\n".join(out) + ("\r\n" if out else "")


def contact_to_vcard(contact: Contact) -> str:
    """Serialize a single contact into a vCard 3.0 block.

    Prefers the raw uploaded VCARD when present so client-only fields
    (ORG, ADR, NOTE, secondary EMAIL/TEL, PHOTO) survive round-tripping.
    Falls back to a synthesized minimal VCARD otherwise.
    """
    raw = getattr(contact, "raw_vcard", None)
    if raw:
        return _normalize_uid_and_rev(raw, contact)
    return _render_vcard(contact)


def contact_channel_values(contact: Contact) -> tuple[list[str], list[str]]:
    emails: list[str] = []
    phones: list[str] = []

    card = _synced_card(contact)
    if card is not None:
        emails = _all_values(card, "email")
        phones = _all_values(card, "tel")

    if getattr(contact, "email", None):
        emails = _merge_primary_value(contact.email, emails)
    if getattr(contact, "phone", None):
        phones = _merge_primary_value(contact.phone, phones)

    return emails, phones


def _normalize_uid_and_rev(raw: str, contact: Contact) -> str:
    """The stored VCARD with the ORM row's UID, REV and edits applied."""
    card = _synced_card(contact)
    if card is None:
        return _render_vcard(contact)
    uid = getattr(contact, "vcard_uid", None) or f"tribu-contact-{contact.id}@tribu.local"
    if hasattr(card, "uid"):
        card.uid.value = uid
    else:
        card.add("uid").value = uid
    mtime = getattr(contact, "updated_at", None) or contact.created_at
    if mtime is not None:
        rev_value = mtime.strftime("%Y%m%dT%H%M%SZ")
        if hasattr(card, "rev"):
            card.rev.value = rev_value
        else:
            card.add("rev").value = rev_value
    return card.serialize()


def _synced_card(contact: Contact):
    """The stored VCARD with what Tribu edits applied on top.

    Tribu models the name, the first EMAIL and TEL and the birthday; the
    rest of a VCARD a phone uploaded stays as it came. A change made in
    Tribu replaces the value it was read from, so the phone gets it on the
    next sync and the old value does not linger as a second one.
    """
    raw = getattr(contact, "raw_vcard", None)
    if not raw:
        return None
    try:
        card = vobject.readOne(raw)
    except Exception:
        return None
    if card is None:
        return None

    full_name = (getattr(contact, "full_name", None) or "").strip()
    if full_name:
        fn = getattr(card, "fn", None)
        if fn is None:
            card.add("fn").value = full_name
        elif (fn.value or "").strip() != full_name:
            fn.value = full_name
            family, given = _split_name(full_name)
            if hasattr(card, "n"):
                card.n.value = vobject.vcard.Name(family=family, given=given)
    _sync_primary(card, "email", getattr(contact, "email", None))
    _sync_primary(card, "tel", getattr(contact, "phone", None))
    _sync_bday(
        card,
        getattr(contact, "birthday_month", None),
        getattr(contact, "birthday_day", None),
        getattr(contact, "birthday_year", None),
    )
    return card


def _sync_primary(card, name: str, value: Optional[str]) -> None:
    """Make the first EMAIL/TEL match Tribu's value, keeping its TYPEs."""
    props = card.contents.get(name, [])
    value = (value or "").strip()
    if not value:
        if props:
            card.remove(props[0])
        return
    first = props[0] if props else None
    current = first.value[0] if first is not None and isinstance(first.value, list) else getattr(first, "value", None)
    if isinstance(current, str) and current.strip() == value:
        return
    for other in props[1:]:
        if isinstance(other.value, str) and other.value.strip() == value:
            card.remove(other)
    if first is None:
        prop = card.add(name)
        prop.value = value
        prop.type_param = "INTERNET" if name == "email" else "CELL"
    else:
        first.value = value


def _sync_bday(card, month: Optional[int], day: Optional[int], year: Optional[int] = None) -> None:
    prop = getattr(card, "bday", None)
    if not (month and day):
        if prop is not None:
            card.remove(prop)
        return
    if prop is not None and _parse_bday(str(prop.value)) == (month, day) and _bday_year(prop) == year:
        return
    if year:
        value = f"{year:04d}-{month:02d}-{day:02d}"
        if prop is not None and "X-APPLE-OMIT-YEAR" in prop.params:
            del prop.params["X-APPLE-OMIT-YEAR"]
    elif prop is not None and "X-APPLE-OMIT-YEAR" in prop.params:
        # Apple keeps a placeholder year for birthdays without one.
        placeholder = str(prop.params["X-APPLE-OMIT-YEAR"][0])
        value = f"{placeholder}-{month:02d}-{day:02d}"
    else:
        value = f"--{month:02d}-{day:02d}"
    if prop is None:
        card.add("bday").value = value
    else:
        prop.value = value


def _bday_year(prop) -> Optional[int]:
    """The year of a BDAY, or None for ``--MM-DD`` and Apple's placeholder."""
    raw = str(prop.value).strip()
    if raw.startswith("--"):
        return None
    digits = raw.replace("-", "")
    if len(digits) < 8 or not digits[:4].isdigit():
        return None
    year = int(digits[:4])
    omit = prop.params.get("X-APPLE-OMIT-YEAR") if hasattr(prop, "params") else None
    if omit and str(omit[0]) == digits[:4]:
        return None
    return year if 1900 <= year <= 2100 else None


def contact_extras(contact: Contact) -> dict:
    """What a phone stored beyond Tribu's fields, for the detail view:
    organization, addresses and note."""
    extras = {"organization": None, "addresses": [], "note": None}
    card = _synced_card(contact)
    if card is None:
        return extras
    org = getattr(card, "org", None)
    if org is not None:
        parts = org.value if isinstance(org.value, list) else [org.value]
        extras["organization"] = ", ".join(p.strip() for p in parts if isinstance(p, str) and p.strip()) or None
    for adr in card.contents.get("adr", []):
        value = adr.value
        lines = [
            " ".join(filter(None, [str(getattr(value, "street", "") or "").strip()])),
            " ".join(filter(None, [str(getattr(value, "code", "") or "").strip(), str(getattr(value, "city", "") or "").strip()])),
            str(getattr(value, "country", "") or "").strip(),
        ]
        text = ", ".join(line for line in lines if line)
        if text:
            extras["addresses"].append(text)
    note = getattr(card, "note", None)
    if note is not None and isinstance(note.value, str) and note.value.strip():
        extras["note"] = note.value.strip()
    return extras


def _render_vcard(c: Contact) -> str:
    lines: list[str] = ["BEGIN:VCARD", "VERSION:3.0"]
    uid = getattr(c, "vcard_uid", None) or f"tribu-contact-{c.id}@tribu.local"
    lines.append(f"UID:{_escape(uid)}")

    full_name = c.full_name or "Unknown"
    lines.append(f"FN:{_escape(full_name)}")
    # N is required in vCard 3.0. Fill the family-name slot from the
    # last whitespace-separated token; leave the rest empty so clients
    # display the same FN.
    family, given = _split_name(full_name)
    lines.append(f"N:{_escape(family)};{_escape(given)};;;")

    if c.email:
        lines.append(f"EMAIL;TYPE=INTERNET:{_escape(c.email)}")
    if c.phone:
        lines.append(f"TEL;TYPE=CELL:{_escape(c.phone)}")
    if c.birthday_month and c.birthday_day:
        year = getattr(c, "birthday_year", None)
        prefix = f"{year:04d}" if year else "-"
        lines.append(f"BDAY:{prefix}-{c.birthday_month:02d}-{c.birthday_day:02d}")

    mtime = getattr(c, "updated_at", None) or c.created_at
    if mtime is not None:
        lines.append(f"REV:{mtime.strftime('%Y%m%dT%H%M%SZ')}")

    lines.append("END:VCARD")
    return "\r\n".join(lines)


def vcard_to_contact_dict(vcard_text: str, family_id: int) -> Tuple[Optional[dict], Optional[str]]:
    """Parse one VCARD block.

    Returns ``(fields, error)``. ``fields`` is a dict ready to assign
    onto a ``Contact``; ``error`` is a human-readable reason when the
    VCARD is rejected. The raw VCARD is included under
    ``fields["raw_vcard"]`` so the storage plugin can stash it for
    round-trip on the next GET.

    Parsing goes through ``vobject`` so QUOTED-PRINTABLE, CRLF line
    folding, multi-value EMAIL/TEL, and non-ASCII names decode
    correctly. Tribu only extracts the fields it currently models
    (FN, first EMAIL, first TEL, BDAY); the rest stays in
    ``raw_vcard``.
    """
    try:
        card = vobject.readOne(vcard_text)
    except Exception as exc:  # noqa: BLE001
        return None, f"Invalid VCARD: {exc}"
    if card is None:
        return None, "No VCARD block found"
    fn_prop = getattr(card, "fn", None)
    full_name = (fn_prop.value if fn_prop else "").strip() if fn_prop else ""
    if not full_name:
        n_prop = getattr(card, "n", None)
        if n_prop is not None:
            full_name = _compose_name(n_prop.value)
    if not full_name:
        return None, "VCARD is missing FN"

    email = _first_value(card, "email")
    phone = _first_value(card, "tel")
    birthday_month: Optional[int] = None
    birthday_day: Optional[int] = None
    birthday_year: Optional[int] = None
    bday_prop = getattr(card, "bday", None)
    if bday_prop is not None:
        birthday_month, birthday_day = _parse_bday(str(bday_prop.value))
        if birthday_month:
            birthday_year = _bday_year(bday_prop)

    return (
        {
            "family_id": family_id,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "birthday_month": birthday_month,
            "birthday_day": birthday_day,
            "birthday_year": birthday_year,
            "raw_vcard": vcard_text,
        },
        None,
    )


def _first_value(card, prop_name: str) -> Optional[str]:
    """Return the first simple value for a repeatable property, or None."""
    contents = card.contents.get(prop_name, [])
    if not contents:
        return None
    value = contents[0].value
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, str):
        return value.strip() or None
    return None


def _all_values(card, prop_name: str) -> list[str]:
    values: list[str] = []
    for item in card.contents.get(prop_name, []):
        value = item.value
        if isinstance(value, list):
            candidates = value
        else:
            candidates = [value]
        for candidate in candidates:
            if not isinstance(candidate, str):
                continue
            cleaned = candidate.strip()
            if cleaned and cleaned not in values:
                values.append(cleaned)
    return values


def _merge_primary_value(primary: str, values: list[str]) -> list[str]:
    cleaned = primary.strip()
    if not cleaned:
        return values
    if cleaned in values:
        return [cleaned, *[value for value in values if value != cleaned]]
    return [cleaned, *values]


def _compose_name(n_value) -> str:
    """Build an FN string from a parsed N value when FN itself is missing."""
    if hasattr(n_value, "given") or hasattr(n_value, "family"):
        given = " ".join(getattr(n_value, "given", []) or []) if isinstance(getattr(n_value, "given", ""), list) else str(getattr(n_value, "given", "") or "")
        family = " ".join(getattr(n_value, "family", []) or []) if isinstance(getattr(n_value, "family", ""), list) else str(getattr(n_value, "family", "") or "")
        full = f"{given} {family}".strip()
        return full
    return str(n_value or "").strip()


def _parse_bday(raw: str) -> Tuple[Optional[int], Optional[int]]:
    """Extract month + day from an RFC 6350 BDAY value.

    Accepts ``YYYY-MM-DD``, ``YYYYMMDD``, ``--MM-DD`` and ``--MMDD``.
    """
    s = raw.strip()
    if s.startswith("--"):
        s = s[2:]
        if "-" in s:
            m, d = s.split("-", 1)
        else:
            m, d = s[:2], s[2:4]
    else:
        # Expect YYYY-MM-DD or YYYYMMDD
        s = s.replace("-", "")
        if len(s) >= 8:
            m, d = s[4:6], s[6:8]
        else:
            return None, None
    try:
        mi = int(m)
        di = int(d)
    except ValueError:
        return None, None
    if 1 <= mi <= 12 and 1 <= di <= 31:
        return mi, di
    return None, None


def _split_name(full_name: str) -> Tuple[str, str]:
    parts = full_name.strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[-1], " ".join(parts[:-1])


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _unescape(value: str) -> str:
    out = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            if nxt in ("\\", ";", ","):
                out.append(nxt)
                i += 2
                continue
            if nxt.lower() == "n":
                out.append("\n")
                i += 2
                continue
        out.append(ch)
        i += 1
    return "".join(out)
