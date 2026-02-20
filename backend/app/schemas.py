from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    family_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    description: Optional[str] = None
    all_day: Optional[bool] = None


class CalendarEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    family_id: int
    title: str
    starts_at: datetime
    ends_at: Optional[datetime]
    description: Optional[str]
    all_day: bool
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
