from datetime import date, datetime
from typing import Optional, Union

import binascii
import re

from enum import Enum

from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Shared error response model & reusable OpenAPI response dicts
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    """Standard error response returned by all endpoints on failure."""
    detail: str = Field(..., description="Human-readable error message")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"detail": "Not authenticated"}]
    })


UNAUTHORIZED_RESPONSE = {
    401: {"model": ErrorResponse, "description": "Not authenticated or token expired"},
}
FORBIDDEN_RESPONSE = {
    403: {"model": ErrorResponse, "description": "Insufficient permissions (wrong role or scope)"},
}
NOT_FOUND_RESPONSE = {
    404: {"model": ErrorResponse, "description": "Resource not found"},
}
CONFLICT_RESPONSE = {
    409: {"model": ErrorResponse, "description": "Resource conflict (e.g. email already exists)"},
}
AUTH_RESPONSES = {**UNAUTHORIZED_RESPONSE, **FORBIDDEN_RESPONSE}
CRUD_RESPONSES = {**UNAUTHORIZED_RESPONSE, **FORBIDDEN_RESPONSE, **NOT_FOUND_RESPONSE}
ADMIN_RESPONSES = {**UNAUTHORIZED_RESPONSE, **FORBIDDEN_RESPONSE, **NOT_FOUND_RESPONSE}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    """Register a new user and create their first family."""
    email: EmailStr = Field(..., description="Email address (used for login)")
    password: str = Field(min_length=8, max_length=128, description="Min 8 chars, must contain uppercase letter and digit")
    display_name: str = Field(..., description="Name displayed in the UI")
    family_name: str = Field(..., description="Name of the family to create")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"email": "anna@example.com", "password": "Secure1Pass", "display_name": "Anna", "family_name": "Mueller Family"}]
    })

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    """Authenticate with email and password."""
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(min_length=8, max_length=128, description="Account password")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"email": "anna@example.com", "password": "Secure1Pass"}]
    })


class MeResponse(BaseModel):
    """Current authenticated user profile."""
    user_id: int = Field(..., description="User ID")
    email: str = Field(..., description="Email address")
    display_name: str = Field(..., description="Display name")
    profile_image: Optional[str] = Field(None, description="Base64-encoded profile image or null")
    must_change_password: bool = Field(False, description="True if user must change their temporary password")
    has_completed_onboarding: bool = Field(True, description="True if user has completed the onboarding wizard")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"user_id": 1, "email": "anna@example.com", "display_name": "Anna", "profile_image": None, "must_change_password": False, "has_completed_onboarding": True}]
    })


_PROFILE_IMAGE_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_PROFILE_IMAGE_DATA_URL_RE = re.compile(r"^data:(image/[a-z+]+);base64,(.+)$", re.DOTALL)


class ProfileImageUpdate(BaseModel):
    """Update profile image (base64 data URL)."""
    profile_image: str = Field(..., description="Base64-encoded image data URL (data:image/...;base64,...)")

    @field_validator("profile_image")
    @classmethod
    def validate_profile_image(cls, v: str) -> str:
        import base64

        m = _PROFILE_IMAGE_DATA_URL_RE.match(v)
        if not m:
            raise ValueError("Profile image must be a data URL (data:image/...;base64,...)")

        mime_type = m.group(1)
        if mime_type not in _PROFILE_IMAGE_ALLOWED_MIMES:
            raise ValueError(f"Image type '{mime_type}' not allowed. Allowed: {', '.join(sorted(_PROFILE_IMAGE_ALLOWED_MIMES))}")

        b64_data = m.group(2)
        # Pre-decode size check: base64 encodes 3 bytes into 4 chars
        max_b64_len = (_PROFILE_IMAGE_MAX_BYTES * 4 // 3) + 4
        if len(b64_data) > max_b64_len:
            raise ValueError(f"Image too large. Maximum: {_PROFILE_IMAGE_MAX_BYTES} bytes (2 MB)")

        try:
            decoded = base64.b64decode(b64_data, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Invalid base64 data")

        if len(decoded) > _PROFILE_IMAGE_MAX_BYTES:
            raise ValueError(f"Image too large ({len(decoded)} bytes). Maximum: {_PROFILE_IMAGE_MAX_BYTES} bytes (2 MB)")

        return v


class LeaveFamilyRequest(BaseModel):
    """Leave a family."""
    family_id: int = Field(..., description="ID of the family to leave")


class DeleteAccountRequest(BaseModel):
    """Delete own account. Requires typing 'DELETE' to confirm."""
    confirmation: str = Field(..., description="Must be exactly 'DELETE'")


class ChangePasswordRequest(BaseModel):
    """Change the current user's password."""
    old_password: str = Field(..., description="Current password")
    new_password: str = Field(min_length=8, max_length=128, description="New password (min 8 chars, uppercase + digit required)")

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


# ---------------------------------------------------------------------------
# Families
# ---------------------------------------------------------------------------

class FamilySummary(BaseModel):
    """Family membership entry for the current user."""
    family_id: int = Field(..., description="Family ID")
    family_name: str = Field(..., description="Family name")
    role: str = Field(..., description="User's role in this family: 'admin' or 'member'")
    is_adult: bool = Field(..., description="Whether the user is marked as adult in this family")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "family_name": "Mueller Family", "role": "admin", "is_adult": True}]
    })


class FamilyMemberResponse(BaseModel):
    """Family member details."""
    user_id: int = Field(..., description="User ID")
    display_name: str = Field(..., description="Display name")
    email: str = Field(..., description="Email address")
    role: str = Field(..., description="Role: 'admin' or 'member'")
    is_adult: bool = Field(..., description="Whether this member is an adult")
    color: Optional[str] = Field(None, description="Personal color hex code")
    date_of_birth: Optional[date] = Field(None, description="Date of birth")
    profile_image: Optional[str] = Field(None, description="Profile image (base64 data URL)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"user_id": 2, "display_name": "Max", "email": "max@example.com", "role": "member", "is_adult": True, "color": "#7c3aed"}]
    })


