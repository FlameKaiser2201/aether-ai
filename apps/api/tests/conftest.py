"""Test configuration. Environment is set before the app is imported."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "pytest.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DB_PATH.unlink(missing_ok=True)

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": "sqlite+aiosqlite:///./data/pytest.db",
        "DEMO_MODE": "true",
        "SEED_DEMO": "false",
        "AUTO_CREATE_TABLES": "true",
        "RATE_LIMIT_PER_MINUTE": "10000",
        "CHAT_LIMIT_PER_MINUTE": "10000",
        "AUTH_LIMIT_PER_MINUTE": "10000",
        "JWT_ACCESS_SECRET": "test-access-secret-0123456789abcdef0123456789",
        "JWT_REFRESH_SECRET": "test-refresh-secret-0123456789abcdef0123456789",
        "INTERNAL_API_SECRET": "test-internal-secret-0123456789abcdef012345",
        "TRUSTED_HOSTS": "testserver,localhost,127.0.0.1",
        "LOG_LEVEL": "WARNING",
        # Keep provider detection deterministic even if the developer shell
        # exports real keys. Tests that need a provider monkeypatch settings.
        "PROVIDER_PRIORITY": "openrouter,openai,deepseek,groq,custom,ollama",
        "OPENROUTER_API_KEY": "",
        "OPENAI_API_KEY": "",
        "DEEPSEEK_API_KEY": "",
        "GROQ_API_KEY": "",
        "CUSTOM_AI_API_KEY": "",
        "CUSTOM_AI_BASE_URL": "",
        "CUSTOM_AI_MODEL": "",
        "OLLAMA_ENABLED": "false",
        "WEB_SEARCH_AUTO": "true",
    }
)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def user_tokens(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "tester@example.com",
            "password": "TestPassword!2026",
            "name": "Test User",
        },
    )
    if response.status_code >= 300:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "tester@example.com", "password": "TestPassword!2026"},
        )
    assert response.status_code < 300, response.text
    return response.json()


@pytest.fixture()
def auth_headers(user_tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {user_tokens['access_token']}"}
