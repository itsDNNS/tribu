# Error code constants for structured API error responses.
# Format returned by error_detail(): {"code": "...", "message": "...", "params": {...}}

# ── Auth / Token ──────────────────────────────────────────────
INVALID_TOKEN = "INVALID_TOKEN"
TOKEN_EXPIRED = "TOKEN_EXPIRED"
UNAUTHENTICATED = "UNAUTHENTICATED"
USER_NOT_FOUND = "USER_NOT_FOUND"
INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
OLD_PASSWORD_INCORRECT = "OLD_PASSWORD_INCORRECT"

# ── Authorization ─────────────────────────────────────────────
NO_FAMILY_ACCESS = "NO_FAMILY_ACCESS"
ADULT_REQUIRED = "ADULT_REQUIRED"
ADMIN_REQUIRED = "ADMIN_REQUIRED"
INSUFFICIENT_SCOPE = "INSUFFICIENT_SCOPE"

# ── Registration / Email ──────────────────────────────────────
EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"

# ── Family / Members ─────────────────────────────────────────
MEMBER_NOT_FOUND = "MEMBER_NOT_FOUND"
NOT_A_MEMBER = "NOT_A_MEMBER"
INVALID_ROLE = "INVALID_ROLE"
ONLY_ADULTS_ADMIN = "ONLY_ADULTS_ADMIN"
CANNOT_DEMOTE_SELF = "CANNOT_DEMOTE_SELF"
CANNOT_CHANGE_OWN_ADULT = "CANNOT_CHANGE_OWN_ADULT"
CANNOT_REMOVE_SELF = "CANNOT_REMOVE_SELF"
CANNOT_RESET_OWN_PASSWORD = "CANNOT_RESET_OWN_PASSWORD"
LAST_ADMIN = "LAST_ADMIN"
INVALID_CONFIRMATION = "INVALID_CONFIRMATION"
COLOR_NOT_ALLOWED = "COLOR_NOT_ALLOWED"
COLOR_ALREADY_TAKEN = "COLOR_ALREADY_TAKEN"

# ── Tasks ─────────────────────────────────────────────────────
TASK_NOT_FOUND = "TASK_NOT_FOUND"
INVALID_STATUS = "INVALID_STATUS"
INVALID_PRIORITY = "INVALID_PRIORITY"
INVALID_RECURRENCE = "INVALID_RECURRENCE"
ASSIGNEE_NOT_FAMILY_MEMBER = "ASSIGNEE_NOT_FAMILY_MEMBER"

# ── Invitations ───────────────────────────────────────────────
INVITATION_NOT_FOUND = "INVITATION_NOT_FOUND"
INVITATION_INVALID = "INVITATION_INVALID"
INVITATION_REVOKED = "INVITATION_REVOKED"
INVITATION_EXPIRED = "INVITATION_EXPIRED"
INVITATION_FULLY_USED = "INVITATION_FULLY_USED"

# ── Shopping ──────────────────────────────────────────────────
SHOPPING_LIST_NOT_FOUND = "SHOPPING_LIST_NOT_FOUND"
SHOPPING_ITEM_NOT_FOUND = "SHOPPING_ITEM_NOT_FOUND"

# ── Calendar ──────────────────────────────────────────────────
EVENT_NOT_FOUND = "EVENT_NOT_FOUND"
END_BEFORE_START = "END_BEFORE_START"

# ── Birthdays ─────────────────────────────────────────────────
BIRTHDAY_NOT_FOUND = "BIRTHDAY_NOT_FOUND"
INVALID_MONTH = "INVALID_MONTH"
INVALID_DAY = "INVALID_DAY"

# ── API Tokens ────────────────────────────────────────────────
API_TOKEN_NOT_FOUND = "API_TOKEN_NOT_FOUND"
API_TOKEN_NO_ACCESS = "API_TOKEN_NO_ACCESS"
INVALID_SCOPES = "INVALID_SCOPES"
TOKEN_LIMIT_REACHED = "TOKEN_LIMIT_REACHED"

# ── Backup ────────────────────────────────────────────────────
BACKUP_NOT_FOUND = "BACKUP_NOT_FOUND"
BACKUP_FAILED = "BACKUP_FAILED"

