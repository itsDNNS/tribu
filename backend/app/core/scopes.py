from fastapi import Depends, HTTPException, Request, status

VALID_SCOPES = {
    "*",
    "calendar:read", "calendar:write",
    "tasks:read", "tasks:write",
    "contacts:read", "contacts:write",
    "birthdays:read", "birthdays:write",
    "families:read", "families:write",
    "shopping:read", "shopping:write",
    "profile:read", "profile:write",
}


def parse_scopes(raw: str) -> set[str]:
    return {s.strip() for s in raw.split(",") if s.strip()}


def has_scope(granted: set[str], required: str) -> bool:
    if "*" in granted:
        return True
    return required in granted


def require_scope(scope: str):
    def _check(request: Request):
        pat_scopes = getattr(request.state, "pat_scopes", None)
        if pat_scopes is None:
            return
        if not has_scope(pat_scopes, scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Token fehlt Berechtigung: {scope}",
            )
    return Depends(_check)
