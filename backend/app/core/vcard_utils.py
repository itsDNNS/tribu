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


def _normalize_uid_and_rev(raw: str, contact: Contact) -> str:
    """Make sure the stored UID/REV match the ORM row even after edits."""
    try:
        card = vobject.readOne(raw)
    except Exception:
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
        lines.append(f"BDAY:--{c.birthday_month:02d}-{c.birthday_day:02d}")

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
    bday_prop = getattr(card, "bday", None)
    if bday_prop is not None:
        birthday_month, birthday_day = _parse_bday(str(bday_prop.value))

    return (
        {
            "family_id": family_id,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "birthday_month": birthday_month,
            "birthday_day": birthday_day,
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