# ── Setup ─────────────────────────────────────────────────────
SETUP_ALREADY_COMPLETED = "SETUP_ALREADY_COMPLETED"
INVALID_FILE_FORMAT = "INVALID_FILE_FORMAT"
RESTORE_IN_PROGRESS = "RESTORE_IN_PROGRESS"
RESTORE_FAILED = "RESTORE_FAILED"

# ── Contacts ─────────────────────────────────────────────────
CONTACT_NOT_FOUND = "CONTACT_NOT_FOUND"
CSV_MISSING_COLUMN = "CSV_MISSING_COLUMN"

# ── Notifications ─────────────────────────────────────────────
NOTIFICATION_NOT_FOUND = "NOTIFICATION_NOT_FOUND"

# ── Navigation ────────────────────────────────────────────────
UNKNOWN_NAV_KEYS = "UNKNOWN_NAV_KEYS"

# ── Gifts ────────────────────────────────────────────────────
GIFT_NOT_FOUND = "GIFT_NOT_FOUND"
GIFT_RECIPIENT_NOT_FAMILY_MEMBER = "GIFT_RECIPIENT_NOT_FAMILY_MEMBER"
GIFT_RECIPIENT_CONFLICT = "GIFT_RECIPIENT_CONFLICT"
INVALID_GIFT_STATUS = "INVALID_GIFT_STATUS"
INVALID_GIFT_URL = "INVALID_GIFT_URL"
INVALID_GIFT_SORT = "INVALID_GIFT_SORT"

# ── Meal Plans ───────────────────────────────────────────────
MEAL_PLAN_NOT_FOUND = "MEAL_PLAN_NOT_FOUND"
INVALID_MEAL_SLOT = "INVALID_MEAL_SLOT"
INVALID_MEAL_RANGE = "INVALID_MEAL_RANGE"
MEAL_SLOT_TAKEN = "MEAL_SLOT_TAKEN"
MEAL_INGREDIENT_NOT_IN_PLAN = "MEAL_INGREDIENT_NOT_IN_PLAN"

# ── Rewards ──────────────────────────────────────────────────
REWARD_CURRENCY_NOT_FOUND = "REWARD_CURRENCY_NOT_FOUND"
REWARD_CURRENCY_ALREADY_EXISTS = "REWARD_CURRENCY_ALREADY_EXISTS"
EARNING_RULE_NOT_FOUND = "EARNING_RULE_NOT_FOUND"
REWARD_NOT_FOUND = "REWARD_NOT_FOUND"
REWARD_TRANSACTION_NOT_FOUND = "REWARD_TRANSACTION_NOT_FOUND"
REWARD_TRANSACTION_NOT_PENDING = "REWARD_TRANSACTION_NOT_PENDING"
REWARD_TARGET_NOT_MEMBER = "REWARD_TARGET_NOT_MEMBER"
INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE"
REWARD_INACTIVE = "REWARD_INACTIVE"


