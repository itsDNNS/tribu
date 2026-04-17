"""Phase C: CardDAV storage plugin tests.

Mirrors the CalDAV read/write suite but against ``Contact`` rows and
the ``/<user>/book-<family_id>/`` path.
"""
from __future__ import annotations

import base64
import hashlib
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.models import Contact, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


EMAIL = "dav-carddav@example.com"


@pytest.fixture(scope="module")
def dav_storage_folder():
    with tempfile.TemporaryDirectory(prefix="tribu-dav-carddav-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        yield folder
        os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture(scope="module")
def app_under_test(dav_storage_folder):
    from app.main import app

    Base.metadata.create_all(bind=engine)
    yield app
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def seeded(app_under_test):
    db = SessionLocal()
    try:
        user = User(email=EMAIL, password_hash=hash_password("x"), display_name="CardDAV User")
        db.add(user)
        db.flush()
        family = Family(name="CardDAV Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}carddav-rw"
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="carddav-pat",
            token_hash=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
            scopes="contacts:read,contacts:write",
        ))
        db.add(Contact(
            family_id=family.id,
            full_name="Oma Schmidt",
            email="oma@example.com",
            phone="+49 1234 5678",
            birthday_month=4,
            birthday_day=14,
        ))
        db.add(Contact(
            family_id=family.id,
            full_name="Onkel Peter",
            email="peter@example.com",
        ))
        db.commit()
        token = plain
        family_id = family.id
    finally:
        db.close()
    yield token, family_id
    db = SessionLocal()
    try:
        db.query(Contact).delete()
        db.query(Membership).delete()
        db.query(PersonalAccessToken).delete()
        db.query(User).filter(User.email == EMAIL).delete()
        db.query(Family).delete()
        db.commit()
    finally:
        db.close()


def _basic(login: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{login}:{token}".encode("utf-8")).decode("ascii")


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
    def test_principal_lists_both_calendar_and_addressbook(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        assert f"cal-{family_id}" in resp.text
        assert f"book-{family_id}" in resp.text

    def test_addressbook_lists_contacts(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        headers = {"Authorization": _basic(EMAIL, token)}
        resp = _propfind(client, f"/dav/{EMAIL}/book-{family_id}/", headers=headers, depth="1")
        assert resp.status_code == 207, resp.text
        assert "tribu-contact-" in resp.text
        assert resp.text.count("tribu-contact-") >= 2

    def test_get_returns_vcard(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        import re

        headers = {"Authorization": _basic(EMAIL, token)}
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

    def test_put_creates_contact(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token), "Content-Type": "text/vcard"}
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
            headers={"Authorization": _basic(EMAIL, token)},
        )
        assert get.status_code == 200, get.text
        assert "Tante Lisa" in get.text

    def test_delete_removes_contact(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token)}
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

    def test_put_invalid_vcard_is_rejected(self, app_under_test, seeded):
        token, family_id = seeded
        client = TestClient(app_under_test)
        auth = {"Authorization": _basic(EMAIL, token), "Content-Type": "text/vcard"}
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
