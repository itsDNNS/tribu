"""Tests for OIDC configuration storage and discovery helpers.

Covers Phase 1 of issue #156: settings round-trip, preset catalog,
discovery fetch (mocked), and the ``is_ready`` / password-login gate.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core import oidc as oidc_core
from app.core.oidc_presets import PRESETS, get_preset, list_presets
from app.database import Base


engine = create_engine(
    "sqlite:///./test-oidc-config.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    oidc_core.invalidate_discovery_cache()


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Preset catalog
# ---------------------------------------------------------------------------


class TestPresets:
    def test_catalog_contains_all_required_providers(self):
        ids = {p["id"] for p in list_presets()}
        assert {"generic", "authentik", "zitadel", "keycloak"}.issubset(ids)

    def test_every_preset_has_required_fields(self):
        for preset in PRESETS.values():
            assert preset["id"]
            assert preset["name"]
            assert preset["button_label"]
            assert preset["issuer_placeholder"].startswith("http")
            assert "openid" in preset["default_scopes"]
            assert preset["hint"]

    def test_unknown_preset_falls_back_to_generic(self):
        assert get_preset("does-not-exist")["id"] == "generic"


# ---------------------------------------------------------------------------
# Config round-trip
# ---------------------------------------------------------------------------


class TestConfigRoundTrip:
    def test_defaults_when_nothing_stored(self, db):
        cfg = oidc_core.load_config(db)
        assert cfg.enabled is False
        assert cfg.preset == "generic"
        assert cfg.issuer == ""
        assert cfg.client_id == ""
        assert cfg.client_secret == ""
        assert cfg.scopes == "openid profile email"
        assert cfg.allow_signup is False
        assert cfg.disable_password_login is False
        assert cfg.is_ready() is False

    def test_save_and_reload(self, db):
        oidc_core.save_config(
            db,
            enabled=True,
            preset="authentik",
            button_label="Sign in with Home IdP",
            issuer="https://auth.example.com/application/o/tribu",
            client_id="tribu-client",
            client_secret="topsecret",
            scopes="openid profile email",
            allow_signup=True,
            disable_password_login=False,
        )
        db.commit()

        cfg = oidc_core.load_config(db)
        assert cfg.enabled is True
        assert cfg.preset == "authentik"
        assert cfg.button_label == "Sign in with Home IdP"
        # Trailing slash stripped on save so URL concat stays predictable
        assert cfg.issuer == "https://auth.example.com/application/o/tribu"
        assert cfg.client_id == "tribu-client"
        assert cfg.client_secret == "topsecret"
        assert cfg.allow_signup is True
        assert cfg.disable_password_login is False
        assert cfg.is_ready() is True

    def test_secret_passthrough_when_none(self, db):
        oidc_core.save_config(
            db,
            enabled=True,
            preset="generic",
            button_label="",
            issuer="https://idp.example.com",
            client_id="tribu",
            client_secret="initial-secret",
            scopes="openid profile email",
            allow_signup=False,
            disable_password_login=False,
        )
        db.commit()

        # None means "keep existing"
        oidc_core.save_config(
            db,
            enabled=True,
            preset="generic",
            button_label="New label",
            issuer="https://idp.example.com",
            client_id="tribu",
            client_secret=None,
            scopes="openid profile email",
            allow_signup=False,
            disable_password_login=False,
        )
        db.commit()

        cfg = oidc_core.load_config(db)
        assert cfg.client_secret == "initial-secret"
        assert cfg.button_label == "New label"

    def test_empty_string_clears_secret(self, db):
        oidc_core.save_config(
            db, enabled=True, preset="generic", button_label="",
            issuer="https://idp.example.com", client_id="tribu",
            client_secret="will-be-cleared", scopes="openid profile email",
            allow_signup=False, disable_password_login=False,
        )
        db.commit()
        oidc_core.save_config(
            db, enabled=True, preset="generic", button_label="",
            issuer="https://idp.example.com", client_id="tribu",
            client_secret="", scopes="openid profile email",
            allow_signup=False, disable_password_login=False,
        )
        db.commit()
        assert oidc_core.load_config(db).client_secret == ""


# ---------------------------------------------------------------------------
# password_login_disabled gate
# ---------------------------------------------------------------------------


class TestPasswordLoginGate:
    def _store(self, db, *, enabled: bool, disable_flag: bool, ready: bool):
        oidc_core.save_config(
            db,
            enabled=enabled,
            preset="generic",
            button_label="",
            issuer="https://idp.example.com" if ready else "",
            client_id="tribu" if ready else "",
            client_secret="s" if ready else "",
            scopes="openid profile email",
            allow_signup=False,
            disable_password_login=disable_flag,
        )
        db.commit()

    def test_flag_ignored_when_oidc_disabled(self, db):
        self._store(db, enabled=False, disable_flag=True, ready=False)
        assert oidc_core.password_login_disabled(db) is False

    def test_flag_ignored_when_not_ready(self, db):
        # enabled=True but issuer/client missing => not ready
        self._store(db, enabled=True, disable_flag=True, ready=False)
        assert oidc_core.password_login_disabled(db) is False

    def test_flag_honoured_when_ready(self, db):
        self._store(db, enabled=True, disable_flag=True, ready=True)
        assert oidc_core.password_login_disabled(db) is True

    def test_flag_off_stays_off(self, db):
        self._store(db, enabled=True, disable_flag=False, ready=True)
        assert oidc_core.password_login_disabled(db) is False


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def _valid_doc(issuer: str = "https://idp.example.com") -> dict:
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/authorize",
        "token_endpoint": f"{issuer}/token",
        "userinfo_endpoint": f"{issuer}/userinfo",
        "jwks_uri": f"{issuer}/jwks",
    }


class TestDiscovery:
    def test_happy_path(self):
        with patch.object(oidc_core, "_fetch_json", return_value=_valid_doc()):
            disc = oidc_core.fetch_discovery("https://idp.example.com", force=True)
        assert disc.issuer == "https://idp.example.com"
        assert disc.authorization_endpoint.endswith("/authorize")
        assert disc.token_endpoint.endswith("/token")
        assert disc.jwks_uri.endswith("/jwks")

    def test_trailing_slash_normalised(self):
        with patch.object(oidc_core, "_fetch_json", return_value=_valid_doc()):
            disc = oidc_core.fetch_discovery("https://idp.example.com/", force=True)
        assert disc.issuer == "https://idp.example.com"

    def test_missing_required_field_raises(self):
        bad = _valid_doc()
        del bad["token_endpoint"]
        with patch.object(oidc_core, "_fetch_json", return_value=bad):
            with pytest.raises(oidc_core.DiscoveryError):
                oidc_core.fetch_discovery("https://idp.example.com", force=True)

    def test_issuer_mismatch_raises(self):
        doc = _valid_doc("https://other.example.com")
        with patch.object(oidc_core, "_fetch_json", return_value=doc):
            with pytest.raises(oidc_core.DiscoveryError):
                oidc_core.fetch_discovery("https://idp.example.com", force=True)

    def test_result_is_cached(self):
        call_count = {"n": 0}

        def fake_fetch(url, timeout=5.0):
            call_count["n"] += 1
            return _valid_doc()

        with patch.object(oidc_core, "_fetch_json", side_effect=fake_fetch):
            oidc_core.fetch_discovery("https://idp.example.com", force=True)
            oidc_core.fetch_discovery("https://idp.example.com")
            oidc_core.fetch_discovery("https://idp.example.com")

        assert call_count["n"] == 1

    def test_cache_invalidation(self):
        call_count = {"n": 0}

        def fake_fetch(url, timeout=5.0):
            call_count["n"] += 1
            return _valid_doc()

        with patch.object(oidc_core, "_fetch_json", side_effect=fake_fetch):
            oidc_core.fetch_discovery("https://idp.example.com", force=True)
            oidc_core.invalidate_discovery_cache()
            oidc_core.fetch_discovery("https://idp.example.com")

        assert call_count["n"] == 2

    def test_force_bypasses_cache(self):
        call_count = {"n": 0}

        def fake_fetch(url, timeout=5.0):
            call_count["n"] += 1
            return _valid_doc()

        with patch.object(oidc_core, "_fetch_json", side_effect=fake_fetch):
            oidc_core.fetch_discovery("https://idp.example.com", force=True)
            oidc_core.fetch_discovery("https://idp.example.com", force=True)

        assert call_count["n"] == 2


class TestRedirectHandling:
    """Discovery must refuse 3xx redirects.

    An IdP should publish its discovery document at a fixed path on
    the issuer; a redirect is either a misconfig or a rogue aliasing
    attempt. We spin up a tiny loopback HTTP server that responds with
    a redirect and assert _fetch_json raises instead of following it.
    """

    @pytest.mark.parametrize("status", [301, 302, 307, 308])
    def test_redirect_rejected(self, status):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(status)
                self.send_header("Location", "http://example.invalid/elsewhere")
                self.end_headers()

            def log_message(self, *args, **kwargs):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{port}/.well-known/openid-configuration"
            with pytest.raises(oidc_core.DiscoveryError):
                oidc_core._fetch_json(url, timeout=2.0)
        finally:
            server.shutdown()
            server.server_close()


class TestSchemeHardening:
    """`_fetch_json` must refuse anything that is not http(s)."""

    @pytest.mark.parametrize(
        "bad",
        [
            "file:///etc/passwd",
            "ftp://idp.example.com/foo",
            "gopher://idp.example.com/",
            "javascript:alert(1)",
            "://no-scheme.example.com",
            "http:///missing-host",
        ],
    )
    def test_non_http_scheme_rejected(self, bad):
        with pytest.raises(oidc_core.DiscoveryError):
            oidc_core._fetch_json(bad)


class TestVerifyIDTokenRealSignature:
    """Exercise verify_id_token against a locally-signed RS256 ID token.

    PyJWKClient is monkeypatched so the JWKS fetch returns our
    throwaway public key. Everything else — signature verification,
    iss/aud/exp enforcement, nonce check, required-claim list, and
    the asymmetric-algorithm allowlist — runs through the real code.
    """

    @pytest.fixture
    def rsa_keypair(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        return private_key, private_key.public_key()

    def _sign(self, private_key, payload: dict) -> str:
        from cryptography.hazmat.primitives import serialization
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        import jwt
        return jwt.encode(payload, pem, algorithm="RS256", headers={"kid": "test-kid"})

    def _install_fake_jwks(self, monkeypatch, public_key):
        import jwt
        from jwt import PyJWK

        class FakeJWK:
            def __init__(self, key, alg):
                self.key = key
                self.algorithm_name = alg

        fake = FakeJWK(public_key, "RS256")

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            def get_signing_key_from_jwt(self, _id_token):
                return fake

        monkeypatch.setattr("jwt.PyJWKClient", FakeClient)

    def test_happy_path(self, rsa_keypair, monkeypatch):
        priv, pub = rsa_keypair
        self._install_fake_jwks(monkeypatch, pub)
        import time as _time
        now = int(_time.time())
        token = self._sign(priv, {
            "iss": "https://idp.example.com",
            "aud": "tribu-client",
            "sub": "subject-123",
            "exp": now + 300,
            "iat": now,
            "email": "anna@example.com",
            "email_verified": True,
            "nonce": "expected-nonce",
            "name": "Anna",
        })
        claims = oidc_core.verify_id_token(
            token,
            issuer="https://idp.example.com",
            client_id="tribu-client",
            jwks_uri="https://idp.example.com/jwks",
            expected_nonce="expected-nonce",
        )
        assert claims.subject == "subject-123"
        assert claims.email == "anna@example.com"
        assert claims.email_verified is True
        assert claims.name == "Anna"

    def test_wrong_issuer_rejected(self, rsa_keypair, monkeypatch):
        priv, pub = rsa_keypair
        self._install_fake_jwks(monkeypatch, pub)
        import time as _time
        now = int(_time.time())
        token = self._sign(priv, {
            "iss": "https://evil.example.com",
            "aud": "tribu-client",
            "sub": "x", "exp": now + 60, "iat": now,
        })
        with pytest.raises(oidc_core.IDTokenError):
            oidc_core.verify_id_token(
                token, issuer="https://idp.example.com",
                client_id="tribu-client",
                jwks_uri="https://idp.example.com/jwks",
                expected_nonce=None,
            )

    def test_wrong_audience_rejected(self, rsa_keypair, monkeypatch):
        priv, pub = rsa_keypair
        self._install_fake_jwks(monkeypatch, pub)
        import time as _time
        now = int(_time.time())
        token = self._sign(priv, {
            "iss": "https://idp.example.com",
            "aud": "someone-else",
            "sub": "x", "exp": now + 60, "iat": now,
        })
        with pytest.raises(oidc_core.IDTokenError):
            oidc_core.verify_id_token(
                token, issuer="https://idp.example.com",
                client_id="tribu-client",
                jwks_uri="https://idp.example.com/jwks",
                expected_nonce=None,
            )

    def test_expired_token_rejected(self, rsa_keypair, monkeypatch):
        priv, pub = rsa_keypair
        self._install_fake_jwks(monkeypatch, pub)
        import time as _time
        now = int(_time.time())
        token = self._sign(priv, {
            "iss": "https://idp.example.com",
            "aud": "tribu-client",
            "sub": "x", "exp": now - 60, "iat": now - 120,
        })
        with pytest.raises(oidc_core.IDTokenError):
            oidc_core.verify_id_token(
                token, issuer="https://idp.example.com",
                client_id="tribu-client",
                jwks_uri="https://idp.example.com/jwks",
                expected_nonce=None,
            )

    def test_nonce_mismatch_rejected(self, rsa_keypair, monkeypatch):
        priv, pub = rsa_keypair
        self._install_fake_jwks(monkeypatch, pub)
        import time as _time
        now = int(_time.time())
        token = self._sign(priv, {
            "iss": "https://idp.example.com",
            "aud": "tribu-client",
            "sub": "x", "exp": now + 60, "iat": now,
            "nonce": "their-nonce",
        })
        with pytest.raises(oidc_core.IDTokenError):
            oidc_core.verify_id_token(
                token, issuer="https://idp.example.com",
                client_id="tribu-client",
                jwks_uri="https://idp.example.com/jwks",
                expected_nonce="our-nonce",
            )

    def test_hs256_id_token_rejected_even_with_matching_key(self, monkeypatch):
        """Algorithm allowlist excludes HS* for ID tokens.

        Guards against the alg-confusion pattern where an attacker
        swaps the JWK for one that declares ``alg=HS256`` and signs
        with the public key as the HMAC secret.
        """
        secret = "some-shared-secret-bytes"

        class FakeJWK:
            key = secret
            algorithm_name = "HS256"

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            def get_signing_key_from_jwt(self, _id_token):
                return FakeJWK()

        monkeypatch.setattr("jwt.PyJWKClient", FakeClient)

        import jwt
        import time as _time
        now = int(_time.time())
        token = jwt.encode(
            {
                "iss": "https://idp.example.com",
                "aud": "tribu-client",
                "sub": "x", "exp": now + 60, "iat": now,
            },
            secret,
            algorithm="HS256",
        )
        with pytest.raises(oidc_core.IDTokenError):
            oidc_core.verify_id_token(
                token, issuer="https://idp.example.com",
                client_id="tribu-client",
                jwks_uri="https://idp.example.com/jwks",
                expected_nonce=None,
            )


class TestVerifyPasswordNullHash:
    """Regression: verify_password must not crash on None/empty hash."""

    def test_none_hash_returns_false(self):
        from app.security import verify_password
        assert verify_password("anything", None) is False

    def test_empty_hash_returns_false(self):
        from app.security import verify_password
        assert verify_password("anything", "") is False

    def test_non_bcrypt_hash_returns_false(self):
        from app.security import verify_password
        assert verify_password("anything", "deadbeef") is False
