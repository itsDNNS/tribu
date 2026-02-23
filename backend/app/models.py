from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, Boolean
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


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

    memberships = relationship("Membership", back_populates="family", cascade="all, delete-orphan")
    calendar_events = relationship("CalendarEvent", back_populates="family", cascade="all, delete-orphan")
    birthdays = relationship("FamilyBirthday", back_populates="family", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="family", cascade="all, delete-orphan")


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
