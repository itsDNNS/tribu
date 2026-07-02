from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_local_web_origin_get_responses_include_cors_headers():
    origin = "http://127.0.0.1:50448"

    health = client.get("/health", headers={"Origin": origin})
    assert health.status_code == 200
    assert health.headers["access-control-allow-origin"] == origin

    unauthorized = client.get("/auth/me", headers={"Origin": origin})
    assert unauthorized.status_code == 401
    assert unauthorized.headers["access-control-allow-origin"] == origin


def test_local_web_origin_preflight_allows_authorization_header():
    origin = "http://127.0.0.1:50448"

    response = client.options(
        "/auth/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "Authorization" in response.headers["access-control-allow-headers"]


def test_lan_origin_is_not_allowed_by_default():
    response = client.get("/health", headers={"Origin": "http://192.168.1.20:3000"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_rate_limit_key_uses_forwarded_for_only_from_trusted_proxy():
    from types import SimpleNamespace
    from app.main import rate_limit_key

    trusted = SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        headers={"x-forwarded-for": "203.0.113.7, 10.0.0.2"},
    )
    untrusted = SimpleNamespace(
        client=SimpleNamespace(host="198.51.100.9"),
        headers={"x-forwarded-for": "203.0.113.7"},
    )

    assert rate_limit_key(trusted) == "203.0.113.7"
    assert rate_limit_key(untrusted) == "198.51.100.9"