class MemberColorUpdate(BaseModel):
    """Update a member's personal color."""
    color: Optional[str] = Field(None, description="Hex color code from allowed palette, or null to remove")


class MemberRoleUpdate(BaseModel):
    """Update a family member's role."""
    role: str = Field(..., description="New role: 'admin' or 'member'")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"role": "admin"}]
    })


class MemberAdultUpdate(BaseModel):
    """Update a family member's adult status."""
    is_adult: bool = Field(..., description="Whether the member should be marked as adult")


class MemberBirthdateUpdate(BaseModel):
    """Update a family member's date of birth."""
    date_of_birth: Optional[date] = Field(None, description="Date of birth (YYYY-MM-DD), null to clear")


class CreateMemberRequest(BaseModel):
    """Create a new family member (admin only). A temporary password is generated."""
    email: EmailStr = Field(..., description="Email for the new member")
    display_name: str = Field(..., description="Display name")
    role: str = Field("member", description="Role: 'admin' or 'member'")
    is_adult: bool = Field(False, description="Whether the new member is an adult")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"email": "kid@example.com", "display_name": "Lena", "role": "member", "is_adult": False}]
    })


class CreateMemberResponse(BaseModel):
    """Newly created family member with temporary password."""
    user_id: int = Field(..., description="Created user ID")
    email: str = Field(..., description="Email address")
    display_name: str = Field(..., description="Display name")
    role: str = Field(..., description="Assigned role")
    is_adult: bool = Field(..., description="Adult status")
    color: Optional[str] = Field(None, description="Personal color hex code")
    temporary_password: str = Field(..., description="Generated temporary password (must be changed on first login)")


class ResetPasswordResponse(BaseModel):
    """Result of a password reset for a family member."""
    user_id: int = Field(..., description="User ID")
    temporary_password: str = Field(..., description="New temporary password")


