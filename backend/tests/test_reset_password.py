"""Temporary passwords: the admin reset in the app and `python -m app.reset_password <email>`.

Both must be changed at the next sign-in and sign the account out everywhere.
"""
import pytest

from app import reset_password as reset_password_cli
from tests.support import ADMIN_EMAIL, MEMBER_EMAIL, TestSession, login, new_client, seed_family


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


TYPED = "Typed-in-1234"


@pytest.fixture
def shell(monkeypatch):
    """The command as run from the shell: the test database, and the password it asks for."""
    monkeypatch.setattr(reset_password_cli, "SessionLocal", TestSession)
    monkeypatch.setattr(reset_password_cli.getpass, "getpass", lambda prompt: TYPED)


def _reset_as_admin(family_id: int, member_id: int) -> str:
    admin = new_client()
    login(admin, ADMIN_EMAIL)
    return admin.post(f"/families/{family_id}/members/{member_id}/reset-password").json()["temporary_password"]


def _reset_from_shell(family_id: int, member_id: int) -> str:
    assert reset_password_cli.main([MEMBER_EMAIL.upper()]) == 0
    return TYPED


@pytest.mark.parametrize("reset", [_reset_as_admin, _reset_from_shell])
def test_temporary_password_signs_out_everywhere_and_must_be_changed(reset, shell, capsys):
    family_id, _, member_id = seed_family()
    old_session = new_client()
    assert login(old_session, MEMBER_EMAIL).status_code == 200

    temporary = reset(family_id, member_id)

    assert old_session.get("/auth/me").status_code == 401
    assert login(new_client(), MEMBER_EMAIL).status_code == 401
    signed_in = new_client().post("/auth/login", json={"email": MEMBER_EMAIL, "password": temporary})
    assert signed_in.json()["must_change_password"] is True
    assert TYPED not in capsys.readouterr().out


@pytest.mark.parametrize("argv, typed, code", [
    (["nobody@example.com"], TYPED, 1), (["nobody@example.com"], "", 2), ([], TYPED, 2), (["a@example.com", "b@example.com"], TYPED, 2),
])
def test_unknown_email_empty_password_and_wrong_usage(shell, monkeypatch, argv, typed, code):
    monkeypatch.setattr(reset_password_cli.getpass, "getpass", lambda prompt: typed)
    assert reset_password_cli.main(argv) == code
