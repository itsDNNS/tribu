from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core import auth_sessions
from app.core.fetch_metadata import is_foreign_cookie_request
from app.main import app


client = TestClient(app)
SESSION = {"tribu_token": "x"}


@pytest.mark.parametrize(
    ("method", "headers", "cookies", "blocked"),
    [
        ("POST", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "cors"}, SESSION, True),
        ("POST", {"sec-fetch-site": "same-site", "sec-fetch-mode": "cors"}, SESSION, True),
        ("GET", {"sec-fetch-site": "same-site", "sec-fetch-mode": "cors"}, SESSION, True),
        ("POST", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate"}, SESSION, True),
        ("POST", {"sec-fetch-site": "cross-site"}, {"tribu_refresh": "x"}, True),
        ("GET", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate"}, SESSION, False),
        ("POST", {"sec-fetch-site": "same-origin", "sec-fetch-mode": "cors"}, SESSION, False),
        ("POST", {"sec-fetch-site": "none"}, SESSION, False),
        ("POST", {}, SESSION, False),
        ("POST", {"sec-fetch-site": "cross-site", "sec-fetch-mode": "cors"}, {}, False),
    ],
)
def test_only_foreign_cookie_requests_are_blocked(method, headers, cookies, blocked):
    assert is_foreign_cookie_request(method, headers, cookies) is blocked


def test_configured_origins_may_use_the_session_cookie(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com; https://other.example.com")
    headers = {"sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "origin": "https://app.example.com"}

    assert is_foreign_cookie_request("POST", headers, SESSION) is False
    assert is_foreign_cookie_request("POST", {**headers, "origin": "https://evil.example.com"}, SESSION) is True


def test_middleware_rejects_cross_site_cookie_writes():
    blocked = client.post("/auth/logout", headers={"Cookie": "tribu_token=x", "Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "cors"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "CROSS_SITE_REQUEST"

    allowed = client.post("/auth/logout", headers={"Cookie": "tribu_token=x", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors"})
    assert allowed.status_code == 200


def _request(scheme="http", forwarded=None):
    headers = {"x-forwarded-proto": forwarded} if forwarded else {}
    return SimpleNamespace(url=SimpleNamespace(scheme=scheme), headers=headers)


@pytest.mark.parametrize(
    ("setting", "request_", "secure"),
    [
        ("auto", _request("https"), True),
        ("auto", _request("http", "https"), True),
        ("auto", _request("http", "https,http"), True),
        ("auto", _request("http", "http"), False),
        ("auto", _request("http"), False),
        ("true", _request("http"), True),
        ("false", _request("https"), False),
    ],
)
def test_cookies_follow_the_browser_scheme_unless_configured(monkeypatch, setting, request_, secure):
    monkeypatch.setattr(auth_sessions, "SECURE_COOKIES", setting)
    assert auth_sessions.cookie_secure(request_) is secure
