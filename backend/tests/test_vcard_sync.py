"""Tribu edits reach the VCARD a phone uploaded (CardDAV round trip)."""

from datetime import datetime
from types import SimpleNamespace

import vobject

from app.core.vcard_utils import contact_channel_values, contact_to_vcard

IPHONE_CARD = (
    "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//iPhone OS 18.0//EN\r\n"
    "N:Weber;Sophie;;;\r\nFN:Sophie Weber\r\nORG:Practice;\r\n"
    "EMAIL;type=INTERNET;type=WORK;type=pref:praxis@example.com\r\n"
    "TEL;type=CELL;type=VOICE;type=pref:+49 170 1234567\r\n"
    "TEL;type=WORK;type=VOICE:+49 30 123456\r\n"
    "ADR;type=WORK:;;Main St 1;Berlin;;10115;Germany\r\n"
    "BDAY;X-APPLE-OMIT-YEAR=1604:1604-07-07\r\n"
    "UID:sophie\r\nEND:VCARD\r\n"
)


def contact(**changes):
    values = dict(
        id=1,
        vcard_uid="sophie",
        full_name="Sophie Weber",
        email="praxis@example.com",
        phone="+49 170 1234567",
        birthday_month=7,
        birthday_day=7,
        raw_vcard=IPHONE_CARD,
        created_at=datetime(2026, 9, 1),
        updated_at=datetime(2026, 9, 30),
    )
    values.update(changes)
    return SimpleNamespace(**values)


def served(c):
    return vobject.readOne(contact_to_vcard(c))


def test_unchanged_contact_is_served_as_uploaded():
    card = served(contact())
    assert card.fn.value == "Sophie Weber"
    assert [t.value for t in card.contents["tel"]] == ["+49 170 1234567", "+49 30 123456"]
    assert card.org.value == ["Practice"]


def test_new_phone_replaces_the_one_it_was_read_from():
    c = contact(phone="+49 170 9999999")
    card = served(c)
    assert [t.value for t in card.contents["tel"]] == ["+49 170 9999999", "+49 30 123456"]
    # The type stays, and the old number does not linger in Tribu either.
    assert "CELL" in card.contents["tel"][0].params["TYPE"]
    assert contact_channel_values(c)[1] == ["+49 170 9999999", "+49 30 123456"]


def test_cleared_email_is_removed_and_other_fields_stay():
    card = served(contact(email=None))
    assert "email" not in card.contents
    assert card.adr.value.city == "Berlin"


def test_renamed_contact_gets_a_new_fn_and_n():
    card = served(contact(full_name="Sophie Weber-Klein"))
    assert card.fn.value == "Sophie Weber-Klein"
    assert card.n.value.family == "Weber-Klein"


def test_birthday_change_keeps_the_year_placeholder():
    card = served(contact(birthday_month=8, birthday_day=1))
    assert card.bday.value == "1604-08-01"
    assert card.bday.params["X-APPLE-OMIT-YEAR"] == ["1604"]


def test_removed_birthday_is_dropped():
    assert "bday" not in served(contact(birthday_month=None, birthday_day=None)).contents


def test_email_added_in_tribu_joins_the_card():
    raw = IPHONE_CARD.replace("EMAIL;type=INTERNET;type=WORK;type=pref:praxis@example.com\r\n", "")
    card = served(contact(raw_vcard=raw, email="new@example.com"))
    assert card.email.value == "new@example.com"
