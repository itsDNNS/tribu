from fastapi import Depends, HTTPException, Request, status
from app.core.errors import error_detail, INSUFFICIENT_SCOPE

SCOPE_DESCRIPTIONS: dict[str, str] = {
    "*": "Full access to all resources (wildcard)",
    "calendar:read": "View calendar events and export ICS",
    "calendar:write": "Create, update, and delete calendar events; import ICS",
    "tasks:read": "View tasks",
    "tasks:write": "Create, update, and delete tasks",
    "contacts:read": "View contacts and export CSV",
    "contacts:write": "Create contacts and import CSV",
    "birthdays:read": "View birthdays",
    "birthdays:write": "Create birthdays",
    "families:read": "View family members, invitations, and audit log",
    "families:write": "Manage members, invitations, roles, and passwords",
    "shopping:read": "View shopping lists and items",
    "shopping:write": "Create, update, and delete shopping lists and items",
    "profile:read": "View own profile and list personal access tokens",
    "profile:write": "Update profile image, change password, manage tokens",
    "rewards:read": "View reward system data (currencies, rules, catalog, transactions, balances)",
    "rewards:write": "Manage rewards, earning rules, and transactions",
    "gifts:read": "View gift list entries and price history",
    "gifts:write": "Create, update, and delete gift list entries",
    "meal_plans:read": "View weekly meal plans",
    "meal_plans:write": "Create, update, and delete meal plan entries; push ingredients to shopping lists",
    "admin:read": "View backup config, admin settings, and system status",
    "admin:write": "Manage backups, update admin settings, and trigger system operations",
}

VALID_SCOPES = set(SCOPE_DESCRIPTIONS.keys())


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
                detail=error_detail(INSUFFICIENT_SCOPE, scope=scope),
            )
    return Depends(_check)