class AuditLogEntry(BaseModel):
    """Single audit log entry recording an admin action."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Log entry ID")
    family_id: int = Field(..., description="Family ID")
    admin_user_id: Optional[int] = Field(None, description="Admin who performed the action")
    admin_display_name: Optional[str] = Field(None, description="Admin display name")
    action: str = Field(..., description="Action type (e.g. 'member_created', 'role_changed', 'member_removed')")
    target_user_id: Optional[int] = Field(None, description="User the action was performed on")
    target_display_name: Optional[str] = Field(None, description="Target user display name")
    details: Optional[dict] = Field(None, description="Additional action details")
    created_at: datetime = Field(..., description="When the action occurred")


class PaginatedAuditLog(BaseModel):
    """Paginated list of audit log entries."""
    items: list[AuditLogEntry] = Field(..., description="Audit log entries")
    total: int = Field(..., description="Total number of entries")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Page size")


# ---------------------------------------------------------------------------
# OIDC / SSO admin
# ---------------------------------------------------------------------------


class OIDCPresetEntry(BaseModel):
    """One entry in the provider preset catalog exposed to admins."""
    id: str = Field(..., description="Stable preset identifier (e.g. 'authentik').")
    name: str = Field(..., description="Human-readable provider name.")
    button_label: str = Field(..., description="Default text for the login button.")
    issuer_placeholder: str = Field(..., description="Example issuer URL shown as an input placeholder.")
    default_scopes: str = Field(..., description="Scopes to request if the admin does not override them.")
    hint: str = Field(..., description="Short operator-facing note on where to find the issuer.")


class OIDCConfigResponse(BaseModel):
    """Current OIDC configuration as seen by the admin UI.

    ``client_secret`` is never returned in plaintext. ``client_secret_set``
    lets the UI show a "(secret is set)" indicator without round-
    tripping the actual value.
    """
    enabled: bool = Field(..., description="Whether SSO is enabled.")
    preset: str = Field(..., description="Currently selected provider preset id.")
    button_label: str = Field(..., description="Button label override, empty = preset default.")
    issuer: str = Field(..., description="Issuer URL used to discover endpoints.")
    client_id: str = Field(..., description="OAuth2 client identifier registered at the IdP.")
    client_secret_set: bool = Field(..., description="True if a client secret is stored (value itself is never returned).")
    scopes: str = Field(..., description="Space-separated OAuth2 scopes to request.")
    allow_signup: bool = Field(..., description="Allow new accounts to be created via SSO when following an invite link.")
    disable_password_login: bool = Field(..., description="Reject /auth/login when SSO is ready AND a successful SSO login was recorded in the last 30 days.")
    ready: bool = Field(..., description="True if enabled AND all required fields are set.")
    effective_callback_url: str = Field(..., description="The redirect_uri Tribu will actually send to the IdP. Shown in the admin UI so operators register the same value at their provider.")


class OIDCConfigUpdate(BaseModel):
    """Update the OIDC configuration. All fields optional.

    ``client_secret`` uses the sentinel ``None`` / missing to mean
    "keep the stored value". Send an explicit empty string to clear
    it.
    """
    enabled: Optional[bool] = Field(None, description="Enable or disable SSO on this instance.")
    preset: Optional[str] = Field(None, description="Provider preset id.")
    button_label: Optional[str] = Field(None, description="Override the login button label.")
    issuer: Optional[str] = Field(None, description="Issuer URL.")
    client_id: Optional[str] = Field(None, description="OAuth2 client id.")
    client_secret: Optional[str] = Field(None, description="OAuth2 client secret. Omit to keep existing; empty string clears.")
    scopes: Optional[str] = Field(None, description="Space-separated scopes.")
    allow_signup: Optional[bool] = Field(None, description="Allow new account creation via SSO (invite-bound).")
    disable_password_login: Optional[bool] = Field(None, description="Reject password login when SSO is ready AND a recent successful SSO login was recorded (30-day proof-of-life window).")

    @field_validator("scopes")
    @classmethod
    def scopes_contain_openid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return v
        tokens = v.split()
        if "openid" not in tokens:
            raise ValueError("Scopes must include 'openid'")
        return " ".join(tokens)


class OIDCTestRequest(BaseModel):
    """Request body for the admin discovery probe."""
    issuer: str = Field(..., description="Issuer URL to probe. Tribu appends /.well-known/openid-configuration.")


class OIDCTestResponse(BaseModel):
    """Discovery probe result returned to the admin UI."""
    ok: bool = Field(..., description="True when discovery succeeded and all required endpoints are present.")
    issuer: Optional[str] = Field(None, description="Issuer URL claimed by the discovery document.")
    authorization_endpoint: Optional[str] = Field(None, description="Discovered authorization endpoint.")
    token_endpoint: Optional[str] = Field(None, description="Discovered token endpoint.")
    userinfo_endpoint: Optional[str] = Field(None, description="Discovered userinfo endpoint (if any).")
    jwks_uri: Optional[str] = Field(None, description="Discovered JWKS URI used to verify ID tokens.")
    error: Optional[str] = Field(None, description="Error message when ok=False.")


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

class CalendarEventCreate(BaseModel):
    """Create a new calendar event."""
    family_id: int = Field(..., description="Family ID")
    title: str = Field(..., description="Event title")
    starts_at: datetime = Field(..., description="Start date/time (ISO 8601)")
    ends_at: Optional[datetime] = Field(None, description="End date/time (null for single-point events)")
    description: Optional[str] = Field(None, description="Event description")
    all_day: bool = Field(False, description="Whether this is an all-day event")
    recurrence: Optional[str] = Field(None, description="Recurrence rule: 'daily', 'weekly', 'biweekly', 'monthly', or 'yearly'")
    recurrence_end: Optional[datetime] = Field(None, description="End date for recurrence (null = indefinite)")
    assigned_to: Optional[Union[list[int], str]] = Field(None, description="Assigned members: null (nobody), 'all' (whole family), or list of user IDs")
    color: Optional[str] = Field(None, description="Event color as hex string (e.g. '#7c3aed')")
    category: Optional[str] = Field(None, description="Event category label")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "title": "Family Dinner", "starts_at": "2026-03-01T18:00:00", "ends_at": "2026-03-01T20:00:00", "all_day": False, "recurrence": "weekly", "recurrence_end": "2026-06-01T00:00:00", "assigned_to": [1, 3]}]
    })


class CalendarEventUpdate(BaseModel):
    """Update an existing calendar event (partial update)."""
    title: Optional[str] = Field(None, description="Event title")
    starts_at: Optional[datetime] = Field(None, description="Start date/time")
    ends_at: Optional[datetime] = Field(None, description="End date/time")
    description: Optional[str] = Field(None, description="Event description")
    all_day: Optional[bool] = Field(None, description="Whether this is an all-day event")
    recurrence: Optional[str] = Field(None, description="Recurrence rule: 'daily', 'weekly', 'biweekly', 'monthly', 'yearly', or null to remove")
    recurrence_end: Optional[datetime] = Field(None, description="End date for recurrence")
    assigned_to: Optional[Union[list[int], str]] = Field(None, description="Assigned members: null (nobody), 'all' (whole family), or list of user IDs")
    color: Optional[str] = Field(None, description="Event color as hex string")
    category: Optional[str] = Field(None, description="Event category label")


class CalendarEventResponse(BaseModel):
    """Calendar event with recurrence metadata."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Event ID")
    family_id: int = Field(..., description="Family ID")
    title: str = Field(..., description="Event title")
    starts_at: datetime = Field(..., description="Start date/time")
    ends_at: Optional[datetime] = Field(None, description="End date/time")
    description: Optional[str] = Field(None, description="Event description")
    all_day: bool = Field(..., description="All-day event flag")
    recurrence: Optional[str] = Field(None, description="Recurrence rule if set")
    recurrence_end: Optional[datetime] = Field(None, description="Recurrence end date")
    is_recurring: bool = Field(False, description="True if this is a generated occurrence of a recurring event")
    occurrence_date: Optional[str] = Field(None, description="Date of this specific occurrence (YYYY-MM-DD)")
    assigned_to: Optional[Union[list[int], str]] = Field(None, description="Assigned members: null, 'all', or list of user IDs")
    color: Optional[str] = Field(None, description="Event color as hex string")
    category: Optional[str] = Field(None, description="Event category label")
    created_by_user_id: Optional[int] = Field(None, description="User who created the event")
    created_at: datetime = Field(..., description="Creation timestamp")
    source_type: str = Field("local", description="Where the event came from: 'local', 'import', or 'subscription'")
    source_name: Optional[str] = Field(None, description="Human-readable name of the source feed (e.g. 'Apple Holidays')")
    source_url: Optional[str] = Field(None, description="Subscription URL for refreshable feeds")
    imported_at: Optional[datetime] = Field(None, description="When the event was first imported")
    last_synced_at: Optional[datetime] = Field(None, description="Last time an external feed was refreshed or re-imported")
    sync_status: Optional[str] = Field(None, description="Current external sync state, e.g. ok or error")


class PaginatedCalendarEvents(BaseModel):
    """Paginated list of calendar events."""
    items: list[CalendarEventResponse] = Field(..., description="Calendar events")
    total: int = Field(..., description="Total number of events")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Page size")


