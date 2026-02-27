from datetime import datetime
from typing import Optional, Union

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


class TokenResponse(BaseModel):
    """JWT token returned after successful login (also set as httpOnly cookie)."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field("bearer", description="Always 'bearer'")


class MeResponse(BaseModel):
    """Current authenticated user profile."""
    user_id: int = Field(..., description="User ID")
    email: str = Field(..., description="Email address")
    display_name: str = Field(..., description="Display name")
    profile_image: Optional[str] = Field(None, description="Base64-encoded profile image or null")
    must_change_password: bool = Field(False, description="True if user must change their temporary password")

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"user_id": 1, "email": "anna@example.com", "display_name": "Anna", "profile_image": None, "must_change_password": False}]
    })


class ProfileImageUpdate(BaseModel):
    """Update profile image (base64-encoded)."""
    profile_image: str = Field(..., description="Base64-encoded image data")


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
    created_by_user_id: Optional[int] = Field(None, description="User who created the event")
    created_at: datetime = Field(..., description="Creation timestamp")


class PaginatedCalendarEvents(BaseModel):
    """Paginated list of calendar events."""
    items: list[CalendarEventResponse] = Field(..., description="Calendar events")
    total: int = Field(..., description="Total number of events")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Page size")


class CalendarIcsImport(BaseModel):
    """Import calendar events from ICS text."""
    family_id: int = Field(..., description="Target family ID")
    ics_text: str = Field(..., description="Raw ICS/iCalendar file content")


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

    model_config = ConfigDict(json_schema_extra={
        "examples": [{"family_id": 1, "person_name": "Grandma Ilse", "month": 5, "day": 22}]
    })


class BirthdayResponse(BaseModel):
    """Birthday entry."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Birthday ID")
    family_id: int = Field(..., description="Family ID")
    person_name: str = Field(..., description="Person's name")
    month: int = Field(..., description="Month (1-12)")
    day: int = Field(..., description="Day (1-31)")


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
