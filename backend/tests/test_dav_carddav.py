"""Phase C: CardDAV storage plugin tests.

Mirrors the CalDAV read/write suite but against ``Contact`` rows and
the ``/<user>/book-<family_id>/`` path.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.vcard_utils import contact_channel_values
from app.database import SessionLocal
from app.models import Contact, Family, FamilyBirthday, Membership, PersonalAccessToken, User
from tests.support import add_member, dav_basic, delete_production_rows


EMAIL = "dav-carddav@example.com"


@pytest.fixture
def seeded(dav_app):
    with SessionLocal() as db:
        member = add_member(db, EMAIL, scopes="contacts:read,contacts:write", family_name="CardDAV Family", display_name="CardDAV User")
        db.add(Contact(
            family_id=member.family_id,
            full_name="Oma Schmidt",
            email="oma@example.com",
            phone="+49 1234 5678",
            birthday_month=4,
            birthday_day=14,
        ))
        db.add(Contact(
            family_id=member.family_id,
            full_name="Onkel Peter",
            email="peter@example.com",
        ))
        db.commit()
    yield member.token, member.family_id
    delete_production_rows(Contact, Membership, PersonalAccessToken, User, Family)


def _propfind(client: TestClient, path: str, *, headers=None, depth="1"):
    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:"><prop><resourcetype/><displayname/><getetag/></prop></propfind>'
    )
    h = {"Depth": depth, "Content-Type": "application/xml"}
    if headers:
        h.update(headers)
    return client.request("PROPFIND", path, headers=h, content=body)


class TestCardDAV:
    def test_principal_lists_addressbook_for_contact_scoped_pat(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        assert f"book-{family_id}" in resp.text
        assert f"cal-{family_id}" not in resp.text

    def test_addressbook_lists_contacts(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/book-{family_id}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        assert "tribu-contact-" in resp.text
        assert resp.text.count("tribu-contact-") >= 2

    def test_get_returns_vcard(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        import re

        headers = {"Authorization": dav_basic(EMAIL, token)}
        listing = _propfind(client, f"/dav/{EMAIL}/book-{family_id}/", headers=headers, depth="1")
        match = re.search(r"tribu-contact-(\d+)\.vcf", listing.text)
        assert match, listing.text
        cid = match.group(1)
        get_resp = client.get(
            f"/dav/{EMAIL}/book-{family_id}/tribu-contact-{cid}.vcf",
            headers=headers,
        )
        assert get_resp.status_code == 200, get_resp.text
        body = get_resp.text
        assert "BEGIN:VCARD" in body
        assert "VERSION:3.0" in body
        assert "FN:" in body
        assert ("Oma Schmidt" in body) or ("Onkel Peter" in body)

    def test_put_creates_contact(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:new-contact@example.com\r\n"
            "FN:Tante Lisa\r\nN:Lisa;Tante;;;\r\n"
            "EMAIL;TYPE=INTERNET:lisa@example.com\r\n"
            "BDAY:--07-12\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/new-contact.vcf",
            headers=auth,
            content=vcard,
        )
        assert put.status_code in (201, 204), put.text
        get = client.get(
            f"/dav/{EMAIL}/book-{family_id}/new-contact.vcf",
            headers={"Authorization": dav_basic(EMAIL, token)},
        )
        assert get.status_code == 200, get.text
        assert "Tante Lisa" in get.text
        db = SessionLocal()
        try:
            birthday = (
                db.query(FamilyBirthday)
                .filter(FamilyBirthday.family_id == family_id, FamilyBirthday.person_name == "Tante Lisa")
                .first()
            )
            assert birthday is not None
            assert birthday.month == 7
            assert birthday.day == 12
        finally:
            db.close()

    def test_delete_removes_contact(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token)}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:to-delete@example.com\r\n"
            "FN:Transient\r\nN:Transient;;;;\r\n"
            "END:VCARD\r\n"
        )
        client.put(
            f"/dav/{EMAIL}/book-{family_id}/to-delete.vcf",
            headers={**auth, "Content-Type": "text/vcard"},
            content=vcard,
        )
        delete = client.request(
            "DELETE",
            f"/dav/{EMAIL}/book-{family_id}/to-delete.vcf",
            headers=auth,
        )
        assert delete.status_code in (200, 204)
        missing = client.get(
            f"/dav/{EMAIL}/book-{family_id}/to-delete.vcf",
            headers=auth,
        )
        assert missing.status_code == 404

    def test_delete_removes_synced_birthday(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:bday-delete@example.com\r\n"
            "FN:Birthday Remove\r\nN:Remove;Birthday;;;\r\n"
            "BDAY:--09-03\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/birthday-remove.vcf",
            headers=auth,
            content=vcard,
        )
        assert put.status_code in (201, 204), put.text

        delete = client.request(
            "DELETE",
            f"/dav/{EMAIL}/book-{family_id}/birthday-remove.vcf",
            headers={"Authorization": dav_basic(EMAIL, token)},
        )
        assert delete.status_code in (200, 204)

        db = SessionLocal()
        try:
            birthday = (
                db.query(FamilyBirthday)
                .filter(FamilyBirthday.family_id == family_id, FamilyBirthday.person_name == "Birthday Remove")
                .first()
            )
            assert birthday is None
        finally:
            db.close()

    def test_put_updates_synced_birthday_in_place(self, dav_app, seeded):
        """A CardDAV update changing BDAY must update the linked birthday
        row in place — same id, new month/day, no duplicates.
        """
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        original = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:bday-update@example.com\r\n"
            "FN:Birthday Shift\r\nN:Shift;Birthday;;;\r\n"
            "BDAY:--04-14\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/birthday-shift.vcf",
            headers=auth,
            content=original,
        )
        assert put.status_code in (201, 204), put.text

        db = SessionLocal()
        try:
            contact = (
                db.query(Contact)
                .filter(Contact.family_id == family_id, Contact.full_name == "Birthday Shift")
                .first()
            )
            assert contact is not None
            contact_id = contact.id
            initial_rows = (
                db.query(FamilyBirthday)
                .filter(
                    FamilyBirthday.family_id == family_id,
                    FamilyBirthday.contact_id == contact_id,
                )
                .all()
            )
            assert len(initial_rows) == 1
            synced_id = initial_rows[0].id
            assert (initial_rows[0].month, initial_rows[0].day) == (4, 14)
        finally:
            db.close()

        updated = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:bday-update@example.com\r\n"
            "FN:Birthday Shift\r\nN:Shift;Birthday;;;\r\n"
            "BDAY:--12-25\r\n"
            "END:VCARD\r\n"
        )
        put2 = client.put(
            f"/dav/{EMAIL}/book-{family_id}/birthday-shift.vcf",
            headers=auth,
            content=updated,
        )
        assert put2.status_code in (201, 204), put2.text

        db = SessionLocal()
        try:
            rows = (
                db.query(FamilyBirthday)
                .filter(
                    FamilyBirthday.family_id == family_id,
                    FamilyBirthday.contact_id == contact_id,
                )
                .all()
            )
            assert len(rows) == 1, f"expected in-place update, got {rows}"
            assert rows[0].id == synced_id
            assert (rows[0].month, rows[0].day) == (12, 25)
            assert rows[0].person_name == "Birthday Shift"

            # Nothing should have been left behind at the old date.
            stale = (
                db.query(FamilyBirthday)
                .filter(
                    FamilyBirthday.family_id == family_id,
                    FamilyBirthday.person_name == "Birthday Shift",
                    FamilyBirthday.month == 4,
                    FamilyBirthday.day == 14,
                )
                .all()
            )
            assert stale == []
        finally:
            db.close()

    def test_put_preserves_multiple_channel_values_in_contact_response(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:multi-channel@example.com\r\n"
            "FN:Multi Channel\r\n"
            "N:Channel;Multi;;;\r\n"
            "EMAIL;TYPE=HOME:first@example.com\r\n"
            "EMAIL;TYPE=WORK:second@example.com\r\n"
            "TEL;TYPE=CELL:+49 111 222\r\n"
            "TEL;TYPE=HOME:+49 333 444\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/multi-channel.vcf",
            headers=auth,
            content=vcard,
        )
        assert put.status_code in (201, 204), put.text

        db = SessionLocal()
        try:
            contact = (
                db.query(Contact)
                .filter(Contact.family_id == family_id, Contact.full_name == "Multi Channel")
                .first()
            )
            assert contact is not None
            email_values, phone_values = contact_channel_values(contact)
            assert email_values == ["first@example.com", "second@example.com"]
            assert phone_values == ["+49 111 222", "+49 333 444"]
        finally:
            db.close()

    def test_put_preserves_unmodeled_fields(self, dav_app, seeded):
        """A PUT with ORG/ADR/NOTE and multiple EMAIL must round-trip."""
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:rich-roundtrip@example.com\r\n"
            "FN:Marta Mueller\r\n"
            "N:Mueller;Marta;;;\r\n"
            "EMAIL;TYPE=HOME:marta@home.example\r\n"
            "EMAIL;TYPE=WORK:marta@work.example\r\n"
            "TEL;TYPE=CELL:+49 111 2222\r\n"
            "ORG:Familienfest GmbH\r\n"
            "ADR;TYPE=HOME:;;Seestrasse 1;Berlin;;12345;DE\r\n"
            "NOTE:Lieblingskuchen: Apfelstrudel\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/rich.vcf",
            headers=auth,
            content=vcard,
        )
        assert put.status_code in (201, 204), put.text

        get = client.get(
            f"/dav/{EMAIL}/book-{family_id}/rich.vcf",
            headers={"Authorization": dav_basic(EMAIL, token)},
        )
        assert get.status_code == 200, get.text
        body = get.text
        for expected in ("Familienfest GmbH", "Seestrasse", "Apfelstrudel", "marta@work.example"):
            assert expected in body, f"round-trip lost {expected!r} from body:\n{body}"

    def test_put_with_duplicate_uid_on_new_href_is_rejected(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:taken@example.com\r\nFN:First\r\nN:First;;;;\r\n"
            "END:VCARD\r\n"
        )
        first = client.put(
            f"/dav/{EMAIL}/book-{family_id}/first.vcf",
            headers=auth,
            content=vcard,
        )
        assert first.status_code in (201, 204), first.text

        collision = client.put(
            f"/dav/{EMAIL}/book-{family_id}/second.vcf",
            headers=auth,
            content=vcard,
        )
        # Either Radicale's own has_uid check catches it (409) or our
        # defensive guard raises ValueError -> 400/409. Both block the
        # silent hijack.
        assert 400 <= collision.status_code < 500, collision.text

        # First row must still be reachable unchanged.
        still = client.get(
            f"/dav/{EMAIL}/book-{family_id}/first.vcf",
            headers={"Authorization": dav_basic(EMAIL, token)},
        )
        assert still.status_code == 200, still.text

    def test_put_invalid_vcard_is_rejected(self, dav_app, seeded):
        token, family_id = seeded
        client = TestClient(dav_app)
        auth = {"Authorization": dav_basic(EMAIL, token), "Content-Type": "text/vcard"}
        # Missing FN -> vcard_to_contact_dict returns an error.
        vcard = (
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            "UID:bad@example.com\r\n"
            "END:VCARD\r\n"
        )
        put = client.put(
            f"/dav/{EMAIL}/book-{family_id}/bad.vcf",
            headers=auth,
            content=vcard,
        )
        assert 400 <= put.status_code < 500
