"""New passwords need 12 characters of any kind; signing in still takes the older, shorter ones."""
import pytest
from pydantic import ValidationError

from app.schemas import ChangePasswordRequest, LoginRequest, RegisterRequest, RegisterWithInviteRequest

NEW_PASSWORD_FIELDS = [
    (RegisterRequest, "password", {"email": "anna@example.com", "display_name": "Anna", "family_name": "Family"}),
    (RegisterWithInviteRequest, "password", {"token": "t", "email": "tom@example.com", "display_name": "Tom"}),
    (ChangePasswordRequest, "new_password", {"old_password": "Secure1Pass"}),
]


@pytest.mark.parametrize("schema, field, rest", NEW_PASSWORD_FIELDS)
@pytest.mark.parametrize("password, accepted", [
    ("Secure1Pass", False),  # 11 characters, the old rule's favourite
    ("twelve chars", True),  # no capital, no digit
    ("🐎" * 12, True),  # counted in characters, not bytes
])
def test_new_passwords_need_twelve_characters_of_any_kind(schema, field, rest, password, accepted):
    if accepted:
        schema(**rest, **{field: password})
    else:
        with pytest.raises(ValidationError):
            schema(**rest, **{field: password})


def test_sign_in_still_takes_a_password_set_under_the_old_rule():
    LoginRequest(email="anna@example.com", password="Secure1P")
