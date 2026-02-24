from datetime import datetime
from typing import Optional

import re

from enum import Enum

from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str
    family_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: int
    email: str
    display_name: str
    profile_image: Optional[str] = None


class ProfileImageUpdate(BaseModel):
    profile_image: str


class FamilySummary(BaseModel):
    family_id: int
    family_name: str
    role: str
    is_adult: bool


class FamilyMemberResponse(BaseModel):
    user_id: int
    display_name: str
    email: str
    role: str
    is_adult: bool


class MemberRoleUpdate(BaseModel):
    role: str


class MemberAdultUpdate(BaseModel):
    is_adult: bool


class CalendarEventCreate(BaseModel):
    family_id: int
    title: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    description: Optional[str] = None
    all_day: bool = False
    recurrence: Optional[str] = None
    recurrence_end: Optional[datetime] = None


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    description: Optional[str] = None
    all_day: Optional[bool] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[datetime] = None


class CalendarEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    title: str
    starts_at: datetime
    ends_at: Optional[datetime]
    description: Optional[str]
    all_day: bool
    recurrence: Optional[str] = None
    recurrence_end: Optional[datetime] = None
    is_recurring: bool = False
    occurrence_date: Optional[str] = None
    created_by_user_id: Optional[int]
    created_at: datetime


class BirthdayCreate(BaseModel):
    family_id: int
    person_name: str
    month: int
    day: int


class BirthdayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    person_name: str
    month: int
    day: int


class UpcomingBirthday(BaseModel):
    person_name: str
    occurs_on: str
    days_until: int


class DashboardSummary(BaseModel):
    family_id: int
    next_events: list[CalendarEventResponse]
    upcoming_birthdays: list[UpcomingBirthday]


class ContactCreate(BaseModel):
    family_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birthday_month: Optional[int] = None
    birthday_day: Optional[int] = None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    birthday_month: Optional[int]
    birthday_day: Optional[int]


class ContactsCsvImport(BaseModel):
    family_id: int
    csv_text: str


class CalendarIcsImport(BaseModel):
    family_id: int
    ics_text: str


class TaskCreate(BaseModel):
    family_id: int
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    priority: str = "normal"
    due_date: Optional[datetime] = None
    recurrence: Optional[str] = None
    assigned_to_user_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    recurrence: Optional[str] = None
    assigned_to_user_id: Optional[int] = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    due_date: Optional[datetime]
    recurrence: Optional[str]
    assigned_to_user_id: Optional[int]
    created_by_user_id: Optional[int]
    created_at: datetime
    completed_at: Optional[datetime]


class PaginatedCalendarEvents(BaseModel):
    items: list[CalendarEventResponse]
    total: int
    offset: int
    limit: int


class PaginatedTasks(BaseModel):
    items: list[TaskResponse]
    total: int
    offset: int
    limit: int


class PATCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = ["*"]
    expires_at: Optional[datetime] = None


class PATResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    scopes: str
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    created_at: datetime


class PATCreatedResponse(BaseModel):
    token: str
    pat: PATResponse


# Shopping
class ShoppingListCreate(BaseModel):
    family_id: int
    name: str = Field(min_length=1, max_length=100)


class ShoppingListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    name: str
    created_by_user_id: Optional[int]
    created_at: datetime
    item_count: int = 0
    checked_count: int = 0


class ShoppingItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    spec: Optional[str] = Field(None, max_length=200)


class ShoppingItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    spec: Optional[str] = Field(None, max_length=200)
    checked: Optional[bool] = None


class ShoppingItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_id: int
    name: str
    spec: Optional[str]
    checked: bool
    checked_at: Optional[datetime]
    added_by_user_id: Optional[int]
    created_at: datetime


# Backup
class BackupSchedule(str, Enum):
    off = "off"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class BackupConfigResponse(BaseModel):
    schedule: BackupSchedule = BackupSchedule.off
    retention: int = 7
    last_backup: Optional[datetime] = None
    last_backup_status: Optional[str] = None


class BackupConfigUpdate(BaseModel):
    schedule: BackupSchedule
    retention: int = Field(ge=1, le=100, default=7)


class BackupEntry(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime
    alembic_revision: Optional[str] = None
    pg_version: Optional[str] = None
