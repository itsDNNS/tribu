"""VCF (RFC 6350) export utility for Tribu contacts."""


def _escape_vcf(value: str) -> str:
    """Escape special characters for vCard text values."""
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def contacts_to_vcf(contacts) -> str:
    """Convert a list of Contact ORM objects to a vCard 3.0 string."""
    cards = []

    for c in contacts:
        lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            f"FN:{_escape_vcf(c.full_name)}",
            f"N:{_escape_vcf(c.full_name)};;;;",
        ]

        if c.email:
            lines.append(f"EMAIL:{_escape_vcf(c.email)}")

        if c.phone:
            lines.append(f"TEL:{_escape_vcf(c.phone)}")

        if c.birthday_month and c.birthday_day:
            lines.append(f"BDAY:--{c.birthday_month:02d}{c.birthday_day:02d}")

        lines.append(f"UID:tribu-contact-{c.id}@tribu.local")
        lines.append("END:VCARD")

        cards.append("\r\n".join(lines))

    return "\r\n".join(cards)