class CalendarIcsImport(BaseModel):
    """Import calendar events from ICS text.

    When ``source_name`` or ``source_url`` is provided the imported
    rows are tagged with that provenance so the UI can mark them as
    coming from an external feed and a re-import of the same feed is
    merged into the existing rows by VEVENT UID.
    """
    family_id: int = Field(..., description="Target family ID")
    ics_text: str = Field(..., description="Raw ICS/iCalendar file content")
    source_name: Optional[str] = Field(
        None,
        max_length=200,
        description="Optional human-readable label for the imported feed (e.g. 'Apple Holidays')",
    )
    source_url: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional subscription URL the ICS was fetched from",
    )


class CalendarIcsSubscribe(BaseModel):
    """Subscribe to (or refresh) an external ICS URL.

    Tribu fetches ``source_url`` once per call and merges the events
    into the family calendar. Rows are tagged ``source_type="subscription"``
    so a later refresh of the same URL upserts the same rows by VEVENT
    UID instead of duplicating them.
    """
    family_id: int = Field(..., description="Target family ID")
    source_url: str = Field(
        ...,
        max_length=500,
        description="External http(s) URL of the ICS feed",
    )
    source_name: Optional[str] = Field(
        None,
        max_length=200,
        description="Optional human-readable label for the feed (e.g. 'Public Holidays')",
    )


class CalendarSubscriptionCreate(BaseModel):
    """Create or refresh a managed external ICS subscription feed."""
    family_id: int = Field(..., description="Target family ID")
    source_url: str = Field(..., max_length=500, description="External http(s) URL of the ICS feed")
    source_name: Optional[str] = Field(None, max_length=200, description="Optional human-readable feed label")


class CalendarSubscriptionSyncResponse(BaseModel):
    """One refresh attempt for a managed calendar subscription."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    subscription_id: int
    family_id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    created: int = 0
    updated: int = 0
    skipped: int = 0
    error_count: int = 0
    error_summary: Optional[str] = None


class CalendarSubscriptionResponse(BaseModel):
    """Managed external ICS subscription feed with latest sync status."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    name: str
    source_url: str
    status: str
    last_synced_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_error: Optional[str] = None
    last_created: int = 0
    last_updated: int = 0
    last_skipped: int = 0
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    sync_history: list[CalendarSubscriptionSyncResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    """Create a new task."""
    family_id: int = Field(..., description="Family ID")
    title: str = Field(min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Task description")
    priority: str = Field("normal", description="Priority: 'low', 'normal', or 'high'")
    due_date: Optional[datetime] = Field(None, description="Due date (ISO 8601)")
    recurrence: Optional[str] = Field(None, description="Recurrence: 'daily', 'weekly', 'biweekly', 'monthly', or 'yearly'")
    assigned_to_user_id: Optional[int] = Field(None, description="User ID to assign the task to")
    token_reward_amount: Optional[int] = Field(None, ge=0, description="Tokens awarded on completion")
    token_require_confirmation: bool = Field(True, description="Require adult confirmation before awarding tokens")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "title": "Buy groceries", "priority": "high", "due_date": "2026-03-01T10:00:00", "recurrence": "weekly"}]
    })


class TaskUpdate(BaseModel):
    """Update an existing task (partial update)."""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Task description")
    status: Optional[str] = Field(None, description="Status: 'open' or 'done'")
    priority: Optional[str] = Field(None, description="Priority: 'low', 'normal', or 'high'")
    due_date: Optional[datetime] = Field(None, description="Due date")
    recurrence: Optional[str] = Field(None, description="Recurrence rule")
    assigned_to_user_id: Optional[int] = Field(None, description="Assigned user ID")
    token_reward_amount: Optional[int] = Field(None, ge=0, description="Tokens awarded on completion")
    token_require_confirmation: Optional[bool] = Field(None, description="Require adult confirmation")


class TaskResponse(BaseModel):
    """Task with full details."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Task ID")
    family_id: int = Field(..., description="Family ID")
    title: str = Field(..., description="Task title")
    description: Optional[str] = Field(None, description="Task description")
    status: str = Field(..., description="Status: 'open' or 'done'")
    priority: str = Field(..., description="Priority: 'low', 'normal', or 'high'")
    due_date: Optional[datetime] = Field(None, description="Due date")
    recurrence: Optional[str] = Field(None, description="Recurrence rule")
    assigned_to_user_id: Optional[int] = Field(None, description="Assigned user ID")
    created_by_user_id: Optional[int] = Field(None, description="Creator user ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    token_reward_amount: Optional[int] = Field(None, description="Tokens awarded on completion")
    token_require_confirmation: bool = Field(True, description="Require adult confirmation")


class PaginatedTasks(BaseModel):
    """Paginated list of tasks."""
    items: list[TaskResponse] = Field(..., description="Tasks")
    total: int = Field(..., description="Total number of tasks")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Page size")


# ---------------------------------------------------------------------------
# Shopping
# ---------------------------------------------------------------------------

class ShoppingListCreate(BaseModel):
    """Create a new shopping list."""
    family_id: int = Field(..., description="Family ID")
    name: str = Field(min_length=1, max_length=100, description="List name")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "name": "Weekly Groceries"}]
    })


class ShoppingListResponse(BaseModel):
    """Shopping list with item counts."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="List ID")
    family_id: int = Field(..., description="Family ID")
    name: str = Field(..., description="List name")
    created_by_user_id: Optional[int] = Field(None, description="Creator user ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    item_count: int = Field(0, description="Total number of items")
    checked_count: int = Field(0, description="Number of checked items")


class ShoppingItemCreate(BaseModel):
    """Add an item to a shopping list."""
    name: str = Field(min_length=1, max_length=200, description="Item name")
    spec: Optional[str] = Field(None, max_length=200, description="Specification (e.g. '500g', 'organic')")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"name": "Milk", "spec": "1L, whole"}]
    })


