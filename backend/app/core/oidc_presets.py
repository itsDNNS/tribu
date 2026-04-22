"""Provider presets for common self-hosted identity providers.

These are pure metadata: they help the admin UI pre-fill issuer
placeholders and explain where to find the right values. They do NOT
bake in IdP-specific discovery endpoints — every supported provider
implements the OIDC Discovery spec at
``<issuer>/.well-known/openid-configuration`` and we always resolve
through that.

Adding a preset is cheap: drop another entry into ``PRESETS`` with a
sensible placeholder and a button-label hint. The backend treats the
configured flow as identical regardless of which preset was picked.
"""
from __future__ import annotations

from typing import TypedDict


class Preset(TypedDict):
    id: str
    name: str
    button_label: str
    issuer_placeholder: str
    default_scopes: str
    hint: str


PRESETS: dict[str, Preset] = {
    "generic": {
        "id": "generic",
        "name": "Generic OIDC",
        "button_label": "Sign in with SSO",
        "issuer_placeholder": "https://idp.example.com",
        "default_scopes": "openid profile email",
        "hint": (
            "Enter the issuer URL of your OpenID Connect provider. "
            "Tribu discovers endpoints from "
            "<issuer>/.well-known/openid-configuration."
        ),
    },
    "authentik": {
        "id": "authentik",
        "name": "Authentik",
        "button_label": "Sign in with Authentik",
        "issuer_placeholder": "https://auth.example.com/application/o/tribu/",
        "default_scopes": "openid profile email",
        "hint": (
            "Create an OAuth2/OpenID Provider in Authentik for Tribu. "
            "The issuer is the value of 'OpenID Configuration Issuer' "
            "on the provider page; it normally ends with a trailing slash."
        ),
    },
    "zitadel": {
        "id": "zitadel",
        "name": "Zitadel",
        "button_label": "Sign in with Zitadel",
        "issuer_placeholder": "https://your-instance-xxxx.zitadel.cloud",
        "default_scopes": "openid profile email",
        "hint": (
            "In Zitadel, add a Web application with PKCE. The issuer is "
            "your instance root URL (no trailing path). Tribu uses the "
            "Web flow with client secret and PKCE."
        ),
    },
    "keycloak": {
        "id": "keycloak",
        "name": "Keycloak",
        "button_label": "Sign in with Keycloak",
        "issuer_placeholder": "https://keycloak.example.com/realms/<realm>",
        "default_scopes": "openid profile email",
        "hint": (
            "Create a confidential OIDC client in the Keycloak realm "
            "that hosts your users. The issuer is "
            "<keycloak>/realms/<realm> (no trailing slash)."
        ),
    },
}


def get_preset(preset_id: str) -> Preset:
    """Return a preset, falling back to ``generic`` on unknown id.

    The UI always picks a known value, so the fallback only kicks in
    when an admin edits the stored setting directly. A missing preset
    then still yields a working login screen.
    """
    return PRESETS.get(preset_id, PRESETS["generic"])


def list_presets() -> list[Preset]:
    return list(PRESETS.values())
