"""`python -m app.reset_password <email>`, the way back in for an admin who forgot their password."""
import pytest
from fastapi.testclient import TestClient

from app import reset_password as reset_password_cli
from app.main import app, limiter as app_limiter
from tests.support import TestSession, add_member


pytestmark = pytest.mark.usefixtures("app_db")

EMAIL = "admin-reset@example.com"
PASSWORD = "Secure1Pass"


def _login(client: TestClient, password: str):
    return client.post("/auth/login", json={"email": EMAIL, "password": password})


def test_temporary_password_signs_out_everywhere_and_must_be_changed(monkeypatch, capsys):
    app_limiter.reset()
    monkeypatch.setattr(reset_password_cli, "SessionLocal", TestSession)
    with TestSession() as db:
        add_member(db, EMAIL, scopes=None, password=PASSWORD, user_fields={"has_completed_onboarding": True})
        db.commit()
    old_session = TestClient(app)
    assert _login(old_session, PASSWORD).status_code == 200

    assert reset_password_cli.main([EMAIL.upper()]) == 0
    temporary = capsys.readouterr().out.split(": ", 1)[1].split()[0]

    assert old_session.get("/auth/me").status_code == 401
    assert _login(TestClient(app), PASSWORD).status_code == 401
    signed_in = _login(TestClient(app), temporary)
    assert signed_in.json()["must_change_password"] is True


@pytest.mark.parametrize("argv, code", [(["nobody@example.com"], 1), ([], 2), (["a@example.com", "b@example.com"], 2)])
def test_unknown_email_and_wrong_usage(monkeypatch, argv, code):
    monkeypatch.setattr(reset_password_cli, "SessionLocal", TestSession)
    assert reset_password_cli.main(argv) == code