class ShoppingItemUpdate(BaseModel):
    """Update a shopping item (partial update)."""
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="Item name")
    spec: Optional[str] = Field(None, max_length=200, description="Item specification")
    checked: Optional[bool] = Field(None, description="Check/uncheck the item")


class ShoppingItemResponse(BaseModel):
    """Shopping item with metadata."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Item ID")
    list_id: int = Field(..., description="Parent list ID")
    name: str = Field(..., description="Item name")
    spec: Optional[str] = Field(None, description="Item specification")
    checked: bool = Field(..., description="Whether the item is checked off")
    checked_at: Optional[datetime] = Field(None, description="When the item was checked")
    added_by_user_id: Optional[int] = Field(None, description="User who added the item")
    created_at: datetime = Field(..., description="Creation timestamp")


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

class ContactCreate(BaseModel):
    """Create a new contact. If birthday_month and birthday_day are set, a birthday entry is auto-created."""
    family_id: int = Field(..., description="Family ID")
    full_name: str = Field(..., description="Contact's full name")
    email: Optional[str] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    birthday_month: Optional[int] = Field(None, description="Birthday month (1-12)")
    birthday_day: Optional[int] = Field(None, description="Birthday day (1-31)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "full_name": "Julia Schmidt", "email": "julia@example.com", "phone": "+49 170 1234567", "birthday_month": 3, "birthday_day": 15}]
    })


class ContactResponse(BaseModel):
    """Contact entry."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Contact ID")
    family_id: int = Field(..., description="Family ID")
    full_name: str = Field(..., description="Full name")
    email: Optional[str] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    email_values: list[str] = Field(default_factory=list, description="All known email addresses")
    phone_values: list[str] = Field(default_factory=list, description="All known phone numbers")
    birthday_month: Optional[int] = Field(None, description="Birthday month (1-12)")
    birthday_day: Optional[int] = Field(None, description="Birthday day (1-31)")


class ContactUpdate(BaseModel):
    """Update an existing contact (partial update). Birthday entry is auto-updated/removed."""
    full_name: Optional[str] = Field(None, description="Contact's full name")
    email: Optional[str] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, description="Phone number")
    birthday_month: Optional[int] = Field(None, description="Birthday month (1-12)")
    birthday_day: Optional[int] = Field(None, description="Birthday day (1-31)")


class ContactsCsvImport(BaseModel):
    """Import contacts from CSV text."""
    family_id: int = Field(..., description="Target family ID")
    csv_text: str = Field(..., description="CSV content (columns: full_name, email, phone, birthday_month, birthday_day)")


# ---------------------------------------------------------------------------
# Birthdays
# ---------------------------------------------------------------------------

class BirthdayCreate(BaseModel):
    """Create a birthday entry."""
    family_id: int = Field(..., description="Family ID")
    person_name: str = Field(..., description="Person's name")
    month: int = Field(..., description="Birthday month (1-12)")
    day: int = Field(..., description="Birthday day (1-31)")
    year: Optional[int] = Field(None, description="Birth year (optional, enables age display)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "person_name": "Grandma Ilse", "month": 5, "day": 22, "year": 1948}]
    })


class BirthdayUpdate(BaseModel):
    """Update a birthday entry (partial update)."""
    person_name: Optional[str] = Field(None, description="Person's name")
    month: Optional[int] = Field(None, description="Birthday month (1-12)")
    day: Optional[int] = Field(None, description="Birthday day (1-31)")
    year: Optional[int] = Field(None, description="Birth year; send explicitly null to clear")


class BirthdayResponse(BaseModel):
    """Birthday entry."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Birthday ID")
    family_id: int = Field(..., description="Family ID")
    person_name: str = Field(..., description="Person's name")
    month: int = Field(..., description="Month (1-12)")
    day: int = Field(..., description="Day (1-31)")
    year: Optional[int] = Field(None, description="Birth year (null if unknown)")
    contact_id: Optional[int] = Field(
        None,
        description="Contact this birthday is synced from; null for manual entries",
    )


class UpcomingBirthday(BaseModel):
    """Upcoming birthday for the dashboard."""
    person_name: str = Field(..., description="Person's name")
    occurs_on: str = Field(..., description="Next occurrence date (YYYY-MM-DD)")
    days_until: int = Field(..., description="Days until the birthday")


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardSummary(BaseModel):
    """Aggregated dashboard data: upcoming events (14 days) and birthdays (28 days)."""
    family_id: int = Field(..., description="Family ID")
    next_events: list[CalendarEventResponse] = Field(..., description="Upcoming events within 14 days")
    upcoming_birthdays: list[UpcomingBirthday] = Field(..., description="Upcoming birthdays within 28 days")


# ---------------------------------------------------------------------------
# Personal Access Tokens (PAT)
# ---------------------------------------------------------------------------

class PATCreate(BaseModel):
    """Create a personal access token for API automation."""
    name: str = Field(min_length=1, max_length=100, description="Token name (for your reference)")
    scopes: list[str] = Field(["*"], description="List of scopes (e.g. ['calendar:read', 'tasks:write']). Use ['*'] for full access.")
    expires_at: Optional[datetime] = Field(None, description="Expiration date (null = never expires)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"name": "Home Assistant", "scopes": ["calendar:read", "tasks:read"], "expires_at": "2027-01-01T00:00:00"}]
    })


class PATResponse(BaseModel):
    """Personal access token metadata (token value is NOT returned after creation)."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Token ID")
    name: str = Field(..., description="Token name")
    scopes: str = Field(..., description="Comma-separated scopes")
    expires_at: Optional[datetime] = Field(None, description="Expiration date")
    last_used_at: Optional[datetime] = Field(None, description="Last usage timestamp")
    created_at: datetime = Field(..., description="Creation timestamp")


