from __future__ import annotations


def test_health_endpoints(client):
    assert client.get("/health").status_code == 200
    payload = client.get("/api/v1/health").json()
    assert payload["status"] == "ok"
    assert payload["demo_mode"] is True
    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["database"] is True
    assert ready.json()["demo_mode"] is True

    providers = client.get("/api/v1/health/providers")
    assert providers.status_code == 200
    report = providers.json()
    assert report["demo_mode"] is True
    assert report["providers"] == {}
    assert report["priority"] == []
    assert isinstance(report["validation_issues"], list)


def test_auth_register_login_refresh_and_me(client):
    email = "flow@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "FlowPassword!2026", "name": "Flow User"},
    )
    assert response.status_code == 201, response.text
    tokens = response.json()
    assert tokens["access_token"] and tokens["refresh_token"]
    assert tokens["user"]["email"] == email

    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["name"] == "Flow User"

    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["access_token"] != tokens["access_token"]

    replay = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "token_reuse"


def test_auth_rejects_weak_password(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "weak@example.com", "password": "password", "name": "Weak"},
    )
    assert response.status_code == 422


def test_protected_route_requires_token(client):
    response = client.get("/api/v1/conversations")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_settings_and_models(client, auth_headers):
    settings = client.get("/api/v1/settings", headers=auth_headers)
    assert settings.status_code == 200
    assert settings.json()["preferences"]["theme"] == "dark"
    patched = client.patch(
        "/api/v1/settings", headers=auth_headers, json={"response_style": "concise"}
    )
    assert patched.status_code == 200
    assert patched.json()["preferences"]["response_style"] == "concise"
    models = client.get("/api/v1/models", headers=auth_headers)
    assert models.status_code == 200
    assert models.json()["demo_mode"] is True
