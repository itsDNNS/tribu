"""A member without an email address signs in with a username (#663)."""
import pytest

from tests.support import ADMIN_EMAIL, PASSWORD, TestSession, add_user, login, new_client, seed_family


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


def _member_form():
    """Adds members as the family admin; returns the server's answer for a sign-in name."""
    family_id, _, _ = seed_family()
    admin = new_client()
    login(admin, ADMIN_EMAIL)
    return lambda name: admin.post(f"/families/{family_id}/members", json={"email": name, "display_name": "Lena"})


@pytest.mark.parametrize("path", ["/auth/login", "/auth/mobile-login"])
@pytest.mark.parametrize("typed, stored", [(" Lena.K ", "lena.k"), (" Kid@Example.COM ", "kid@example.com"), ("J\u030c@Example.com", "j\u030c@example.com")])
def test_member_signs_in_with_a_username_or_an_email(path, typed, stored):
    created = _member_form()(typed)
    assert created.status_code == 200 and created.json()["email"] == stored

    signed_in = new_client().post(path, json={"email": typed.upper(), "password": created.json()["temporary_password"]})
    assert signed_in.status_code == 200 and signed_in.json()["must_change_password"] is True


@pytest.mark.parametrize("name", ["", "l", "\u212aid", "lena müller", "le..na", ".lena", "lena_", "x" * 33, "lena@"])
def test_unusable_usernames_are_refused(name):
    detail = _member_form()(name).json()["detail"]
    assert detail[0]["type"] == "INVALID_LOGIN_NAME"


def test_a_taken_username_conflicts():
    add = _member_form()
    assert add("lena").status_code == 200
    assert add(" LENA ").status_code == 409


def test_an_email_key_stored_by_registration_still_signs_in():
    with TestSession() as db:
        add_user(db, "j\u030c@example.com", password=PASSWORD)
        db.commit()
    assert new_client().post("/auth/login", json={"email": "J\u030c@example.com", "password": PASSWORD}).status_code == 200


def test_registration_still_needs_an_email_address():
    payload = {"email": "lena", "password": "correct horse battery", "display_name": "Lena", "family_name": "F"}
    assert new_client().post("/auth/register", json=payload).status_code == 422
