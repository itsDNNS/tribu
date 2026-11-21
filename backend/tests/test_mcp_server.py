"""MCP endpoint at /mcp: PAT-only auth, scope filtering, exclusions and
in-process calls through the real REST endpoints."""

import json
from datetime import timedelta

import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.core.config import COOKIE_NAME
from app.core.mcp_catalog import EXCLUDED_PATHS, build_catalog, exclusion_reason
from app.core.scopes import VALID_SCOPES
from app.core.utils import utcnow
from app.main import app
from app.models import PersonalAccessToken, Task
from app.modules import mcp_server
from app.security import PAT_PREFIX, create_access_token
from tests.support import TestSession, add_pat, seed_member

ACCEPT = "application/json, text/event-stream"

pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _family_with_admin(name: str, email: str) -> tuple[int, int]:
    member = seed_member(email, scopes=None, family_name=name, display_name=f"{name} Admin")
    return member.user_id, member.family_id


def _token(user_id: int, scopes: str, label: str, **fields) -> str:
    with TestSession() as db:
        plain = add_pat(db, user_id, scopes, name=f"mcp-{label}", **fields)
        db.commit()
    return plain


def _task(family_id: int, title: str) -> int:
    db = TestSession()
    task = Task(family_id=family_id, title=title)
    db.add(task)
    db.commit()
    task_id = task.id
    db.close()
    return task_id


# ---------------------------------------------------------------------------
# JSON-RPC helpers (raw protocol over the ASGI app)
# ---------------------------------------------------------------------------


def _rpc(token: str | None, method: str, params: dict | None = None, *, headers: dict | None = None, cookies=None):
    sent = {"Accept": ACCEPT, "Content-Type": "application/json", **(headers or {})}
    if token:
        sent["Authorization"] = f"Bearer {token}"
    test_client = TestClient(app, cookies=cookies) if cookies else client
    return test_client.post(
        "/mcp",
        content=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}),
        headers=sent,
    )


def _tool(token: str, name: str, arguments: dict | None = None, **kwargs) -> tuple[bool, object]:
    response = _rpc(token, "tools/call", {"name": name, "arguments": arguments or {}}, **kwargs)
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    text = result["content"][0]["text"]
    if result.get("isError"):
        return True, text
    return False, json.loads(text)


def _ok(token: str, name: str, arguments: dict | None = None, **kwargs):
    is_error, payload = _tool(token, name, arguments, **kwargs)
    assert not is_error, payload
    return payload


