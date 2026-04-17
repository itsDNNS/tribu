"""vCard (RFC 6350 / 2426) helpers for Tribu contacts.

The DAV storage plugin uses these helpers to round-trip ``Contact``
rows through vCard 3.0 so iOS Contacts, DAVx5, and the existing VCF
subscription feed can share the same serialization.
"""
from __future__ import annotations

from typing import Iterable, Optional, Tuple

from app.models import Contact


def contacts_to_vcards(contacts: Iterable[Contact]) -> str:
    """Serialize one or more contacts into a concatenated vCard 3.0 stream."""
    out: list[str] = []
    for c in contacts:
        out.append(_render_vcard(c))
    return "\r\n".join(out) + ("\r\n" if out else "")


def contact_to_vcard(contact: Contact) -> str:
    """Serialize a single contact into a vCard 3.0 block (no trailing CRLF)."""
    return _render_vcard(contact)


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
    VCARD is rejected.
    """
    data = _parse_vcard(vcard_text)
    if data is None:
        return None, "No VCARD block found"
    fn = data.get("FN") or data.get("N")
    if not fn or not str(fn).strip():
        return None, "VCARD is missing FN"
    full_name = _unescape(str(fn).strip())
    email = _unescape(str(data.get("EMAIL") or "").strip()) or None
    phone = _unescape(str(data.get("TEL") or "").strip()) or None
    birthday_month: Optional[int] = None
    birthday_day: Optional[int] = None
    bday = data.get("BDAY")
    if bday:
        birthday_month, birthday_day = _parse_bday(str(bday))
    return (
        {
            "family_id": family_id,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "birthday_month": birthday_month,
            "birthday_day": birthday_day,
        },
        None,
    )


def _parse_vcard(text: str) -> Optional[dict]:
    """Very small VCARD parser that keeps the first value for each property.

    The real vCard grammar is a lot richer. We only need FN, N, EMAIL,
    TEL, BDAY, and UID for round-trip, so the parser folds continuation
    lines and picks the first matching property. Parameters after the
    property name (``EMAIL;TYPE=INTERNET:``) are stripped.
    """
    lines = _unfold_lines(text)
    in_vcard = False
    result: dict[str, str] = {}
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        upper = line.upper()
        if upper.startswith("BEGIN:VCARD"):
            in_vcard = True
            result = {}
            continue
        if upper.startswith("END:VCARD"):
            if in_vcard:
                return result
            return None
        if not in_vcard:
            continue
        if ":" not in line:
            continue
        prop_part, value = line.split(":", 1)
        prop = prop_part.split(";", 1)[0].upper()
        if prop in result:
            continue
        result[prop] = value
    return result or None


def _unfold_lines(text: str) -> list[str]:
    """Undo RFC 5322 style line folding used by vCard 3.0."""
    raw = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    for line in raw:
        if line.startswith((" ", "\t")) and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


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
