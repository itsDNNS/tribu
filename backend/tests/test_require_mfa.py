"""The instance admin can require two-step sign-in for every account with a password."""
import pytest

from app.core import mfa
from app.core.utils import set_setting
from app.models import User
from tests.oidc_support import seed_user
from tests.support import (
    ADMIN_EMAIL, MEMBER_EMAIL, PASSWORD, TestSession, add_pat, auth, login, new_client, seed_family, turn_on_two_step,
)


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


def _require(client, required=True):
    return client.put("/admin/settings/two-step", json={"required": required})


def _signed_in_admin():
    admin = new_client()
    login(admin, ADMIN_EMAIL)
    return admin


def test_until_set_up_a_session_reaches_only_the_setup():
    _, _, member_id = seed_family()
    admin = _signed_in_admin()
    assert _require(admin).json()["detail"]["code"] == "MFA_SET_UP_YOURSELF_FIRST"
    turn_on_two_step(ADMIN_EMAIL)
    assert _require(admin).json() == {"required": True}
    member = new_client()
    assert login(member, MEMBER_EMAIL).status_code == 200

    blocked = member.get("/families/me")
    assert (blocked.status_code, blocked.json()["detail"]["code"]) == (403, "MFA_SETUP_REQUIRED")
    assert member.get("/auth/me").json()["mfa_setup_required"] is True
    assert member.get("/auth/me/mfa").json()["required"] is True
    assert member.post("/auth/me/mfa/setup", json={"password": PASSWORD}).status_code == 200

    with TestSession() as db:
        token = add_pat(db, member_id)
        db.commit()
    assert new_client().get("/families/me", headers=auth(token)).status_code == 200  # tokens are exempt

    turn_on_two_step(MEMBER_EMAIL)
    assert member.get("/families/me").status_code == 200

    assert _require(admin, False).json() == {"required": False}


def test_required_two_step_stays_on_and_mobile_must_set_it_up_on_the_web():
    seed_family()
    admin = _signed_in_admin()
    turn_on_two_step(ADMIN_EMAIL)
    _require(admin)

    mobile = new_client().post("/auth/mobile-login", json={"email": MEMBER_EMAIL, "password": PASSWORD})
    assert (mobile.status_code, mobile.json()["detail"]["code"]) == (401, "MFA_SETUP_REQUIRED")
    assert admin.post("/auth/me/mfa/disable", json={"password": PASSWORD, "code": "000000"}).status_code == 409


def test_only_the_instance_admin_sets_it_and_sso_only_accounts_are_exempt():
    seed_family()
    member = new_client()
    login(member, MEMBER_EMAIL)
    assert _require(member).status_code == 403

    with TestSession() as db:
        set_setting(db, mfa.REQUIRED_SETTING, "true")
        sso_only = db.get(User, seed_user("sso@example.com", "SSO", password=None))
        assert mfa.setup_required(db, sso_only) is False
