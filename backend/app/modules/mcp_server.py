"""MCP (Model Context Protocol) endpoint at ``/mcp``.

MCP clients connect over Streamable HTTP with a Personal Access Token.
Instead of one tool per REST endpoint, the server offers a small gateway
driven by the app's own OpenAPI schema:

* ``whoami``: the token, its scopes and the caller's families
* ``list_operations``: what the token may use, grouped by area
* ``describe_operation``: parameters and request body schema of one operation
* ``call_operation``: run one operation

``call_operation`` does not reimplement anything. It sends the request to
this same FastAPI app in-process with the caller's own ``Authorization``
header, so authentication, PAT scopes, family boundaries, adult/admin checks,
validation and rate limits all apply exactly as for a direct API call.

Security notes:

* Only ``tribu_pat_`` bearer tokens are accepted. Cookies, JWTs and display
  tokens get 401 before the MCP layer runs, and cookies are never forwarded,
  so a browser cannot ride an existing session (no CSRF surface).
* Host/Origin (DNS rebinding) checks of the SDK are off: there are no
  ambient credentials to abuse, and self-hosted instances sit behind reverse
  proxies with arbitrary host names.
* The internal request is built from the operation's path template. The
  model only supplies parameter values, never a path.
* The internal request carries the caller's real address (resolved with the
  same trusted-proxy rules as the rate limiter) as its client address and no
  ``X-Forwarded-For`` header, so per-client rate limits keep working and an
  MCP client cannot pick its own bucket.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx2
from fastapi import FastAPI, HTTPException
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from app.core.config import VERSION
from app.core.deps import _find_pat, _resolve_user
from app.core.errors import UNAUTHENTICATED, error_detail
from app.core.mcp_catalog import Catalog, Operation, build_catalog, describe
from app.database import get_db
from app.models import Membership
from app.security import is_pat

MCP_PATH = "/mcp"
STATE_KEY = "tribu_mcp_caller"
MAX_RESPONSE_CHARS = 60_000
# Bodies above this size are not parsed at all; only their start is shown.
MAX_RESPONSE_BYTES = 4 * MAX_RESPONSE_CHARS

INSTRUCTIONS = """\
Tribu is a self-hosted family organizer (calendar, tasks, shopping, meals,
recipes, contacts, birthdays, gifts, rewards and more). Tools:
1. whoami: your token's scopes and your families (most operations need a family_id).
2. list_operations: without an area, a short overview; with an area, its operations.
3. describe_operation: parameters and body schema before calling.
4. call_operation: runs one operation and returns the HTTP status and JSON.
The token's scopes decide what is allowed. Deletes are permanent; confirm with
the user before deleting or changing many things.
"""


@dataclass(frozen=True)
class Caller:
    authorization: str
    user_id: int
    display_name: str
    token_name: str
    token_expires_at: str | None
    scopes: frozenset[str]
    client_host: str
    base_url: str
    forwarded: tuple[tuple[str, str], ...]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HOST_RE = re.compile(r"^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$")


def _db_session(app: FastAPI):
    """Open a session the same way endpoints get one (respects test overrides)."""
    factory = app.dependency_overrides.get(get_db, get_db)
    generator = factory()
    db = next(generator)
    return db, generator


def _bearer_pat(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or not is_pat(token):
        return None
    return token


def _unauthorized(detail: Any) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": 'Bearer realm="tribu"'},
    )


def _base_url(request: Request) -> str:
    host = request.headers.get("host", "")
    if not _HOST_RE.match(host):
        host = "localhost"
    scheme = "https" if request.url.scheme == "https" else "http"
    return f"{scheme}://{host}"


def _caller(ctx: Context) -> Caller:
    try:
        request = ctx.request_context.request
        caller = getattr(request.state, STATE_KEY, None) if request is not None else None
    except (AttributeError, ValueError):
        caller = None
    if not isinstance(caller, Caller):
        raise ToolError("Not authenticated.")
    return caller


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _path_value(name: str, value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ToolError(f"Path parameter '{name}' must be a string or an integer.")
    text = str(value)
    # Values fill exactly one path segment. Slashes and dot segments could
    # otherwise point the request at a different route once the server
    # decodes the path.
    if text in ("", ".", "..") or "/" in text or "\\" in text or any(ord(ch) < 32 for ch in text):
        raise ToolError(f"Path parameter '{name}' has an invalid value.")
    return quote(text, safe="")


def build_path(op: Operation, path_params: dict[str, Any] | None) -> str:
    """Fill the operation's path template. Unknown or missing names fail."""
    supplied = dict(path_params or {})
    unknown = sorted(set(supplied) - set(op.path_params))
    missing = sorted(set(op.path_params) - set(supplied))
    if unknown:
        raise ToolError(f"Unknown path parameter(s) for {op.name}: {', '.join(unknown)}.")
    if missing:
        raise ToolError(f"Missing path parameter(s) for {op.name}: {', '.join(missing)}.")
    path = op.path
    for name in op.path_params:
        path = re.sub(r"{" + re.escape(name) + r"(?::[^}]*)?}", lambda _m: _path_value(name, supplied[name]), path)
    return path


