
from app.core.clock import utcnow

from sqlalchemy import Column, Date, Integer, String, ForeignKey, UniqueConstraint, DateTime, Boolean, func, Text, JSON
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    profile_image = Column(String, nullable=True)
    must_change_password = Column(Boolean, nullable=False, default=False, server_default="false")
    has_completed_onboarding = Column(Boolean, nullable=False, default=False, server_default="false")

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
    invitations = relationship("FamilyInvitation", back_populates="family", cascade="all, delete-orphan")
    reward_currency = relationship("RewardCurrency", back_populates="family", uselist=False, cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "family_id", name="uq_membership_user_family"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False, default="member")
    is_adult = Column(Boolean, nullable=False, default=False)
    color = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)

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
    assigned_to = Column(JSON, nullable=True)
    color = Column(String, nullable=True)
    category = Column(String, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )
    # CalDAV identity. ical_uid is the VEVENT UID the client picked, and
    # dav_href is the path segment under the collection (for example
    # "ABCD-1234.ics"). Both are unique per family; the storage plugin
    # writes them on PUT and resolves hrefs/UIDs back to rows on
    # subsequent GET/PROPFIND.
    ical_uid = Column(String(200), nullable=True)
    dav_href = Column(String(250), nullable=True)

    __table_args__ = (
        UniqueConstraint("family_id", "ical_uid", name="uq_calendar_events_family_uid"),
        UniqueConstraint("family_id", "dav_href", name="uq_calendar_events_family_href"),
    )

    family = relationship("Family", back_populates="calendar_events")


class FamilyBirthday(Base):
    __tablename__ = "family_birthdays"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    person_name = Column(String, nullable=False)
    month = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

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
    created_at = Column(DateTime, nullable=False, default=utcnow)
    completed_at = Column(DateTime, nullable=True)
    token_reward_amount = Column(Integer, nullable=True)
    token_require_confirmation = Column(Boolean, nullable=False, default=True, server_default="true")

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
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )
    # CardDAV identity: the vCard UID the client picked plus the href
    # path segment inside the address-book collection. Both unique per
    # family, backfilled for legacy rows.
    vcard_uid = Column(String(200), nullable=True)
    dav_href = Column(String(250), nullable=True)
    # Passthrough of the most recently uploaded VCARD so client-only
    # fields (ORG, ADR, NOTE, secondary EMAIL/TEL) round-trip on the
    # next GET. Tribu's own UI still renders from the structured
    # columns above.
    raw_vcard = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("family_id", "vcard_uid", name="uq_contacts_family_uid"),
        UniqueConstraint("family_id", "dav_href", name="uq_contacts_family_href"),
    )


class PersonalAccessToken(Base):
    __tablename__ = "personal_access_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    token_hash = Column(String(256), unique=True, nullable=False, index=True)
    token_lookup = Column(String(64), unique=True, nullable=True, index=True)
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
    push_enabled = Column(Boolean, nullable=False, default=False, server_default="false")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


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


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    admin_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)
    target_user_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class FamilyInvitation(Base):
    __tablename__ = "family_invitations"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role_preset = Column(String, nullable=False, default="member")
    is_adult_preset = Column(Boolean, nullable=False, default=False)
    max_uses = Column(Integer, nullable=True)
    use_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family", back_populates="invitations")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


# ── Reward System ─────────────────────────────────────────


class RewardCurrency(Base):
    __tablename__ = "reward_currencies"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    icon = Column(String(10), nullable=False, server_default="star")
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family", back_populates="reward_currency")
    earning_rules = relationship("EarningRule", back_populates="currency", cascade="all, delete-orphan")
    rewards = relationship("Reward", back_populates="currency", cascade="all, delete-orphan")
    transactions = relationship("TokenTransaction", back_populates="currency", cascade="all, delete-orphan")


class EarningRule(Base):
    __tablename__ = "earning_rules"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    currency_id = Column(Integer, ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    amount = Column(Integer, nullable=False)
    require_confirmation = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family")
    currency = relationship("RewardCurrency", back_populates="earning_rules")


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    currency_id = Column(Integer, ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    cost = Column(Integer, nullable=False)
    icon = Column(String(10), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family")
    currency = relationship("RewardCurrency", back_populates="rewards")


class TokenTransaction(Base):
    __tablename__ = "token_transactions"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    currency_id = Column(Integer, ForeignKey("reward_currencies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)
    amount = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="confirmed", server_default="confirmed")
    note = Column(String(200), nullable=True)
    source_task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    source_reward_id = Column(Integer, ForeignKey("rewards.id", ondelete="SET NULL"), nullable=True)
    source_rule_id = Column(Integer, ForeignKey("earning_rules.id", ondelete="SET NULL"), nullable=True)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    family = relationship("Family")
    currency = relationship("RewardCurrency", back_populates="transactions")
    user = relationship("User", foreign_keys=[user_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_user_id])
    source_task = relationship("Task", foreign_keys=[source_task_id])
    source_reward = relationship("Reward", foreign_keys=[source_reward_id])


# ── Gift List ─────────────────────────────────────────────


class GiftIdea(Base):
    __tablename__ = "gift_ideas"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    for_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    for_person_name = Column(String(120), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    occasion = Column(String(40), nullable=True)
    occasion_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="idea", server_default="idea")
    notes = Column(Text, nullable=True)
    current_price_cents = Column(Integer, nullable=True)
    currency = Column(String(3), nullable=False, default="EUR", server_default="EUR")
    gifted_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    price_history = relationship(
        "GiftPriceHistory",
        back_populates="gift",
        cascade="all, delete-orphan",
        order_by="GiftPriceHistory.recorded_at.desc()",
    )


class GiftPriceHistory(Base):
    __tablename__ = "gift_price_history"

    id = Column(Integer, primary_key=True, index=True)
    gift_id = Column(Integer, ForeignKey("gift_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    price_cents = Column(Integer, nullable=False)
    recorded_at = Column(DateTime, nullable=False, server_default=func.now())

    gift = relationship("GiftIdea", back_populates="price_history")


# ── Meal Plans ────────────────────────────────────────────


class MealPlan(Base):
    """One meal slot on one date. Slots are fixed at morning/noon/evening.

    Ingredients are stored as a JSON list of objects with ``name`` plus
    optional ``amount`` (float) and ``unit`` (short free-text label like
    "g", "ml", "Stück", "EL"). The (family_id, plan_date, slot) triple is
    unique: one meal per cell.
    """
    __tablename__ = "meal_plans"
    __table_args__ = (
        UniqueConstraint("family_id", "plan_date", "slot", name="uq_meal_plans_family_date_slot"),
    )

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_date = Column(Date, nullable=False, index=True)
    slot = Column(String(16), nullable=False)
    meal_name = Column(String(200), nullable=False)
    ingredients = Column(JSON, nullable=False, default=list, server_default="[]")
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
