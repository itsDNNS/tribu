"""Catalog of REST operations that the MCP endpoint may expose.

The MCP server does not define one tool per endpoint. It reads the app's own
OpenAPI schema and route table once and offers the operations through a few
gateway tools. This module decides which operations are eligible, names them,
and builds compact parameter and body schemas for them.

Eligibility fails closed. An operation is only offered when all of these hold:

* it is a normal API route that authenticates through ``current_user`` (so a
  PAT in the ``Authorization`` header works and every family check applies),
* it declares exactly one PAT scope through ``require_scope``,
* its request body is absent or JSON, and its parameters are path or query
  parameters only,
* it is not on the denylist below.

Anything else (public routes, device-token routes, feed routes that accept a
token in the query string, streaming or file-upload routes, and routes added
later without the usual dependencies) stays out until someone reviews it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, routing

from app.core.deps import current_user
from app.core.scopes import has_scope


# ---------------------------------------------------------------------------
# Denylist. Keep it explicit so a reviewer can read it top to bottom.
# ---------------------------------------------------------------------------

# Whole OpenAPI tags that never belong on MCP.
EXCLUDED_TAGS: dict[str, str] = {
    "tokens": "personal access token management; an MCP client must not mint or revoke its own credentials",
    "sso": "single sign-on login flow",
    "setup": "initial setup and restore on an empty instance",
    "health": "health and service info, no user data",
}

# (method or "*", path template or prefix, reason). A prefix matches the path
# itself and anything below it on a "/" boundary, so "/setup" does not match
# "/setup-checklist".
EXCLUDED_PATHS: tuple[tuple[str, str, str], ...] = (
    # Authentication and sessions.
    ("*", "/auth/login", "password login"),
    ("*", "/auth/logout", "session logout"),
    ("*", "/auth/register", "account registration"),
    ("*", "/auth/register-with-invite", "account registration"),
    ("*", "/auth/refresh", "session refresh"),
    ("*", "/auth/mobile-login", "mobile login"),
    ("*", "/auth/mobile-refresh", "mobile session refresh"),
    ("*", "/auth/mobile-logout", "mobile logout"),
    ("*", "/auth/oidc", "single sign-on flow"),
    ("*", "/auth/me/password", "changes the account password"),
    ("*", "/auth/me/mfa", "two-step sign-in setup"),
    # Account lifecycle: these can delete the account (and with it the token
    # the MCP client is using). Keep them in the web app.
    ("DELETE", "/auth/me", "deletes the user account"),
    ("POST", "/auth/me/leave-family", "can delete the user account and the family"),
    # Members: anything that sets a password or touches two-step sign-in.
    ("POST", "/families/{family_id}/members", "creates an account with a temporary password"),
    ("DELETE", "/families/{family_id}/members/{target_user_id}", "deletes the member's account when this was their only family"),
    ("*", "/families/{family_id}/members/{target_user_id}/reset-password", "resets a password"),
    ("*", "/families/{family_id}/members/{target_user_id}/reset-mfa", "resets two-step sign-in"),
    ("PUT", "/admin/settings/two-step", "turns required two-step sign-in on or off"),
    # Credentials and secrets.
    ("*", "/tokens", "personal access token management"),
    ("POST", "/families/{family_id}/display-devices", "mints a display device token"),
    ("*", "/admin/oidc", "SSO configuration including the client secret"),
    ("*", "/admin/backup/{filename}/download", "full database dump including credential hashes"),
    # Setup wizard, health, devices, DAV, websockets, streams.
    ("*", "/setup", "initial setup and restore"),
    ("*", "/health", "health check"),
    ("*", "/display", "display runtime, authenticated by a device token"),
    ("*", "/dav", "CalDAV/CardDAV"),
    ("*", "/.well-known", "CalDAV/CardDAV discovery"),
    ("*", "/ws", "WebSocket routes"),
    ("*", "/notifications/stream", "server-sent event stream that never ends"),
    ("*", "/calendar/events/feed.ics", "feed that accepts a token in the query string"),
    ("*", "/contacts/feed.vcf", "feed that accepts a token in the query string"),
    ("*", "/mcp", "the MCP endpoint itself"),
)


def exclusion_reason(method: str, path: str, tags: list[str]) -> str | None:
    """Return why an operation is denylisted, or None if it is not."""
    for tag in tags:
        if tag.lower() in EXCLUDED_TAGS:
            return EXCLUDED_TAGS[tag.lower()]
    for rule_method, rule_path, reason in EXCLUDED_PATHS:
        if rule_method != "*" and rule_method != method:
            continue
        if path == rule_path or path.startswith(rule_path.rstrip("/") + "/"):
            return reason
    if path == "/":
        return "service info"
    return None


# ---------------------------------------------------------------------------
# Operation model
# ---------------------------------------------------------------------------

_PATH_PARAM = re.compile(r"{([^}:]+)(?::[^}]*)?}")


@dataclass(frozen=True)
class Operation:
    name: str
    method: str
    path: str
    area: str
    summary: str
    description: str
    scope: str
    path_params: tuple[str, ...]
    query_params: dict[str, dict[str, Any]] = field(default_factory=dict)
    body: dict[str, Any] | None = None
    body_required: bool = False

    def overview(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "method": self.method,
            "path": self.path,
            "summary": self.summary,
            "scope": self.scope,
        }


@dataclass
class Catalog:
    operations: dict[str, Operation]
    components: dict[str, Any]

    def allowed(self, scopes: set[str]) -> list[Operation]:
        return [op for op in self.operations.values() if has_scope(scopes, op.scope)]

    def get(self, name: str) -> Operation | None:
        return self.operations.get(name)


# ---------------------------------------------------------------------------
# Building the catalog
# ---------------------------------------------------------------------------


def _iter_api_routes(app: FastAPI):
    """Yield routes with their effective dependencies (router prefixes and
    router-level dependencies applied)."""
    iter_contexts = getattr(routing, "iter_route_contexts", None)
    if iter_contexts is not None:
        for context in iter_contexts(app.routes):
            if isinstance(context.original_route, routing.APIRoute):
                yield context
        return
    for route in app.routes:  # older FastAPI without route contexts
        if isinstance(route, routing.APIRoute):
            yield route


def _dependency_facts(dependant) -> tuple[set[Any], set[str]]:
    calls: set[Any] = set()
    scopes: set[str] = set()
    stack = [dependant]
    while stack:
        current = stack.pop()
        call = current.call
        if call is not None:
            calls.add(call)
            if getattr(call, "__qualname__", "") == "require_scope.<locals>._check" and call.__closure__:
                scopes.add(call.__closure__[0].cell_contents)
        stack.extend(current.dependencies)
    return calls, scopes


def _area_for(tags: list[str]) -> str:
    return (tags[0] if tags else "other").lower().replace("_", "-")


def build_catalog(app: FastAPI) -> Catalog:
    spec = app.openapi()
    components = spec.get("components", {}).get("schemas", {})
    operations: dict[str, Operation] = {}
    name_counts: dict[str, int] = {}
    candidates: list[tuple[str, str, Any, dict[str, Any], str]] = []

    for route in _iter_api_routes(app):
        if not route.include_in_schema:
            continue
        calls, scopes = _dependency_facts(route.dependant)
        if current_user not in calls or len(scopes) != 1:
            continue
        scope = next(iter(scopes))
        path_item = spec.get("paths", {}).get(route.path_format, {})
        for method in sorted(route.methods or ()):
            op = path_item.get(method.lower())
            if not op:
                continue
            if exclusion_reason(method, route.path_format, op.get("tags", [])):
                continue
            if any(p.get("in") not in ("path", "query") for p in op.get("parameters", [])):
                continue
            content = op.get("requestBody", {}).get("content", {})
            if content and set(content) != {"application/json"}:
                continue
            candidates.append((route.name, method, route, op, scope))
            name_counts[route.name] = name_counts.get(route.name, 0) + 1

    for base_name, method, route, op, scope in candidates:
        # The function name is the readable part of FastAPI's operationId. If
        # two eligible routes ever share it, fall back to the full operationId.
        name = base_name if name_counts[base_name] == 1 else op["operationId"]
        params = op.get("parameters", [])
        path_params = tuple(_PATH_PARAM.findall(route.path_format))
        query_params = {
            p["name"]: {
                "required": bool(p.get("required")),
                "schema": p.get("schema", {}),
                **({"description": p["description"]} if p.get("description") else {}),
            }
            for p in params
            if p.get("in") == "query"
        }
        body_spec = op.get("requestBody")
        body = body_spec["content"]["application/json"].get("schema", {}) if body_spec else None
        operations[name] = Operation(
            name=name,
            method=method,
            path=route.path_format,
            area=_area_for(op.get("tags", [])),
            summary=op.get("summary", ""),
            description=op.get("description", ""),
            scope=scope,
            path_params=path_params,
            query_params=query_params,
            body=body,
            body_required=bool(body_spec and body_spec.get("required")),
        )
    return Catalog(operations=dict(sorted(operations.items())), components=components)


# ---------------------------------------------------------------------------
# Compact schemas
# ---------------------------------------------------------------------------

_DROP_KEYS = {"title", "examples", "example"}


def compact_schema(schema: Any, components: dict[str, Any], _seen: tuple[str, ...] = ()) -> Any:
    """Inline ``$ref``s and drop noise so a model gets a usable, small schema.

    ``anyOf: [X, null]`` becomes X with ``nullable: true``. Recursive models
    are cut at the second visit with a short note.
    """
    if isinstance(schema, list):
        return [compact_schema(item, components, _seen) for item in schema]
    if not isinstance(schema, dict):
        return schema
    ref = schema.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
        ref_name = ref.rsplit("/", 1)[-1]
        if ref_name in _seen:
            return {"type": "object", "note": f"recursive {ref_name}, same shape as above"}
        target = components.get(ref_name, {})
        merged = {**target, **{k: v for k, v in schema.items() if k != "$ref"}}
        return compact_schema(merged, components, (*_seen, ref_name))

    out: dict[str, Any] = {}
    for key, value in schema.items():
        if key in _DROP_KEYS:
            continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {prop: compact_schema(sub, components, _seen) for prop, sub in value.items()}
        else:
            out[key] = compact_schema(value, components, _seen)

    variants = out.get("anyOf")
    if isinstance(variants, list):
        non_null = [v for v in variants if not (isinstance(v, dict) and v.get("type") == "null")]
        if len(non_null) < len(variants):
            out["nullable"] = True
            if len(non_null) == 1 and isinstance(non_null[0], dict):
                del out["anyOf"]
                out = {**non_null[0], **out}
            else:
                out["anyOf"] = non_null
    return out


def describe(op: Operation, components: dict[str, Any]) -> dict[str, Any]:
    return {
        **op.overview(),
        "area": op.area,
        "description": op.description,
        "path_params": list(op.path_params),
        "query_params": {
            name: {**spec, "schema": compact_schema(spec["schema"], components)}
            for name, spec in op.query_params.items()
        },
        "body": (
            {"required": op.body_required, "schema": compact_schema(op.body, components)}
            if op.body is not None
            else None
        ),
    }
