from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from app.ai.base import ChatProvider, ProviderError
from app.ai.execution import complete_with_fallback, stream_with_fallback
from app.ai.registry import ModelRegistry
from app.ai.types import (
    ChatMessage,
    GenerationConfig,
    ProviderCapabilities,
    RouteDecision,
    StreamChunk,
    Usage,
)
from app.core.config import settings
from app.services import chat_service


class FakeProvider(ChatProvider):
    capabilities = ProviderCapabilities(streaming=True)

    def __init__(
        self,
        provider_id: str,
        *,
        text: str = "ok",
        fail: bool = False,
        fail_after: int | None = None,
    ) -> None:
        self.id = provider_id
        self.label = provider_id.title()
        self.models = {"balanced": f"{provider_id}-model"}
        self.text = text
        self.fail = fail
        self.fail_after = fail_after
        self.calls = 0

    async def stream(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> AsyncIterator[StreamChunk]:
        self.calls += 1
        if self.fail:
            raise ProviderError(self.id, "provider is down", 502)
        for index in range(3):
            if self.fail_after is not None and index >= self.fail_after:
                raise ProviderError(self.id, "provider dropped the stream", 502)
            yield StreamChunk(text=self.text)
        yield StreamChunk(
            finish_reason="stop",
            usage=Usage(input_tokens=3, output_tokens=2),
        )


def _decision(provider: FakeProvider) -> RouteDecision:
    return RouteDecision(
        provider=provider,
        model=provider.models["balanced"],
        tier="balanced",
        task_type="general",
        reason="test route",
    )


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")
    monkeypatch.setattr(settings, "openai_api_key", "oa-key")
    monkeypatch.setattr(settings, "deepseek_api_key", "ds-key")
    monkeypatch.setattr(settings, "groq_api_key", "gq-key")
    return ModelRegistry()


def test_quality_priority_starts_with_openrouter(configured):
    candidates = configured.candidates(task_type="general", tier="balanced")
    assert candidates[0].provider_id == "openrouter"
    assert candidates[0].model == "anthropic/claude-sonnet-5.5"
    assert [candidate.provider_id for candidate in candidates[:4]] == [
        "openrouter",
        "openai",
        "deepseek",
        "groq",
    ]


def test_demo_mode_is_ignored_when_a_real_key_exists(configured):
    decision = configured.route(task_type="general", tier="balanced")
    assert decision.provider_id == "openrouter"
    assert decision.demo is False
    assert settings.effective_demo_mode is False


def test_demo_is_used_only_without_real_providers(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "custom_ai_api_key", "")
    monkeypatch.setattr(settings, "ollama_enabled", False)
    monkeypatch.setattr(settings, "demo_mode", True)

    registry = ModelRegistry()
    decision = registry.route(task_type="general", tier="balanced")
    assert decision.provider_id == "demo"
    assert decision.demo is True
    assert settings.effective_demo_mode is True


def test_provider_priority_can_be_overridden(configured, monkeypatch):
    monkeypatch.setattr(settings, "provider_priority", "openai,openrouter")
    candidates = configured.candidates(task_type="general", tier="balanced")
    assert candidates[0].provider_id == "openai"
    assert candidates[1].provider_id == "openrouter"


@pytest.mark.asyncio
async def test_complete_falls_back_to_the_next_provider():
    first = FakeProvider("first", fail=True)
    second = FakeProvider("second", text="hello")

    result, used = await complete_with_fallback(
        [_decision(first), _decision(second)],
        [ChatMessage(role="user", content="hi")],
        GenerationConfig(),
    )

    assert used.provider_id == "second"
    assert result.text == "hellohellohello"
    assert first.calls == 1
    assert second.calls == 1


@pytest.mark.asyncio
async def test_stream_falls_back_before_the_first_token():
    first = FakeProvider("first", fail=True)
    second = FakeProvider("second", text="ok")

    events = [
        event
        async for event in stream_with_fallback(
            [_decision(first), _decision(second)],
            [ChatMessage(role="user", content="hi")],
            GenerationConfig(),
        )
    ]

    assert events[0].fallback_from is not None
    assert events[0].decision.provider_id == "second"
    assert events[-1].decision.provider_id == "second"
    assert "".join(event.chunk.text for event in events if event.chunk) == "okokok"


class FakeRegistry:
    def __init__(self, candidates: list[RouteDecision]) -> None:
        self._candidates = candidates

    def candidates(self, **_: object) -> list[RouteDecision]:
        return self._candidates


def test_chat_reports_the_provider_that_actually_answered(
    client, auth_headers, monkeypatch
):
    first = FakeProvider("primary", fail=True)
    second = FakeProvider("backup", text="Fallback answer")
    monkeypatch.setattr(
        chat_service,
        "registry",
        FakeRegistry([_decision(first), _decision(second)]),
    )

    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={"message": "Tell me about AI", "mode": "general", "web_search": False},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["meta"]["provider"] == "backup"
    assert payload["meta"]["model"] == "backup-model"
    assert payload["message"]["provider"] == "backup"
    assert "Fallback answer" in payload["message"]["content"]


@pytest.mark.asyncio
async def test_stream_keeps_partial_text_instead_of_restarting():
    first = FakeProvider("first", text="partial", fail_after=1)
    second = FakeProvider("second", text="other")
    received: list[str] = []

    with pytest.raises(ProviderError):
        async for event in stream_with_fallback(
            [_decision(first), _decision(second)],
            [ChatMessage(role="user", content="hi")],
            GenerationConfig(),
        ):
            if event.chunk and event.chunk.text:
                received.append(event.chunk.text)

    assert received == ["partial"]
    assert second.calls == 0
