"""Integration tests for the Radicale mount and PAT auth plugin."""
from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.core.clock import utcnow
from app.database import SessionLocal
from app.models import PersonalAccessToken
from app.schemas import PATResponse
from app.security import PAT_PREFIX
from tests.support import add_member, add_pat, add_user, dav_basic, token_digest


def _seed_pat(email: str, scopes: str) -> str:
    """A user without a family and a PAT with ``scopes``; returns the token."""
    with SessionLocal() as db:
        token = add_pat(db, add_user(db, email).id, scopes)
        db.commit()
    return token


def _seed_member(email: str, scopes: str) -> tuple[str, int]:
    """A plain member of their own family with a PAT; returns the token and the family id."""
    with SessionLocal() as db:
        member = add_member(db, email, scopes=scopes, role="member", family_name=f"{email} family")
        db.commit()
    return member.token, member.family_id


def _pat_by_token(token: str) -> PersonalAccessToken:
    with SessionLocal() as db:
        pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.token_lookup == token_digest(token)).one()
        db.expunge(pat)
        return pat


def _propfind(client: TestClient, path: str, *, headers=None):
    # Standard CalDAV discovery PROPFIND with Depth=0.
    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
    )
    h = {"Depth": "0", "Content-Type": "application/xml"}
    if headers:
        h.update(headers)
    return client.request("PROPFIND", path, headers=h, content=body)


class TestDavAuth:
    def test_unauthenticated_propfind_returns_401(self, dav_app):
        client = TestClient(dav_app)
        resp = _propfind(client, "/dav/")
        assert resp.status_code == 401
        assert "WWW-Authenticate" in resp.headers

    def test_wrong_token_returns_401(self, dav_app):
        _seed_pat("dav-wrong@example.com", "calendar:read")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-wrong@example.com", PAT_PREFIX + "garbage")}
        resp = _propfind(client, "/dav/dav-wrong@example.com/", headers=headers)
        assert resp.status_code == 401

    def test_valid_pat_with_dav_scope_gets_through(self, dav_app):
        token = _seed_pat("dav-ok@example.com", "calendar:read,contacts:read")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-ok@example.com", token)}
        resp = _propfind(client, "/dav/dav-ok@example.com/", headers=headers)
        # Radicale returns 207 Multi-Status on a successful PROPFIND.
        assert resp.status_code == 207, resp.text

        pat = _pat_by_token(token)
        assert pat.last_dav_success_at is not None
        assert pat.last_dav_failure_at is None
        assert pat.last_dav_failure_reason is None

    def test_root_discovery_returns_current_user_principal(self, dav_app):
        token = _seed_pat("dav-root@example.com", "calendar:read,contacts:read")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-root@example.com", token)}
        resp = _propfind(client, "/dav/", headers=headers)
        assert resp.status_code == 207, resp.text
        assert "/dav/dav-root%40example.com/" in resp.text

    def test_well_known_endpoints_redirect_to_shared_dav_root(self, dav_app):
        client = TestClient(dav_app)
        for path in ("/.well-known/caldav", "/.well-known/carddav"):
            resp = client.request("PROPFIND", path, follow_redirects=False)
            assert resp.status_code == 308, (path, resp.status_code, resp.text)
            assert resp.headers["location"] == "/dav"

    def test_valid_pat_without_dav_scope_is_rejected(self, dav_app):
        """A PAT that only has shopping:read cannot unlock DAV."""
        token = _seed_pat("dav-shop@example.com", "shopping:read")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-shop@example.com", token)}
        resp = _propfind(client, "/dav/dav-shop@example.com/", headers=headers)
        assert resp.status_code == 401

        pat = _pat_by_token(token)
        assert pat.last_dav_success_at is None
        assert pat.last_dav_failure_at is not None
        assert pat.last_dav_failure_reason == "scope_mismatch"

    def test_expired_dav_pat_records_safe_failure_reason(self, dav_app):
        token = _seed_pat("dav-expired@example.com", "calendar:read")
        with SessionLocal() as db:
            pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.token_lookup == token_digest(token)).one()
            pat.expires_at = utcnow() - timedelta(days=1)
            db.commit()

        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-expired@example.com", token)}
        resp = _propfind(client, "/dav/dav-expired@example.com/", headers=headers)
        assert resp.status_code == 401

        pat = _pat_by_token(token)
        assert pat.last_dav_failure_at is not None
        assert pat.last_dav_failure_reason == "token_expired"

    def test_pat_response_sanitizes_unknown_dav_failure_reason(self):
        pat = PersonalAccessToken(
            id=1,
            user_id=1,
            name="DAVx5",
            token_hash="hash",
            token_lookup="lookup",
            scopes="calendar:read",
            last_dav_failure_reason="raw database traceback with secret",
            created_at=utcnow(),
        )

        response = PATResponse.model_validate(pat)

        assert response.last_dav_failure_reason == "unknown"

    def test_wildcard_scope_works(self, dav_app):
        email = "dav-star@example.com"
        token, family_id = _seed_member(email, "*")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic(email, token)}
        allowed = _propfind(client, f"/dav/{email}/cal-{family_id}/", headers=headers)
        assert allowed.status_code == 207

        denied = _propfind(client, f"/dav/{email}/cal-{family_id + 100000}/", headers=headers)
        assert denied.status_code == 403

        discovery = client.request(
            "PROPFIND",
            f"/dav/{email}/",
            headers={**headers, "Depth": "1", "Content-Type": "application/xml"},
            content='<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>',
        )
        assert f"task-{family_id}" not in discovery.text

    def test_task_only_pat_authenticates_and_discovers_tasks(self, dav_app):
        email = "dav-tasks@example.com"
        token, family_id = _seed_member(email, "tasks:read,tasks:write")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic(email, token)}

        discovery = client.request(
            "PROPFIND",
            f"/dav/{email}/",
            headers={**headers, "Depth": "1", "Content-Type": "application/xml"},
            content='<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>',
        )
        assert discovery.status_code == 207, discovery.text
        assert f"task-{family_id}" in discovery.text
        assert f"cal-{family_id}" not in discovery.text
        assert f"book-{family_id}" not in discovery.text

    def test_read_only_scope_cannot_write(self, dav_app):
        """A PAT with only calendar:read can PROPFIND but not PUT."""
        token = _seed_pat("dav-ro@example.com", "calendar:read")
        client = TestClient(dav_app)
        headers = {"Authorization": dav_basic("dav-ro@example.com", token)}

        read = _propfind(client, "/dav/dav-ro@example.com/", headers=headers)
        assert read.status_code == 207

        # A MKCOL attempting to create a calendar collection must fail with 403.
        mkcol = client.request(
            "MKCOL",
            "/dav/dav-ro@example.com/test-calendar/",
            headers={**headers, "Content-Type": "application/xml"},
        )
        assert mkcol.status_code in (401, 403), mkcol.text

    def test_ios_urlencoded_username(self, dav_app):
        """iOS Calendar/Contacts sends the email URL-encoded in the URL path."""
        token = _seed_pat("dav-ios@example.com", "calendar:write")
        client = TestClient(dav_app)
        # The Basic-Auth credential is still the raw email. Radicale's
        # urldecode_username applies to the URL path segment.
        headers = {"Authorization": dav_basic("dav-ios@example.com", token)}
        resp = _propfind(client, "/dav/dav-ios%40example.com/", headers=headers)
        assert resp.status_code == 207, resp.text