class PATCreatedResponse(BaseModel):
    """Newly created PAT. The token value is only shown once."""
    token: str = Field(..., description="Full token value (prefixed with tribu_pat_). Save this — it cannot be retrieved again.")
    pat: PATResponse = Field(..., description="Token metadata")


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

class BackupSchedule(str, Enum):
    """Automatic backup schedule."""
    off = "off"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class BackupConfigResponse(BaseModel):
    """Current backup configuration."""
    schedule: BackupSchedule = Field(BackupSchedule.off, description="Backup schedule")
    retention: int = Field(7, description="Number of backups to keep")
    last_backup: Optional[datetime] = Field(None, description="Timestamp of last backup")
    last_backup_status: Optional[str] = Field(None, description="Status of last backup: 'ok' or error message")


class BackupConfigUpdate(BaseModel):
    """Update backup configuration."""
    schedule: BackupSchedule = Field(..., description="Backup schedule: 'off', 'daily', 'weekly', or 'monthly'")
    retention: int = Field(ge=1, le=100, default=7, description="Number of backups to retain (1-100)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"schedule": "daily", "retention": 14}]
    })


class BackupEntry(BaseModel):
    """Backup file metadata."""
    filename: str = Field(..., description="Backup filename")
    size_bytes: int = Field(..., description="File size in bytes")
    created_at: datetime = Field(..., description="Backup creation timestamp")
    alembic_revision: Optional[str] = Field(None, description="Database migration revision at backup time")
    pg_version: Optional[str] = Field(None, description="PostgreSQL version at backup time")


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    """User notification."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Notification ID")
    type: str = Field(..., description="Notification type (e.g. 'reminder', 'birthday')")
    title: str = Field(..., description="Notification title")
    body: Optional[str] = Field(None, description="Notification body text")
    link: Optional[str] = Field(None, description="Deep link to related content")
    read: bool = Field(..., description="Whether the notification has been read")
    created_at: datetime = Field(..., description="Creation timestamp")


class NotificationPreferenceResponse(BaseModel):
    """User notification preferences."""
    model_config = ConfigDict(from_attributes=True)

    reminders_enabled: bool = Field(..., description="Whether event reminders are enabled")
    reminder_minutes: int = Field(..., description="Minutes before event to send reminder")
    quiet_start: Optional[str] = Field(None, description="Quiet hours start (HH:MM format)")
    quiet_end: Optional[str] = Field(None, description="Quiet hours end (HH:MM format)")
    push_enabled: bool = Field(False, description="Whether push notifications are enabled")


class NotificationPreferenceUpdate(BaseModel):
    """Update notification preferences (partial update)."""
    reminders_enabled: Optional[bool] = Field(None, description="Enable/disable event reminders")
    reminder_minutes: Optional[int] = Field(None, description="Minutes before event to send reminder")
    quiet_start: Optional[str] = Field(None, description="Quiet hours start (HH:MM)")
    quiet_end: Optional[str] = Field(None, description="Quiet hours end (HH:MM)")
    push_enabled: Optional[bool] = Field(None, description="Enable/disable push notifications")


class PushSubscriptionCreate(BaseModel):
    """Register a push subscription."""
    endpoint: str = Field(..., description="Push service endpoint URL")
    p256dh: str = Field(..., description="Client public key for encryption")
    auth: str = Field(..., description="Client auth secret")


class PushUnsubscribe(BaseModel):
    """Unregister a push subscription."""
    endpoint: str = Field(..., description="Push service endpoint URL to remove")


# ---------------------------------------------------------------------------
# Navigation
# ---------------------------------------------------------------------------

class NavOrderResponse(BaseModel):
    """User's navigation bar order."""
    nav_order: list[str] = Field(..., description="Ordered list of view keys (e.g. ['dashboard', 'calendar', 'tasks', 'shopping', 'contacts'])")


class NavOrderUpdate(BaseModel):
    """Update navigation bar order."""
    nav_order: list[str] = Field(min_length=1, max_length=10, description="Ordered list of view keys")


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class InvitationCreate(BaseModel):
    """Create a shareable invitation link for the family."""
    role_preset: str = Field("member", description="Role for invited users: 'admin' or 'member'")
    is_adult_preset: bool = Field(False, description="Whether invited users are marked as adult")
    max_uses: Optional[int] = Field(None, ge=1, le=1000, description="Maximum number of uses (null = unlimited)")
    expires_in_days: int = Field(7, ge=1, le=90, description="Days until the invitation expires (1-90)")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"role_preset": "member", "is_adult_preset": True, "max_uses": 5, "expires_in_days": 14}]
    })


