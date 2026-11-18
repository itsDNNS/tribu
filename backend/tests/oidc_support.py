"""Shared seeds for the OIDC tests: a simulated IdP's discovery document,
stored OIDC settings and users as single sign-on finds them."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core import oidc as oidc_core
from app.models import User
from app.security import hash_password
from tests.support import TestSession

ISSUER = "https://idp.example.com"


def discovery_document(issuer: str = ISSUER) -> dict:
    """A complete discovery document for ``issuer``."""
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/authorize",
        "token_endpoint": f"{issuer}/token",
        "userinfo_endpoint": f"{issuer}/userinfo",
        "jwks_uri": f"{issuer}/jwks",
    }


def save_oidc_config(
    db: Session,
    *,
    enabled: bool = True,
    button_label: str = "",
    issuer: str = ISSUER,
    client_id: str = "tribu-client",
    client_secret: str = "topsecret",
    allow_signup: bool = False,
    disable_password_login: bool = False,
) -> None:
    """Stores a generic-preset OIDC config, ready unless issuer or client are blank."""
    oidc_core.save_config(
        db,
        enabled=enabled,
        preset="generic",
        button_label=button_label,
        issuer=issuer,
        client_id=client_id,
        client_secret=client_secret,
        scopes="openid profile email",
        allow_signup=allow_signup,
        disable_password_login=disable_password_login,
    )


def seed_oidc_config(*, proven: bool = True, **config) -> None:
    """Commits ``save_oidc_config(**config)``.

    ``proven=True`` also records a recent successful SSO login, which the
    password-login gate requires before it honours ``disable_password_login``.
    """
    with TestSession() as db:
        save_oidc_config(db, **config)
        if proven:
            oidc_core.record_successful_sso_login(db)
        db.commit()


def seed_user(email: str, display_name: str, *, password: str | None = "Secure1Pass") -> int:
    """Commits a user without any family (``password=None`` for SSO-only) and returns the id."""
    with TestSession() as db:
        user = User(
            email=email,
            password_hash=hash_password(password) if password else None,
            display_name=display_name,
        )
        db.add(user)
        db.commit()
        return user.id