_DEFAULT_MESSAGES: dict[str, str] = {
    INVALID_TOKEN: "Invalid token",
    TOKEN_EXPIRED: "Token expired",
    UNAUTHENTICATED: "Not authenticated",
    USER_NOT_FOUND: "User not found",
    INVALID_CREDENTIALS: "Invalid credentials",
    OLD_PASSWORD_INCORRECT: "Old password is incorrect",
    NO_FAMILY_ACCESS: "No access to this family",
    ADULT_REQUIRED: "Adult permission required",
    ADMIN_REQUIRED: "Admin role required",
    INSUFFICIENT_SCOPE: "Token missing scope: {scope}",
    EMAIL_ALREADY_EXISTS: "Email already exists",
    MEMBER_NOT_FOUND: "Member not found",
    NOT_A_MEMBER: "Not a member of this family",
    INVALID_ROLE: "Role must be admin or member",
    ONLY_ADULTS_ADMIN: "Only adults can be admin",
    CANNOT_DEMOTE_SELF: "Cannot demote yourself",
    CANNOT_CHANGE_OWN_ADULT: "Cannot change own adult status",
    CANNOT_REMOVE_SELF: "Cannot remove yourself",
    LAST_ADMIN: "Cannot leave: you are the only admin. Transfer admin role first",
    INVALID_CONFIRMATION: "Type DELETE to confirm account deletion",
    CANNOT_RESET_OWN_PASSWORD: "Cannot reset your own password here",
    COLOR_NOT_ALLOWED: "Color not in allowed palette",
    COLOR_ALREADY_TAKEN: "Color already taken by another member",
    TASK_NOT_FOUND: "Task not found",
    INVALID_STATUS: "Invalid status: {status}",
    INVALID_PRIORITY: "Invalid priority: {priority}",
    INVALID_RECURRENCE: "Invalid recurrence: {recurrence}",
    ASSIGNEE_NOT_FAMILY_MEMBER: "Assignee is not a family member",
    INVITATION_NOT_FOUND: "Invitation not found",
    INVITATION_INVALID: "Invalid invitation link",
    INVITATION_REVOKED: "Invitation has been revoked",
    INVITATION_EXPIRED: "Invitation has expired",
    INVITATION_FULLY_USED: "Invitation has been fully used",
    SHOPPING_LIST_NOT_FOUND: "Shopping list not found",
    SHOPPING_ITEM_NOT_FOUND: "Shopping item not found",
    EVENT_NOT_FOUND: "Event not found",
    END_BEFORE_START: "End must be after start",
    BIRTHDAY_NOT_FOUND: "Birthday not found",
    INVALID_MONTH: "Month must be between 1 and 12",
    INVALID_DAY: "Day must be between 1 and 31",
    API_TOKEN_NOT_FOUND: "Token not found",
    API_TOKEN_NO_ACCESS: "No access to this token",
    INVALID_SCOPES: "Invalid scopes: {scopes}",
    TOKEN_LIMIT_REACHED: "Maximum {limit} tokens reached",
    BACKUP_NOT_FOUND: "Backup not found",
    BACKUP_FAILED: "Backup failed: {reason}",
    SETUP_ALREADY_COMPLETED: "Setup already completed",
    INVALID_FILE_FORMAT: "File must be a .tar.gz archive",
    RESTORE_IN_PROGRESS: "Restore already in progress",
    RESTORE_FAILED: "Restore failed: {reason}",
    CONTACT_NOT_FOUND: "Contact not found",
    CSV_MISSING_COLUMN: "CSV requires at least the column full_name",
    NOTIFICATION_NOT_FOUND: "Notification not found",
    UNKNOWN_NAV_KEYS: "Unknown nav keys: {keys}",
    REWARD_CURRENCY_NOT_FOUND: "Reward currency not found",
    REWARD_CURRENCY_ALREADY_EXISTS: "This family already has a reward currency",
    EARNING_RULE_NOT_FOUND: "Earning rule not found",
    REWARD_NOT_FOUND: "Reward not found",
    REWARD_TRANSACTION_NOT_FOUND: "Transaction not found",
    REWARD_TRANSACTION_NOT_PENDING: "Transaction is not in pending state",
    REWARD_TARGET_NOT_MEMBER: "Target user is not a family member",
    INSUFFICIENT_BALANCE: "Insufficient token balance",
    REWARD_INACTIVE: "This reward is no longer available",
    GIFT_NOT_FOUND: "Gift not found",
    GIFT_RECIPIENT_NOT_FAMILY_MEMBER: "Gift recipient is not a family member",
    GIFT_RECIPIENT_CONFLICT: "Provide either a family member or an external recipient name, not both",
    INVALID_GIFT_STATUS: "Invalid gift status: {status}",
    INVALID_GIFT_URL: "Gift URL must start with http:// or https://",
    INVALID_GIFT_SORT: "Invalid gift sort: {sort}",
    MEAL_PLAN_NOT_FOUND: "Meal plan entry not found",
    INVALID_MEAL_SLOT: "Invalid meal slot: {slot}",
    INVALID_MEAL_RANGE: "End date must be on or after start date",
    MEAL_SLOT_TAKEN: "This family already has a meal planned for that date and slot",
    MEAL_INGREDIENT_NOT_IN_PLAN: "Ingredient '{name}' is not part of this meal",
}


def error_detail(code: str, **params: object) -> dict:
    """Build a structured error detail dict for HTTPException."""
    msg = _DEFAULT_MESSAGES.get(code, code)
    if params:
        try:
            msg = msg.format(**params)
        except KeyError:
            pass
    result: dict = {"code": code, "message": msg}
    if params:
        result["params"] = {k: str(v) for k, v in params.items()}
    return result