class InvitationResponse(BaseModel):
    """Invitation link details."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Invitation ID")
    family_id: int = Field(..., description="Family ID")
    token: str = Field(..., description="Invitation token")
    invite_url: str = Field("", description="Full shareable URL")
    role_preset: str = Field(..., description="Preset role for invited users")
    is_adult_preset: bool = Field(..., description="Preset adult status")
    max_uses: Optional[int] = Field(None, description="Maximum uses (null = unlimited)")
    use_count: int = Field(..., description="Number of times used")
    expires_at: datetime = Field(..., description="Expiration timestamp")
    revoked: bool = Field(..., description="Whether the invitation has been revoked")
    created_by_user_id: Optional[int] = Field(None, description="Creator user ID")
    created_at: datetime = Field(..., description="Creation timestamp")


class InviteInfoResponse(BaseModel):
    """Public invitation info (no auth required)."""
    family_name: str = Field(..., description="Name of the family")
    valid: bool = Field(..., description="Whether the invitation is still valid")
    role_preset: str = Field(..., description="Role that will be assigned")
    is_adult_preset: bool = Field(..., description="Adult status that will be assigned")


class RegisterWithInviteRequest(BaseModel):
    """Register a new user via an invitation link."""
    token: str = Field(..., description="Invitation token from the URL")
    email: EmailStr = Field(..., description="Email address for the new account")
    password: str = Field(min_length=8, max_length=128, description="Password (min 8 chars, uppercase + digit required)")
    display_name: str = Field(..., description="Display name")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"token": "abc123def456", "email": "newmember@example.com", "password": "Welcome1", "display_name": "Tom"}]
    })

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

class SetupStatusResponse(BaseModel):
    """Initial setup status."""
    needs_setup: bool = Field(..., description="True if no users exist and setup is required")


class RestoreResponse(BaseModel):
    """Result of a backup restore during setup."""
    status: str = Field(..., description="Restore result: 'ok' or error message")
    alembic_revision: Optional[str] = Field(None, description="Database migration revision from backup")
    pg_version: Optional[str] = Field(None, description="PostgreSQL version from backup")
    created_at: Optional[str] = Field(None, description="When the backup was originally created")


# ---------------------------------------------------------------------------
# Admin Settings
# ---------------------------------------------------------------------------

class BaseUrlUpdate(BaseModel):
    """Update the instance base URL (used for generating invitation links)."""
    base_url: str = Field("", description="Base URL (e.g. 'https://tribu.example.com'). Empty to auto-detect.")


# ---------------------------------------------------------------------------
# Rewards
# ---------------------------------------------------------------------------

class RewardCurrencyCreate(BaseModel):
    """Create the family reward currency."""
    family_id: int = Field(..., description="Family ID")
    name: str = Field(min_length=1, max_length=50, description="Currency name (e.g. Stars, Coins)")
    icon: str = Field(default="star", pattern=r"^(star|gem|heart|zap|trophy)$", description="Lucide icon name")


class RewardCurrencyUpdate(BaseModel):
    """Update reward currency."""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="Currency name")
    icon: Optional[str] = Field(None, pattern=r"^(star|gem|heart|zap|trophy)$", description="Lucide icon name")


class RewardCurrencyResponse(BaseModel):
    """Reward currency details."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    family_id: int
    name: str
    icon: str
    created_at: datetime


class EarningRuleCreate(BaseModel):
    """Create an earning rule."""
    family_id: int = Field(..., description="Family ID")
    currency_id: int = Field(..., description="Currency ID")
    name: str = Field(min_length=1, max_length=100, description="Activity name")
    amount: int = Field(ge=1, le=10000, description="Tokens earned")
    require_confirmation: bool = Field(True, description="Require adult confirmation")


class EarningRuleUpdate(BaseModel):
    """Update an earning rule."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[int] = Field(None, ge=1, le=10000)
    require_confirmation: Optional[bool] = None


class EarningRuleResponse(BaseModel):
    """Earning rule details."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    family_id: int
    currency_id: int
    name: str
    amount: int
    require_confirmation: bool
    created_at: datetime


class RewardItemCreate(BaseModel):
    """Create a reward catalog item."""
    family_id: int = Field(..., description="Family ID")
    currency_id: int = Field(..., description="Currency ID")
    name: str = Field(min_length=1, max_length=100, description="Reward name")
    cost: int = Field(ge=1, le=100000, description="Token cost")
    icon: Optional[str] = Field(None, max_length=10, description="Emoji icon")


class RewardItemUpdate(BaseModel):
    """Update a reward catalog item."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    cost: Optional[int] = Field(None, ge=1, le=100000)
    icon: Optional[str] = Field(None, max_length=10)
    is_active: Optional[bool] = None


class RewardItemResponse(BaseModel):
    """Reward catalog item details."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    family_id: int
    currency_id: int
    name: str
    cost: int
    icon: Optional[str]
    is_active: bool
    created_at: datetime


class ManualEarnRequest(BaseModel):
    """Award tokens to a member."""
    family_id: int
    currency_id: int
    target_user_id: int = Field(..., description="User who earns tokens")
    amount: int = Field(ge=1, le=10000)
    note: Optional[str] = Field(None, max_length=200)
    source_rule_id: Optional[int] = None


class RedeemRequest(BaseModel):
    """Redeem a reward."""
    family_id: int
    reward_id: int
    note: Optional[str] = Field(None, max_length=200)


class TokenTransactionResponse(BaseModel):
    """Token transaction details."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    family_id: int
    currency_id: int
    user_id: int
    kind: str
    amount: int
    status: str
    note: Optional[str]
    source_task_id: Optional[int]
    source_reward_id: Optional[int]
    source_rule_id: Optional[int]
    confirmed_by_user_id: Optional[int]
    confirmed_at: Optional[datetime]
    created_at: datetime


class PaginatedTransactions(BaseModel):
    """Paginated token transactions."""
    items: list[TokenTransactionResponse]
    total: int
    offset: int
    limit: int


class MemberBalance(BaseModel):
    """Single member token balance."""
    user_id: int
    display_name: str
    balance: int
    pending: int


class BalancesResponse(BaseModel):
    """Family token balances."""
    family_id: int
    currency_id: int
    currency_name: str
    currency_icon: str
    balances: list[MemberBalance]


# ---------------------------------------------------------------------------
# Gift List
# ---------------------------------------------------------------------------

GIFT_STATUSES = ("idea", "ordered", "purchased", "gifted")
GIFT_OCCASIONS = ("birthday", "christmas", "easter", "other")


class GiftPriceHistoryEntry(BaseModel):
    """Single price history entry."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    price_cents: int
    recorded_at: datetime