def build_query(op: Operation, query: dict[str, Any] | None) -> list[tuple[str, str]]:
    supplied = dict(query or {})
    unknown = sorted(set(supplied) - set(op.query_params))
    if unknown:
        raise ToolError(f"Unknown query parameter(s) for {op.name}: {', '.join(unknown)}.")
    pairs: list[tuple[str, str]] = []
    for name, value in supplied.items():
        values = value if isinstance(value, list) else [value]
        for item in values:
            if item is None:
                continue
            if isinstance(item, bool):
                pairs.append((name, "true" if item else "false"))
            elif isinstance(item, (str, int, float)):
                pairs.append((name, str(item)))
            else:
                raise ToolError(f"Query parameter '{name}' must be a scalar or a list of scalars.")
    return pairs


def _truncate(result: dict[str, Any], text: str, label: str) -> dict[str, Any]:
    if len(text) <= MAX_RESPONSE_CHARS:
        return result
    result.pop("body", None)
    result["truncated"] = True
    result["body_text"] = text[:MAX_RESPONSE_CHARS]
    result["note"] = (
        f"The {label} was {len(text)} characters; only the first {MAX_RESPONSE_CHARS} are shown. "
        "Ask for less, for example with limit/offset, date range or other filter parameters."
    )
    return result


def response_payload(response: httpx2.Response) -> dict[str, Any]:
    content_type = response.headers.get("content-type", "")
    result: dict[str, Any] = {"status": response.status_code, "ok": response.is_success}
    if not response.content:
        result["body"] = None
        return result
    if len(response.content) > MAX_RESPONSE_BYTES and (content_type.startswith("text/") or "json" in content_type):
        result["content_type"] = content_type
        result["truncated"] = True
        result["body_text"] = response.content[:MAX_RESPONSE_CHARS].decode(response.encoding or "utf-8", errors="replace")
        result["note"] = (
            f"The response was {len(response.content)} bytes; only its start is shown. "
            "Ask for less, for example with limit/offset, date range or other filter parameters."
        )
        return result
    if "json" in content_type:
        try:
            data = response.json()
        except ValueError:
            data = None
        else:
            result["body"] = data
            return _truncate(result, _dump(data), "response")
    if content_type.startswith("text/") or "json" in content_type:
        text = response.text
        result["content_type"] = content_type
        result["body"] = text
        return _truncate(result, text, "response")
    result["content_type"] = content_type
    result["body"] = None
    result["note"] = f"Binary response of {len(response.content)} bytes is not shown."
    return result


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------


