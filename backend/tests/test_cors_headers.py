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