class GiftCreate(BaseModel):
    """Create a new gift idea."""
    family_id: int = Field(..., description="Family ID")
    title: str = Field(min_length=1, max_length=200, description="Gift title")
    description: Optional[str] = Field(None, description="Free-text description")
    url: Optional[str] = Field(None, max_length=2000, description="Product link (http/https)")
    for_user_id: Optional[int] = Field(None, description="Family member this gift is for")
    for_person_name: Optional[str] = Field(None, max_length=120, description="External recipient (e.g. grandparent)")
    occasion: Optional[str] = Field(None, max_length=40, description="birthday, christmas, easter, or free-text label")
    occasion_date: Optional[date] = Field(None, description="Target date for the gift")
    status: str = Field("idea", description="idea, ordered, purchased, or gifted")
    notes: Optional[str] = Field(None, description="Private parent notes")
    current_price_cents: Optional[int] = Field(None, ge=0, description="Current observed price in cents")
    currency: str = Field("EUR", min_length=3, max_length=3, description="ISO 4217 currency code")


class GiftUpdate(BaseModel):
    """Update an existing gift idea (partial update)."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    url: Optional[str] = Field(None, max_length=2000)
    for_user_id: Optional[int] = None
    for_person_name: Optional[str] = Field(None, max_length=120)
    occasion: Optional[str] = Field(None, max_length=40)
    occasion_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    current_price_cents: Optional[int] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)


class GiftResponse(BaseModel):
    """Gift idea with full details."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    for_user_id: Optional[int]
    for_person_name: Optional[str]
    title: str
    description: Optional[str]
    url: Optional[str]
    occasion: Optional[str]
    occasion_date: Optional[date]
    status: str
    notes: Optional[str]
    current_price_cents: Optional[int]
    currency: str
    gifted_at: Optional[datetime]
    created_by_user_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class GiftDetailResponse(GiftResponse):
    """Gift idea with embedded price history (most recent first)."""
    price_history: list[GiftPriceHistoryEntry] = Field(default_factory=list)


class PaginatedGifts(BaseModel):
    """Paginated gift list."""
    items: list[GiftResponse]
    total: int
    offset: int
    limit: int


# ── Meal Plans ──────────────────────────────────────────────

MEAL_SLOTS = ("morning", "noon", "evening")


class IngredientItem(BaseModel):
    """One line on a meal's ingredient list.

    Amount and unit are both optional so a user can write a pure name
    ("Salz") or a quantified entry ("500 g Mehl", "2 Stueck Aepfel").
    """
    name: str = Field(min_length=1, max_length=120, description="Ingredient name")
    amount: Optional[float] = Field(None, ge=0, description="Optional numeric quantity")
    unit: Optional[str] = Field(None, max_length=20, description="Optional short unit label (g, ml, Stueck, EL, ...)")


class MealPlanBase(BaseModel):
    plan_date: date = Field(..., description="Date the meal is planned for")
    slot: str = Field(..., description=f"One of {', '.join(MEAL_SLOTS)}")
    meal_name: str = Field(min_length=1, max_length=200, description="What's on the plate")
    ingredients: list[IngredientItem] = Field(default_factory=list, description="Structured ingredient list, order preserved")
    notes: Optional[str] = Field(None, description="Optional notes (recipe link, variation, etc.)")


class MealPlanCreate(MealPlanBase):
    family_id: int = Field(..., description="Family ID")


class MealPlanUpdate(BaseModel):
    plan_date: Optional[date] = None
    slot: Optional[str] = None
    meal_name: Optional[str] = Field(None, min_length=1, max_length=200)
    ingredients: Optional[list[IngredientItem]] = None
    notes: Optional[str] = None


class MealPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    plan_date: date
    slot: str
    meal_name: str
    ingredients: list[IngredientItem]
    notes: Optional[str]
    created_by_user_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class MealPlanIngredientsResponse(BaseModel):
    """Distinct ingredient names previously used in the family's meal plans."""
    items: list[str]


class MealPlanAddToShoppingRequest(BaseModel):
    shopping_list_id: int = Field(..., description="Target shopping list ID")
    ingredient_names: Optional[list[str]] = Field(
        None,
        description=(
            "Subset of the meal's ingredient names to push. Each entry must "
            "match the name (case-insensitive) of an ingredient already stored "
            "on the meal. Defaults to all ingredients when omitted."
        ),
    )


class MealPlanAddToShoppingResponse(BaseModel):
    added_count: int


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

class RecipeBase(BaseModel):
    title: str = Field(min_length=1, max_length=200, description="Recipe title")
    description: Optional[str] = Field(None, max_length=2000, description="Optional recipe summary or notes")
    source_url: Optional[str] = Field(None, max_length=500, description="Optional recipe source URL")
    servings: Optional[int] = Field(None, ge=1, le=999, description="Optional serving count")
    tags: list[str] = Field(default_factory=list, description="Short recipe tags")
    ingredients: list[IngredientItem] = Field(default_factory=list, description="Structured ingredient list, order preserved")
    instructions: Optional[str] = Field(None, description="Optional cooking instructions")


class RecipeCreate(RecipeBase):
    family_id: int = Field(..., description="Family ID")


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    source_url: Optional[str] = Field(None, max_length=500)
    servings: Optional[int] = Field(None, ge=1, le=999)
    tags: Optional[list[str]] = None
    ingredients: Optional[list[IngredientItem]] = None
    instructions: Optional[str] = None


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    title: str
    description: Optional[str]
    source_url: Optional[str]
    servings: Optional[int]
    tags: list[str]
    ingredients: list[IngredientItem]
    instructions: Optional[str]
    created_by_user_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class RecipeAddToShoppingRequest(BaseModel):
    shopping_list_id: int = Field(..., description="Target shopping list ID")
    ingredient_names: Optional[list[str]] = Field(
        None,
        description=(
            "Subset of the recipe ingredient names to push. Each entry must "
            "match the name (case-insensitive) of an ingredient already stored "
            "on the recipe. Defaults to all ingredients when omitted."
        ),
    )


class RecipeAddToShoppingResponse(BaseModel):
    added_count: int