class McpEndpoint:
    """ASGI app for ``/mcp``: PAT gate in front of a stateless MCP server."""

    def __init__(self, app: FastAPI, client_key: Callable[[Request], str]):
        self.app = app
        self.client_key = client_key
        # SlowAPI's middleware looks up the endpoint by module and name.
        self.__name__ = "mcp_endpoint"
        self._catalog: Catalog | None = None
        # The MCP SDK calls logging.basicConfig() with this level. WARNING
        # keeps the backend's current logging output unchanged.
        self.server = MCPServer(name="tribu", version=VERSION, instructions=INSTRUCTIONS, log_level="WARNING")
        self._register_tools()

    @property
    def catalog(self) -> Catalog:
        if self._catalog is None:
            self._catalog = build_catalog(self.app)
        return self._catalog

    # -- authentication ----------------------------------------------------

    def _authenticate(self, request: Request, token: str) -> Caller:
        db, generator = _db_session(self.app)
        try:
            user = _resolve_user(request, token, db)
            pat = _find_pat(db, token)
            if pat is None:
                raise HTTPException(status_code=401, detail=error_detail(UNAUTHENTICATED))
            scopes = request.state.pat_scopes or set()
            return Caller(
                authorization=f"Bearer {token}",
                user_id=user.id,
                display_name=user.display_name,
                token_name=pat.name,
                token_expires_at=pat.expires_at.isoformat() if pat.expires_at else None,
                scopes=frozenset(scopes),
                client_host=self.client_key(request) or "unknown",
                base_url=_base_url(request),
                forwarded=tuple(
                    (name, request.headers[name])
                    for name in ("x-forwarded-proto", "x-forwarded-host")
                    if name in request.headers
                ),
            )
        finally:
            generator.close()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return
        if scope["method"] != "POST":
            # Stateless JSON mode has no server-to-client stream (GET) and no
            # session to end (DELETE). Answer 405 instead of holding a GET open.
            await JSONResponse({"detail": "Method Not Allowed"}, status_code=405, headers={"Allow": "POST"})(scope, receive, send)
            return
        request = Request(scope)
        token = _bearer_pat(request)
        if token is None:
            await _unauthorized(error_detail(UNAUTHENTICATED))(scope, receive, send)
            return
        try:
            caller = await run_in_threadpool(self._authenticate, request, token)
        except HTTPException as exc:
            await _unauthorized(exc.detail)(scope, receive, send)
            return
        state = dict(scope.get("state") or {})
        state[STATE_KEY] = caller
        await self._serve({**scope, "state": state}, receive, send)

    async def _serve(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Stateless mode keeps nothing between requests, so a fresh session
        # manager per request is cheap and needs no app lifespan wiring
        # (FastAPI does not run lifespans of mounted sub-apps). It also works
        # with several workers.
        self.server.streamable_http_app(
            streamable_http_path=MCP_PATH,
            json_response=True,
            stateless_http=True,
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        manager = self.server.session_manager
        async with manager.run():
            await manager.handle_request(scope, receive, send)

    # -- in-process API call -----------------------------------------------

    async def call(self, caller: Caller, op: Operation, path: str, query: list[tuple[str, str]], body: Any) -> httpx2.Response:
        headers = {"authorization": caller.authorization, "accept": "application/json", **dict(caller.forwarded)}
        transport = httpx2.ASGITransport(
            app=self.app,
            client=(caller.client_host, 0),
            raise_app_exceptions=False,
        )
        async with httpx2.AsyncClient(transport=transport, base_url=caller.base_url, trust_env=False) as client:
            if op.body is not None and body is not None:
                return await client.request(op.method, path, params=query, json=body, headers=headers)
            return await client.request(op.method, path, params=query, headers=headers)

    # -- tools ---------------------------------------------------------------

    def _register_tools(self) -> None:
        server = self.server
        read_only = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)

        @server.tool(annotations=read_only, structured_output=False)
        async def whoami(ctx: Context) -> str:
            """Show the signed-in user, the token's scopes and the user's families (family_id, name, role, adult)."""
            caller = _caller(ctx)

            def _families() -> list[dict[str, Any]]:
                db, generator = _db_session(self.app)
                try:
                    memberships = (
                        db.query(Membership)
                        .filter(Membership.user_id == caller.user_id)
                        .order_by(Membership.family_id)
                        .all()
                    )
                    return [
                        {
                            "family_id": m.family_id,
                            "family_name": m.family.name if m.family else None,
                            "role": m.role,
                            "is_adult": m.is_adult,
                        }
                        for m in memberships
                    ]
                finally:
                    generator.close()

            return _dump({
                "user_id": caller.user_id,
                "display_name": caller.display_name,
                "token": {
                    "name": caller.token_name,
                    "scopes": sorted(caller.scopes),
                    "expires_at": caller.token_expires_at,
                },
                "families": await run_in_threadpool(_families),
            })

        @server.tool(annotations=read_only, structured_output=False)
        async def list_operations(ctx: Context, area: str | None = None) -> str:
            """List the API operations this token may use.

            Without `area`: an overview of areas with operation counts. With `area`
            (for example "tasks", "shopping", "calendar"): name, method, path,
            summary and required scope of each operation in that area.
            """
            caller = _caller(ctx)
            allowed = self.catalog.allowed(set(caller.scopes))
            if area is None or not area.strip():
                counts: dict[str, int] = {}
                for op in allowed:
                    counts[op.area] = counts.get(op.area, 0) + 1
                return _dump({
                    "areas": [{"area": name, "operations": counts[name]} for name in sorted(counts)],
                    "total": len(allowed),
                    "hint": "Call list_operations with an area to see its operations.",
                })
            wanted = area.strip().lower().replace("_", "-")
            ops = [op.overview() for op in allowed if op.area == wanted]
            if not ops:
                areas = sorted({op.area for op in allowed})
                raise ToolError(f"No operations in area '{area}' for this token. Areas: {', '.join(areas) or 'none'}.")
            return _dump({"area": wanted, "operations": ops})

        @server.tool(annotations=read_only, structured_output=False)
        async def describe_operation(ctx: Context, name: str) -> str:
            """Describe one operation: path and query parameters and the JSON request body schema."""
            _caller(ctx)
            op = self.catalog.get(name)
            if op is None:
                raise ToolError(f"Unknown operation '{name}'. Use list_operations to find operation names.")
            return _dump(describe(op, self.catalog.components))

        @server.tool(
            annotations=ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False),
            structured_output=False,
        )
        async def call_operation(
            ctx: Context,
            name: str,
            path_params: dict[str, Any] | None = None,
            query: dict[str, Any] | None = None,
            body: Any = None,
        ) -> str:
            """Run one operation and return its HTTP status and response.

            `path_params` fills placeholders in the path (for example {"task_id": 12}),
            `query` holds query parameters (most operations need "family_id"), and
            `body` is the JSON request body for operations that take one. The token's
            scopes and the user's role in the family decide what succeeds.
            """
            caller = _caller(ctx)
            op = self.catalog.get(name)
            if op is None:
                raise ToolError(f"Unknown operation '{name}'. Use list_operations to find operation names.")
            path = build_path(op, path_params)
            params = build_query(op, query)
            if body is not None and op.body is None:
                raise ToolError(f"Operation {op.name} does not take a request body.")
            response = await self.call(caller, op, path, params, body)
            payload = await run_in_threadpool(response_payload, response)
            return _dump({"operation": op.name, **payload})


def create_mcp_endpoint(app: FastAPI, client_key: Callable[[Request], str]) -> McpEndpoint:
    return McpEndpoint(app, client_key)
