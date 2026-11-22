"""The failed sign-in log line, and sign-ins in the audit log.

The address comes from ``rate_limit_key``, tested with trusted proxies in test_cors_headers.
"""
import logging

import pytest

from app.core import mfa
from app.models import AuditLog
from tests.support import ADMIN_EMAIL, PASSWORD, TestSession, new_client, seed_family, turn_on_two_step


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


def _entries() -> list[tuple[str, int, dict]]:
    with TestSession() as db:
        return [(e.action, e.target_user_id, e.details) for e in db.query(AuditLog).order_by(AuditLog.id)]


@pytest.mark.parametrize("path", ["/auth/login", "/auth/mobile-login"])
def test_wrong_passwords_are_only_logged_and_sign_ins_audited(path, caplog):
    _, admin_id, _ = seed_family()
    client = new_client()

    with caplog.at_level(logging.WARNING, logger="tribu.security"):
        assert client.post(path, json={"email": ADMIN_EMAIL, "password": "Wrong1Pass"}).status_code == 401
        assert client.post(path, json={"email": "nobody@example.com", "password": PASSWORD}).status_code == 401
    assert client.post(path, json={"email": ADMIN_EMAIL, "password": PASSWORD}).status_code == 200

    assert caplog.messages == ["Failed sign-in: ip=testclient method=password"] * 2
    assert _entries() == [("sign_in", admin_id, {"method": "password"})]


def test_two_step_codes_are_audited_and_wrong_ones_logged(caplog):
    seed_family()
    secret = turn_on_two_step(ADMIN_EMAIL)
    client = new_client()
    token = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": PASSWORD}).json()["mfa_token"]

    with caplog.at_level(logging.WARNING, logger="tribu.security"):
        assert client.post("/auth/login/mfa", json={"mfa_token": token, "code": "000000"}).status_code == 400
    code = mfa.totp_code(secret, mfa.current_step())
    assert client.post("/auth/login/mfa", json={"mfa_token": token, "code": code}).status_code == 200

    assert caplog.messages == ["Failed sign-in: ip=testclient method=two-step"]
    assert [(action, details) for action, _, details in _entries()] == [
        ("sign_in_failed", {"method": "two-step"}),
        ("sign_in", {"method": "two-step"}),
    ]
