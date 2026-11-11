from __future__ import annotations

from app.ai.provider_config import (
    detect_provider_specs,
    priority_issues,
    validate_base_url,
)
from app.ai.registry import ModelRegistry
from app.core.config import settings


def _clear(monkeypatch) -> None:
    monkeypatch.setattr(
        settings, "provider_priority", "openrouter,openai,deepseek,groq,custom,ollama"
    )
    for field in (
        "openrouter_api_key",
        "openai_api_key",
        "deepseek_api_key",
        "groq_api_key",
        "custom_ai_api_key",
        "custom_ai_base_url",
        "custom_ai_model",
    ):
        monkeypatch.setattr(settings, field, "")
    monkeypatch.setattr(settings, "ollama_enabled", False)


def test_detects_configured_providers_in_priority_order(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setattr(settings, "groq_api_key", "gq-key")
    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")

    specs = detect_provider_specs()
    assert [spec.id for spec in specs] == ["openrouter", "groq"]


def test_base_url_validation_rejects_relative_and_credentialed_urls():
    assert validate_base_url("https://api.example.com/v1") == []
    assert validate_base_url("api.example.com/v1")
    assert validate_base_url("https://user:pass@api.example.com/v1")


def test_placeholder_key_and_bad_url_are_reported(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setattr(settings, "openai_api_key", "sk-...")
    monkeypatch.setattr(settings, "openai_base_url", "not-a-url")

    registry = ModelRegistry()
    assert "openai" not in registry.providers
    issues = " ".join(registry.validation_issues)
    assert "placeholder" in issues
    assert "absolute http(s) URL" in issues


def test_custom_gateway_requires_a_model_id(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setattr(settings, "custom_ai_api_key", "custom-key")
    monkeypatch.setattr(settings, "custom_ai_base_url", "https://gateway.example/v1")

    registry = ModelRegistry()
    assert "custom" not in registry.providers
    assert any("No model IDs" in issue for issue in registry.validation_issues)


def test_unknown_priority_names_are_reported(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setattr(settings, "provider_priority", "openrouter,not-a-provider")

    assert priority_issues() == ["provider_priority: unknown provider 'not-a-provider'"]


def test_registry_uses_valid_key_and_disables_demo(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setattr(settings, "deepseek_api_key", "ds-key")

    registry = ModelRegistry()
    assert registry.has_real_provider is True
    assert "demo" not in registry.providers
    decision = registry.route(task_type="general", tier="balanced")
    assert decision.provider_id == "deepseek"
    assert decision.model == "deepseek-flash"
    assert decision.demo is False
    report = registry.startup_report()
    assert report["demo_mode"] is False
    assert report["priority"] == ["deepseek"]
    assert report["selected"]["balanced"] == "deepseek/deepseek-flash"