def _error(token: str, name: str, arguments: dict | None = None) -> str:
    is_error, payload = _tool(token, name, arguments)
    assert is_error, payload
    return payload


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestAuthentication:
    def test_missing_token_is_rejected(self):
        response = _rpc(None, "tools/list")
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Bearer")

    def test_jwt_is_rejected(self):
        user_id, _ = _family_with_admin("JWT Family", "jwt@example.com")
        jwt_token = create_access_token(user_id=user_id, email="jwt@example.com")
        assert _rpc(jwt_token, "tools/list").status_code == 401

    def test_session_cookie_is_rejected(self):
        user_id, _ = _family_with_admin("Cookie Family", "cookie@example.com")
        jwt_token = create_access_token(user_id=user_id, email="cookie@example.com")
        response = _rpc(None, "tools/list", cookies={COOKIE_NAME: jwt_token})
        assert response.status_code == 401

    def test_unknown_pat_is_rejected(self):
        assert _rpc(f"{PAT_PREFIX}does-not-exist", "tools/list").status_code == 401

    def test_expired_pat_is_rejected(self):
        user_id, _ = _family_with_admin("Expired Family", "expired@example.com")
        token = _token(user_id, "*", "expired", expires_at=utcnow() - timedelta(minutes=1))
        response = _rpc(token, "tools/list")
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "TOKEN_EXPIRED"

    def test_revoked_pat_is_rejected(self):
        user_id, _ = _family_with_admin("Revoked Family", "revoked@example.com")
        token = _token(user_id, "*", "revoked")
        assert _rpc(token, "tools/list").status_code == 200
        db = TestSession()
        db.query(PersonalAccessToken).filter(PersonalAccessToken.name == "mcp-revoked").delete()
        db.commit()
        db.close()
        assert _rpc(token, "tools/list").status_code == 401

    def test_display_token_is_rejected(self):
        assert _rpc("tribu_display_abc", "tools/list").status_code == 401

    def test_valid_pat_can_initialize_and_list_tools(self):
        user_id, _ = _family_with_admin("Init Family", "init@example.com")
        token = _token(user_id, "tasks:read", "init")
        init = _rpc(token, "initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "pytest", "version": "1"},
        })
        assert init.status_code == 200, init.text
        assert init.json()["result"]["serverInfo"]["name"] == "tribu"

        tools = _rpc(token, "tools/list")
        assert tools.status_code == 200
        names = {tool["name"] for tool in tools.json()["result"]["tools"]}
        assert names == {"whoami", "list_operations", "describe_operation", "call_operation"}

    @pytest.mark.parametrize("version", ["2025-06-18", "2025-11-25"])
    def test_tool_call_with_protocol_version_header(self, version):
        user_id, _ = _family_with_admin(f"Version Family {version}", f"version-{version}@example.com")
        token = _token(user_id, "tasks:read", f"version-{version}")
        payload = _ok(token, "whoami", headers={"MCP-Protocol-Version": version})
        assert payload["user_id"] == user_id

    @pytest.mark.parametrize("method", ["GET", "DELETE", "PUT"])
    def test_only_post_is_served(self, method):
        user_id, _ = _family_with_admin(f"Method Family {method}", f"method-{method}@example.com")
        token = _token(user_id, "tasks:read", f"method-{method}")
        response = client.request(method, "/mcp", headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"})
        assert response.status_code == 405
        assert response.headers["allow"] == "POST"

    def test_arbitrary_host_header_is_accepted(self):
        """Reverse proxies forward any host name; only the bearer token matters."""
        user_id, _ = _family_with_admin("Host Family", "host@example.com")
        token = _token(user_id, "tasks:read", "host")
        response = _rpc(token, "tools/list", headers={"Host": "tribu.home.example"})
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Catalog and exclusions
# ---------------------------------------------------------------------------


EXCLUDED_NAMES = {
    "login", "logout", "register", "refresh_session", "mobile_login", "mobile_refresh",
    "change_password", "delete_account", "leave_family", "remove_member",
    "mfa_setup", "mfa_confirm", "mfa_disable", "mfa_status",
    "create_token", "list_tokens", "revoke_token",
    "create_member", "reset_member_password", "reset_member_mfa",
    "setup_status", "setup_restore", "health", "root",
    "display_me", "display_dashboard", "create_display_device",
    "get_oidc_config", "update_oidc_config", "test_discovery", "get_presets",
    "start_login", "callback", "public_config", "mobile_exchange",
    "download_backup", "notification_stream", "calendar_feed_ics", "contacts_feed_vcf",
    "register_with_invite", "get_invite_info", "well_known_caldav", "well_known_carddav",
    "mobile_daily_snapshot",
}


class TestCatalog:
    def test_every_operation_is_user_authenticated_and_scoped(self):
        catalog = build_catalog(app)
        spec = app.openapi()
        assert len(catalog.operations) > 100
        for op in catalog.operations.values():
            assert op.scope in VALID_SCOPES - {"*"}, op.name
            openapi_op = spec["paths"][op.path][op.method.lower()]
            assert openapi_op.get("security") == [{"BearerAuth": []}], op.name
            assert exclusion_reason(op.method, op.path, openapi_op.get("tags", [])) is None

    def test_names_are_unique_and_readable(self):
        catalog = build_catalog(app)
        assert "list_tasks" in catalog.operations
        assert "delete_task" in catalog.operations
        assert all(name.isidentifier() for name in catalog.operations)

    def test_excluded_operations_are_not_in_catalog(self):
        catalog = build_catalog(app)
        assert not EXCLUDED_NAMES & set(catalog.operations)
        for op in catalog.operations.values():
            assert not op.path.startswith(("/auth/me/password", "/auth/me/mfa", "/tokens", "/setup/", "/display/", "/admin/oidc"))
            assert "reset-password" not in op.path

    def test_prefix_rules_respect_segment_boundaries(self):
        assert exclusion_reason("GET", "/setup/status", []) is not None
        assert exclusion_reason("GET", "/setup-checklist", []) is None
        assert exclusion_reason("GET", "/auth/me", []) is None
        assert exclusion_reason("DELETE", "/auth/me", []) is not None
        assert exclusion_reason("PUT", "/admin/settings/two-step", []) is not None
        assert all(reason for _method, _path, reason in EXCLUDED_PATHS)

    def test_excluded_operations_are_not_callable(self):
        user_id, family_id = _family_with_admin("Excluded Family", "excluded@example.com")
        token = _token(user_id, "*", "excluded")
        for name in ("create_token", "change_password", "reset_member_password", "login", "setup_restore", "download_backup"):
            message = _error(token, "call_operation", {"name": name, "query": {"family_id": family_id}})
            assert "Unknown operation" in message
            assert "Unknown operation" in _error(token, "describe_operation", {"name": name})

        db = TestSession()
        assert db.query(PersonalAccessToken).filter(PersonalAccessToken.user_id == user_id).count() == 1
        db.close()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


class TestTools:
    def test_whoami(self):
        user_id, family_id = _family_with_admin("Whoami Family", "whoami@example.com")
        token = _token(user_id, "tasks:read,shopping:read", "whoami")
        payload = _ok(token, "whoami")
        assert payload["user_id"] == user_id
        assert payload["token"]["scopes"] == ["shopping:read", "tasks:read"]
        assert payload["families"] == [{"family_id": family_id, "family_name": "Whoami Family", "role": "admin", "is_adult": True}]

    def test_list_operations_is_filtered_by_scope(self):
        user_id, _ = _family_with_admin("Scope Family", "scope@example.com")
        token = _token(user_id, "tasks:read", "scope-read")
        overview = _ok(token, "list_operations")
        areas = {area["area"]: area["operations"] for area in overview["areas"]}
        assert areas["tasks"] == 1
        assert "shopping" not in areas
        catalog = build_catalog(app)
        assert overview["total"] == sum(1 for op in catalog.operations.values() if op.scope == "tasks:read")
        tasks = _ok(token, "list_operations", {"area": "tasks"})
        assert [op["name"] for op in tasks["operations"]] == ["list_tasks"]
        assert all(op["scope"] == "tasks:read" for op in tasks["operations"])
        assert "No operations in area 'shopping'" in _error(token, "list_operations", {"area": "shopping"})

        writer = _token(user_id, "tasks:read,tasks:write", "scope-write")
        names = {op["name"] for op in _ok(writer, "list_operations", {"area": "tasks"})["operations"]}
        assert names == {"list_tasks", "create_task", "update_task", "delete_task"}

    def test_wildcard_lists_everything_eligible(self):
        user_id, _ = _family_with_admin("Wildcard Family", "wildcard@example.com")
        token = _token(user_id, "*", "wildcard")
        overview = _ok(token, "list_operations")
        assert overview["total"] == len(build_catalog(app).operations)
        assert "tokens" not in {area["area"] for area in overview["areas"]}

    def test_describe_operation_resolves_refs(self):
        user_id, _ = _family_with_admin("Describe Family", "describe@example.com")
        token = _token(user_id, "tasks:read", "describe")
        payload = _ok(token, "describe_operation", {"name": "create_task"})
        assert payload["method"] == "POST"
        assert payload["scope"] == "tasks:write"
        assert payload["body"]["required"] is True
        assert "title" in payload["body"]["schema"]["properties"]
        assert "$ref" not in json.dumps(payload)

        update = _ok(token, "describe_operation", {"name": "update_task"})
        assert update["path_params"] == ["task_id"]

    def test_unknown_operation(self):
        user_id, _ = _family_with_admin("Unknown Family", "unknown@example.com")
        token = _token(user_id, "*", "unknown")
        assert "Unknown operation" in _error(token, "call_operation", {"name": "drop_database"})
        assert "Unknown operation" in _error(token, "describe_operation", {"name": "drop_database"})


# ---------------------------------------------------------------------------
# call_operation through the real endpoints
# ---------------------------------------------------------------------------


class TestCallOperation:
    def test_read_write_delete(self):
        user_id, family_id = _family_with_admin("Crud Family", "crud@example.com")
        token = _token(user_id, "tasks:read,tasks:write", "crud")
        existing = _task(family_id, "Water plants")

        listed = _ok(token, "call_operation", {"name": "list_tasks", "query": {"family_id": family_id}})
        assert listed["status"] == 200
        body = listed["body"]
        items = body["items"] if isinstance(body, dict) else body
        assert [item["title"] for item in items] == ["Water plants"]

        created = _ok(token, "call_operation", {
            "name": "create_task",
            "body": {"family_id": family_id, "title": "Buy milk", "priority": "high"},
        })
        assert created["status"] == 200, created
        new_id = created["body"]["id"]

        updated = _ok(token, "call_operation", {
            "name": "update_task",
            "path_params": {"task_id": new_id},
            "body": {"title": "Buy oat milk"},
        })
        assert updated["status"] == 200
        assert updated["body"]["title"] == "Buy oat milk"

        deleted = _ok(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": existing}})
        assert deleted["status"] == 200

        db = TestSession()
        titles = sorted(t.title for t in db.query(Task).filter(Task.family_id == family_id))
        db.close()
        assert titles == ["Buy oat milk"]

    def test_validation_errors_come_from_the_endpoint(self):
        user_id, family_id = _family_with_admin("Validation Family", "validation@example.com")
        token = _token(user_id, "tasks:write", "validation")
        result = _ok(token, "call_operation", {"name": "create_task", "body": {"family_id": family_id}})
        assert result["status"] == 422

    def test_scope_denied_returns_real_403(self):
        user_id, family_id = _family_with_admin("Denied Family", "denied@example.com")
        token = _token(user_id, "tasks:read", "denied")
        result = _ok(token, "call_operation", {
            "name": "create_task",
            "body": {"family_id": family_id, "title": "Not allowed"},
        })
        assert result["status"] == 403
        assert result["body"]["detail"]["code"] == "INSUFFICIENT_SCOPE"
        db = TestSession()
        assert db.query(Task).count() == 0
        db.close()

    def test_path_param_validation(self):
        user_id, family_id = _family_with_admin("Params Family", "params@example.com")
        token = _token(user_id, "tasks:read,tasks:write", "params")
        assert "Missing path parameter" in _error(token, "call_operation", {"name": "delete_task"})
        assert "Unknown path parameter" in _error(token, "call_operation", {
            "name": "delete_task", "path_params": {"task_id": 1, "family_id": family_id},
        })
        assert "invalid value" in _error(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": ".."}})
        assert "string or an integer" in _error(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": True}})
        assert "Unknown query parameter" in _error(token, "call_operation", {"name": "list_tasks", "query": {"family": 1}})
        assert "does not take a request body" in _error(token, "call_operation", {
            "name": "delete_task", "path_params": {"task_id": 1}, "body": {"x": 1},
        })

    def test_path_values_cannot_escape_the_template(self):
        user_id, family_id = _family_with_admin("Escape Family", "escape@example.com")
        token = _token(user_id, "tasks:read,tasks:write", "escape")
        task_id = _task(family_id, "Stay")
        for value in (f"{task_id}/../../tokens", "../tokens", "1\\..", "1\n"):
            message = _error(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": value}})
            assert "invalid value" in message
        # A literal percent sign is encoded, so the server sees "..%2Ftokens" as one segment.
        result = _ok(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": "..%2Ftokens"}})
        assert result["status"] == 422
        db = TestSession()
        assert db.query(Task).count() == 1
        db.close()

    def test_family_boundary(self):
        user_a, family_a = _family_with_admin("Family A", "a@example.com")
        _user_b, family_b = _family_with_admin("Family B", "b@example.com")
        task_b = _task(family_b, "Private task of B")
        token = _token(user_a, "*", "boundary")

        listed = _ok(token, "call_operation", {"name": "list_tasks", "query": {"family_id": family_b}})
        assert listed["status"] == 403

        updated = _ok(token, "call_operation", {
            "name": "update_task", "path_params": {"task_id": task_b}, "body": {"title": "Hijacked"},
        })
        assert updated["status"] in (403, 404)

        deleted = _ok(token, "call_operation", {"name": "delete_task", "path_params": {"task_id": task_b}})
        assert deleted["status"] in (403, 404)

        db = TestSession()
        task = db.query(Task).filter(Task.id == task_b).one()
        assert task.title == "Private task of B"
        db.close()
        assert family_a != family_b


# ---------------------------------------------------------------------------
# Forwarded request: credentials, client address for rate limits
# ---------------------------------------------------------------------------


class _RecordingTransport(httpx2.ASGITransport):
    seen: list = []

    async def handle_async_request(self, request):
        _RecordingTransport.seen.append((self.client, dict(request.headers)))
        return await super().handle_async_request(request)


class TestForwarding:
    @pytest.fixture(autouse=True)
    def record(self, monkeypatch):
        _RecordingTransport.seen = []
        monkeypatch.setattr(mcp_server.httpx2, "ASGITransport", _RecordingTransport)

    def _call(self, test_client: TestClient, token: str, family_id: int, headers: dict):
        response = test_client.post(
            "/mcp",
            content=json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "call_operation", "arguments": {"name": "list_tasks", "query": {"family_id": family_id}}},
            }),
            headers={"Accept": ACCEPT, "Content-Type": "application/json", "Authorization": f"Bearer {token}", **headers},
            cookies={COOKIE_NAME: "cookie-must-not-travel"},
        )
        assert response.status_code == 200, response.text
        return _RecordingTransport.seen[-1]

    def test_untrusted_peer_cannot_choose_its_rate_limit_key(self):
        user_id, family_id = _family_with_admin("Spoof Family", "spoof@example.com")
        token = _token(user_id, "tasks:read", "spoof")
        remote = TestClient(app, client=("198.51.100.7", 40000))
        client_addr, headers = self._call(remote, token, family_id, {"X-Forwarded-For": "203.0.113.99"})
        assert client_addr[0] == "198.51.100.7"
        assert "x-forwarded-for" not in headers
        assert "cookie" not in headers
        assert headers["authorization"] == f"Bearer {token}"

    def test_trusted_proxy_forwards_the_real_client(self, monkeypatch):
        monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
        user_id, family_id = _family_with_admin("Proxy Family", "proxy@example.com")
        token = _token(user_id, "tasks:read", "proxy")
        proxy = TestClient(app, client=("127.0.0.1", 40000))
        client_addr, headers = self._call(proxy, token, family_id, {"X-Forwarded-For": "203.0.113.5, 10.0.0.1"})
        assert client_addr[0] == "203.0.113.5"
        assert "x-forwarded-for" not in headers


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class TestResponsePayload:
    def test_large_json_is_truncated_with_note(self):
        big = [{"i": i, "text": "x" * 100} for i in range(2000)]
        response = httpx2.Response(200, json=big)
        payload = mcp_server.response_payload(response)
        assert payload["truncated"] is True
        assert len(payload["body_text"]) == mcp_server.MAX_RESPONSE_CHARS
        assert "limit/offset" in payload["note"]
        assert "body" not in payload

    def test_oversized_body_is_not_parsed(self, monkeypatch):
        big = b'[' + b','.join(b'{"text":"' + b"x" * 100 + b'"}' for _ in range(3000)) + b']'
        assert len(big) > mcp_server.MAX_RESPONSE_BYTES
        response = httpx2.Response(200, content=big, headers={"content-type": "application/json"})

        def no_parse(*_args, **_kwargs):
            raise AssertionError("oversized bodies must not be parsed")

        monkeypatch.setattr(httpx2.Response, "json", no_parse)
        payload = mcp_server.response_payload(response)
        assert payload["truncated"] is True
        assert len(payload["body_text"]) == mcp_server.MAX_RESPONSE_CHARS
        assert f"{len(big)} bytes" in payload["note"]
        assert "body" not in payload

    def test_text_and_binary(self):
        text = mcp_server.response_payload(httpx2.Response(200, text="BEGIN:VCALENDAR", headers={"content-type": "text/calendar"}))
        assert text["body"] == "BEGIN:VCALENDAR"
        binary = mcp_server.response_payload(httpx2.Response(200, content=b"\x00\x01", headers={"content-type": "application/octet-stream"}))
        assert binary["body"] is None and "2 bytes" in binary["note"]

    def test_empty_response(self):
        assert mcp_server.response_payload(httpx2.Response(204)) == {"status": 204, "ok": True, "body": None}


# ---------------------------------------------------------------------------
# Official SDK client end to end
# ---------------------------------------------------------------------------


def test_sdk_client_round_trip():
    user_id, family_id = _family_with_admin("SDK Family", "sdk@example.com")
    token = _token(user_id, "tasks:read,tasks:write", "sdk")

    async def scenario():
        http_client = httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            base_url="http://tribu.test",
            headers={"Authorization": f"Bearer {token}"},
        )
        async with http_client, Client(streamable_http_client("http://tribu.test/mcp", http_client=http_client)) as mcp:
            tools = await mcp.list_tools()
            created = await mcp.call_tool("call_operation", {
                "name": "create_task",
                "body": {"family_id": family_id, "title": "From the SDK"},
            })
            return {tool.name for tool in tools.tools}, created

    names, created = anyio.run(scenario)
    assert names == {"whoami", "list_operations", "describe_operation", "call_operation"}
    assert not created.is_error
    payload = json.loads(created.content[0].text)
    assert payload["status"] == 200
    assert payload["body"]["title"] == "From the SDK"
