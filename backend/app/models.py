from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, Boolean, func, Text, JSON
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    profile_image = Column(String, nullable=True)

    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")
    personal_access_tokens = relationship("PersonalAccessToken", back_populates="user", cascade="all, delete-orphan")


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

    memberships = relationship("Membership", back_populates="family", cascade="all, delete-orphan")
    calendar_events = relationship("CalendarEvent", back_populates="family", cascade="all, delete-orphan")
    birthdays = relationship("FamilyBirthday", back_populates="family", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="family", cascade="all, delete-orphan")
    shopping_lists = relationship("ShoppingList", back_populates="family", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "family_id", name="uq_membership_user_family"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False, default="member")
    is_adult = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="memberships")
    family = relationship("Family", back_populates="memberships")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=True)
    all_day = Column(Boolean, nullable=False, default=False)
    recurrence = Column(String, nullable=True)
    recurrence_end = Column(DateTime, nullable=True)
    excluded_dates = Column(JSON, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    family = relationship("Family", back_populates="calendar_events")


class FamilyBirthday(Base):
    __tablename__ = "family_birthdays"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    person_name = Column(String, nullable=False)
    month = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    family = relationship("Family", back_populates="birthdays")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open")
    priority = Column(String, nullable=False, default="normal")
    due_date = Column(DateTime, nullable=True)
    recurrence = Column(String, nullable=True)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    family = relationship("Family", back_populates="tasks")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    birthday_month = Column(Integer, nullable=True)
    birthday_day = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PersonalAccessToken(Base):
    __tablename__ = "personal_access_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    scopes = Column(String, nullable=False, default="*")
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    user = relationship("User", back_populates="personal_access_tokens")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family", back_populates="shopping_lists")
    items = relationship("ShoppingItem", back_populates="shopping_list", cascade="all, delete-orphan")


class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    spec = Column(String, nullable=True)
    checked = Column(Boolean, nullable=False, default=False)
    checked_at = Column(DateTime, nullable=True)
    added_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    position = Column(Integer, nullable=False, default=0)

    shopping_list = relationship("ShoppingList", back_populates="items")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    reminders_enabled = Column(Boolean, nullable=False, default=True)
    reminder_minutes = Column(Integer, nullable=False, default=30)
    quiet_start = Column(String, nullable=True)
    quiet_end = Column(String, nullable=True)


class NotificationSentLog(Base):
    __tablename__ = "notification_sent_log"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String, nullable=False)
    source_id = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sent_at = Column(DateTime, nullable=False, server_default=func.now())


class UserNavOrder(Base):
    __tablename__ = "user_nav_order"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    nav_order = Column(JSON, nullable=False, default=["dashboard", "calendar", "shopping", "tasks", "contacts", "notifications", "settings"])


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
