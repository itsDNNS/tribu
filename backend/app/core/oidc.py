"""Core OIDC plumbing: configuration storage, discovery, and helpers.

The actual login / callback endpoints live in
``app.modules.oidc_router`` and consume the helpers here. Everything
that touches the database uses ``SystemSetting`` rows keyed by
``oidc_*``; nothing is cached in module-level state other than the
discovery document (which is network-bound and safe to memoize for a
few minutes).

Secrets handling: the client secret is stored plaintext in
``system_settings``. This matches the trust model of existing
sensitive values (``JWT_SECRET``, backup encryption key) which also
live outside encrypted storage. The self-hosting docs call this out
so operators can pick filesystem encryption if they need it.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.core.oidc_presets import get_preset
from app.core.utils import get_setting, set_setting, utcnow
from app.models import SystemSetting

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Setting keys
# ---------------------------------------------------------------------------

# Persisted via SystemSetting rows. Kept in one place so tests and
# admin endpoints stay in sync.
KEY_ENABLED = "oidc_enabled"
KEY_PRESET = "oidc_preset"
KEY_BUTTON_LABEL = "oidc_button_label"
KEY_ISSUER = "oidc_issuer"
KEY_CLIENT_ID = "oidc_client_id"
KEY_CLIENT_SECRET = "oidc_client_secret"
KEY_SCOPES = "oidc_scopes"
KEY_ALLOW_SIGNUP = "oidc_allow_signup"
KEY_DISABLE_PASSWORD_LOGIN = "oidc_disable_password_login"

ALL_KEYS = (
    KEY_ENABLED,
    KEY_PRESET,
    KEY_BUTTON_LABEL,
    KEY_ISSUER,
    KEY_CLIENT_ID,
    KEY_CLIENT_SECRET,
    KEY_SCOPES,
    KEY_ALLOW_SIGNUP,
    KEY_DISABLE_PASSWORD_LOGIN,
)


# ---------------------------------------------------------------------------
# Typed accessor
# ---------------------------------------------------------------------------


@dataclass
class OIDCConfig:
    """Snapshot of the OIDC configuration as stored in the DB.

    Only values actually used by the login flow are typed here. The
    admin read endpoint returns the raw setting map plus a masked
    client_secret, which is a separate concern.
    """
    enabled: bool = False
    preset: str = "generic"
    button_label: str = ""
    issuer: str = ""
    client_id: str = ""
    client_secret: str = ""
    scopes: str = "openid profile email"
    allow_signup: bool = False
    disable_password_login: bool = False

    def is_ready(self) -> bool:
        """True if enough fields are set to actually attempt a login.

        ``enabled`` alone is not enough — an admin can save the flag
        before finishing the form. The login button is hidden unless
        every critical field is present.
        """
        return bool(
            self.enabled
            and self.issuer
            and self.client_id
            and self.client_secret
        )

    def effective_button_label(self) -> str:
        """Label displayed on the login button.

        Falls back to the preset default when the admin leaves the
        field empty. Users always see *something* so they know the
        button triggers SSO instead of a generic submit.
        """
        if self.button_label:
            return self.button_label
        return get_preset(self.preset)["button_label"]


def _as_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


def load_config(db: Session) -> OIDCConfig:
    """Read the current config from the database.

    Missing rows fall back to ``OIDCConfig`` defaults so the function
    never raises. ``get_setting`` returns an empty string for unset
    keys, and booleans coerce to False.
    """
    return OIDCConfig(
        enabled=_as_bool(get_setting(db, KEY_ENABLED, "false")),
        preset=get_setting(db, KEY_PRESET, "generic") or "generic",
        button_label=get_setting(db, KEY_BUTTON_LABEL, ""),
        issuer=get_setting(db, KEY_ISSUER, ""),
        client_id=get_setting(db, KEY_CLIENT_ID, ""),
        client_secret=get_setting(db, KEY_CLIENT_SECRET, ""),
        scopes=get_setting(db, KEY_SCOPES, "") or "openid profile email",
        allow_signup=_as_bool(get_setting(db, KEY_ALLOW_SIGNUP, "false")),
        disable_password_login=_as_bool(
            get_setting(db, KEY_DISABLE_PASSWORD_LOGIN, "false")
        ),
    )


def lock_config(db: Session) -> None:
    """Serialize concurrent admin writes via row-level locking.

    Takes a ``SELECT ... FOR UPDATE`` on the ``oidc_enabled`` row so
    a concurrent ``PUT /admin/oidc`` blocks instead of interleaving
    its read/write pass with ours. On SQLite this is a no-op but the
    default journal mode already serializes writes, so the
    behaviour is the same.

    The very first request must create the sentinel row. Two
    concurrent first-requests both see no row and both try to
    insert: on PostgreSQL the second insert raises IntegrityError on
    the primary key. We catch that, roll back the failed insert, and
    re-run the SELECT FOR UPDATE which now finds the row committed
    by the winner — the loser waits on the lock held by whoever
    successfully did the insert.
    """
    from sqlalchemy.exc import IntegrityError

    for _ in range(2):
        row = (
            db.query(SystemSetting)
            .filter(SystemSetting.key == KEY_ENABLED)
            .with_for_update()
            .first()
        )
        if row is not None:
            return
        try:
            db.add(SystemSetting(key=KEY_ENABLED, value="false", updated_at=utcnow()))
            db.flush()
            return
        except IntegrityError:
            db.rollback()
            # Fall through to the next iteration; the winning
            # transaction has now either committed or still holds
            # the lock, so our FOR UPDATE will either return the row
            # or block on it.
            continue
    # If we get here a third attempt would be needed; surface the
    # state clearly instead of looping forever.
    raise RuntimeError("Could not acquire OIDC config lock")


def save_config(
    db: Session,
    *,
    enabled: bool,
    preset: str,
    button_label: str,
    issuer: str,
    client_id: str,
    client_secret: Optional[str],
    scopes: str,
    allow_signup: bool,
    disable_password_login: bool,
) -> None:
    """Upsert the OIDC config.

    ``client_secret=None`` means "leave the stored secret untouched"
    so the admin UI can render without re-typing the secret on every
    save. An empty string deliberately clears the secret.
    """
    set_setting(db, KEY_ENABLED, "true" if enabled else "false")
    set_setting(db, KEY_PRESET, preset)
    set_setting(db, KEY_BUTTON_LABEL, button_label)
    set_setting(db, KEY_ISSUER, issuer.rstrip("/"))
    set_setting(db, KEY_CLIENT_ID, client_id)
    if client_secret is not None:
        set_setting(db, KEY_CLIENT_SECRET, client_secret)
    set_setting(db, KEY_SCOPES, scopes.strip())
    set_setting(db, KEY_ALLOW_SIGNUP, "true" if allow_signup else "false")
    set_setting(
        db,
        KEY_DISABLE_PASSWORD_LOGIN,
        "true" if disable_password_login else "false",
    )


def password_login_disabled(db: Session) -> bool:
    """Return True if local password login should be refused.

    The flag is only honored when OIDC is both enabled AND ready to
    use. Otherwise we would lock admins out whenever they
    accidentally flip the toggle before finishing OIDC setup, which
    is exactly the kind of footgun the issue asked to avoid.
    """
    cfg = load_config(db)
    return cfg.is_ready() and cfg.disable_password_login


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


@dataclass
class Discovery:
    """Subset of the OIDC discovery document Tribu actually uses."""
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: Optional[str]
    jwks_uri: str
    raw: dict = field(default_factory=dict)


# Module-level memoization so repeat login attempts within the same
# process do not re-fetch the discovery document. 5-minute TTL keeps
# admin rotations of issuer metadata from being hidden for too long.
_DISCOVERY_TTL_SECONDS = 300
_discovery_cache: dict[str, tuple[float, Discovery]] = {}


class DiscoveryError(RuntimeError):
    """Raised when discovery fails in a user-actionable way."""


_MAX_DISCOVERY_BYTES = 1_000_000  # 1 MB — real discovery docs are < 10 KB

# Opener configured with only http/https handlers so that URLs with
# schemes like file://, ftp://, or gopher:// cannot be dereferenced
# even if they slip through upstream validation. urllib's default
# opener includes a FileHandler which would happily read /etc/passwd.
_http_only_opener = urllib.request.build_opener(
    urllib.request.HTTPHandler(),
    urllib.request.HTTPSHandler(),
)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Treat 3xx responses as errors.

    Discovery documents are published at a fixed path on the issuer;
    a redirect here is either an operator misconfig or — more
    worrying — an IdP aliasing redirect that would let a rogue party
    point us at their document. Easier to reject outright.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code, f"Unexpected redirect to {newurl}", headers, fp
        )


_strict_opener = urllib.request.build_opener(
    urllib.request.HTTPHandler(),
    urllib.request.HTTPSHandler(),
    _NoRedirectHandler(),
)


def _validate_http_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise DiscoveryError(
            f"Issuer URL must use http or https (got {parsed.scheme!r})"
        )
    if not parsed.netloc:
        raise DiscoveryError("Issuer URL is missing a host")


def _fetch_json(url: str, timeout: float = 5.0) -> dict:
    """Fetch a JSON document over HTTP(S) with strict transport rules.

    - Rejects non-HTTP(S) schemes before the request is made (no
      file://, ftp://, gopher://, ...).
    - Uses a dedicated opener so any redirect-based scheme downgrade
      attempt is refused.
    - Caps the response body so a hostile endpoint cannot exhaust
      memory by streaming gigabytes.
    """
    _validate_http_url(url)
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "tribu-oidc/1.0"},
    )
    try:
        with _strict_opener.open(req, timeout=timeout) as resp:
            body = resp.read(_MAX_DISCOVERY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        # _NoRedirectHandler raises HTTPError for 3xx so redirects
        # surface as DiscoveryError like any other protocol failure.
        raise DiscoveryError(
            f"Discovery request to {url} failed with HTTP {exc.code}"
        ) from exc
    if len(body) > _MAX_DISCOVERY_BYTES:
        raise DiscoveryError(
            f"Discovery response from {url} exceeded {_MAX_DISCOVERY_BYTES} bytes"
        )
    try:
        return json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise DiscoveryError(f"Invalid JSON from {url}") from exc


def _discovery_url(issuer: str) -> str:
    base = issuer.rstrip("/")
    return f"{base}/.well-known/openid-configuration"


def fetch_discovery(issuer: str, *, force: bool = False) -> Discovery:
    """Load and validate the discovery document for ``issuer``.

    Raises ``DiscoveryError`` if the HTTP fetch fails or the document
    lacks a required endpoint. The returned object only exposes the
    fields the login flow actually reads; the full JSON is kept as
    ``.raw`` for tests and for admin diagnostics.
    """
    issuer = issuer.rstrip("/")
    now = time.monotonic()
    if not force:
        cached = _discovery_cache.get(issuer)
        if cached and cached[0] > now:
            return cached[1]

    url = _discovery_url(issuer)
    try:
        data = _fetch_json(url)
    except urllib.error.HTTPError as exc:
        raise DiscoveryError(
            f"Discovery failed with HTTP {exc.code} at {url}"
        ) from exc
    except urllib.error.URLError as exc:
        raise DiscoveryError(f"Discovery unreachable at {url}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise DiscoveryError(f"Discovery timed out at {url}") from exc

    required = ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri")
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise DiscoveryError(
            f"Discovery document missing required fields: {', '.join(missing)}"
        )

    # Some IdPs issue discovery at a slightly different URL than the
    # issuer claim (trailing slash mismatch). We require the claim
    # itself to match the configured issuer after stripping trailing
    # slashes to protect against mix-up / phishing via a rogue
    # discovery endpoint.
    claimed = str(data["issuer"]).rstrip("/")
    if claimed != issuer:
        raise DiscoveryError(
            f"Issuer mismatch: configured {issuer!r}, document says {claimed!r}"
        )

    disc = Discovery(
        issuer=claimed,
        authorization_endpoint=data["authorization_endpoint"],
        token_endpoint=data["token_endpoint"],
        userinfo_endpoint=data.get("userinfo_endpoint"),
        jwks_uri=data["jwks_uri"],
        raw=data,
    )
    _discovery_cache[issuer] = (now + _DISCOVERY_TTL_SECONDS, disc)
    return disc


def invalidate_discovery_cache(issuer: Optional[str] = None) -> None:
    """Drop cached discovery data.

    Called after the admin saves new OIDC settings so the next login
    attempt re-fetches immediately instead of waiting out the TTL.
    """
    if issuer is None:
        _discovery_cache.clear()
    else:
        _discovery_cache.pop(issuer.rstrip("/"), None)


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------

import base64
import hashlib
import secrets


def generate_code_verifier() -> str:
    """Return a fresh PKCE code_verifier (RFC 7636 §4.1)."""
    return base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode("ascii")


def code_challenge_s256(code_verifier: str) -> str:
    """S256 transformation of a verifier (RFC 7636 §4.2)."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------
# Token exchange + ID token verification
# ---------------------------------------------------------------------------


class TokenExchangeError(RuntimeError):
    """Raised when the IdP rejects our /token call."""


class IDTokenError(RuntimeError):
    """Raised when the IdP's ID token fails validation."""


@dataclass
class IDTokenClaims:
    subject: str
    email: Optional[str]
    email_verified: bool
    name: Optional[str]
    raw: dict = field(default_factory=dict)


def exchange_code_for_tokens(
    *,
    token_endpoint: str,
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
    code_verifier: str,
    timeout: float = 5.0,
) -> dict:
    """POST the authorization code to the IdP and return the token response.

    Uses ``client_secret_post`` (secret in form body). Most IdPs also
    accept ``client_secret_basic`` but post is the widest-supported
    default among Authentik, Zitadel, and Keycloak with their stock
    OIDC clients.
    """
    import urllib.error
    import urllib.parse
    import urllib.request

    _validate_http_url(token_endpoint)
    form = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
        "code_verifier": code_verifier,
    }).encode("ascii")
    req = urllib.request.Request(
        token_endpoint,
        data=form,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "tribu-oidc/1.0",
        },
    )
    try:
        with _strict_opener.open(req, timeout=timeout) as resp:
            body = resp.read(_MAX_DISCOVERY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        try:
            error_body = exc.read(1024).decode("utf-8", errors="replace")
        except Exception:
            error_body = ""
        logger.warning(
            "OIDC token exchange failed: HTTP %s at %s body=%r",
            exc.code, token_endpoint, error_body[:200],
        )
        raise TokenExchangeError(
            f"Token endpoint returned HTTP {exc.code}"
        ) from exc
    except urllib.error.URLError as exc:
        raise TokenExchangeError(
            f"Token endpoint unreachable: {exc.reason}"
        ) from exc
    except TimeoutError as exc:
        raise TokenExchangeError("Token endpoint timed out") from exc
    if len(body) > _MAX_DISCOVERY_BYTES:
        raise TokenExchangeError("Token response exceeded size cap")
    try:
        data = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise TokenExchangeError("Token response was not valid JSON") from exc

    if not isinstance(data, dict) or "id_token" not in data:
        raise TokenExchangeError("Token response missing id_token")
    return data


def verify_id_token(
    id_token: str,
    *,
    issuer: str,
    client_id: str,
    jwks_uri: str,
    expected_nonce: Optional[str],
) -> IDTokenClaims:
    """Verify signature and required claims of an OIDC ID token.

    Uses PyJWT's ``PyJWKClient`` to fetch signing keys lazily. The
    JWKS URL is whitelisted to http(s) up front and PyJWT itself
    validates ``iss``, ``aud``, and ``exp``. We verify ``nonce``
    manually because PyJWT has no built-in support for it.
    """
    import jwt
    from jwt import PyJWKClient

    _validate_http_url(jwks_uri)
    jwk_client = PyJWKClient(jwks_uri, cache_keys=True, lifespan=300)
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(id_token)
    except jwt.PyJWTError as exc:
        raise IDTokenError(f"Could not resolve signing key: {exc}") from exc
    except Exception as exc:  # urllib failures inside PyJWKClient
        raise IDTokenError(f"JWKS fetch failed: {exc}") from exc

    try:
        payload = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name] if signing_key.algorithm_name else ["RS256", "ES256"],
            audience=client_id,
            issuer=issuer,
            options={"require": ["iss", "aud", "exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise IDTokenError(f"ID token validation failed: {exc}") from exc

    if expected_nonce is not None:
        got = payload.get("nonce")
        if got != expected_nonce:
            raise IDTokenError("ID token nonce mismatch")

    sub = payload.get("sub")
    if not sub:
        raise IDTokenError("ID token has no subject")

    return IDTokenClaims(
        subject=str(sub),
        email=payload.get("email"),
        email_verified=bool(payload.get("email_verified", False)),
        name=payload.get("name") or payload.get("preferred_username"),
        raw=payload,
    )
