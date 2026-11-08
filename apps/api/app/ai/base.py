"""Provider contracts shared by every model backend."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from app.ai.types import (
    ChatMessage,
    ChatResult,
    GenerationConfig,
    ProviderCapabilities,
    SpeechResult,
    StreamChunk,
    TranscriptionResult,
    Usage,
)


class ProviderError(Exception):
    def __init__(self, provider: str, message: str, status_code: int = 502, retryable: bool = True) -> None:
        super().__init__(message)
        self.provider = provider
        self.message = message
        self.status_code = status_code
        self.retryable = retryable


class ProviderUnsupported(ProviderError):
    def __init__(self, provider: str, capability: str) -> None:
        super().__init__(provider, f"{capability} is not supported by {provider}", 501, False)


class ChatProvider(ABC):
    id: str = "base"
    label: str = "Base provider"
    capabilities: ProviderCapabilities = ProviderCapabilities()
    models: dict[str, str] = {}
    demo: bool = False

    def model_for(self, tier: str) -> str | None:
        direct = self.models.get(tier)
        if direct:
            return direct
        return self.models.get("balanced") or self.models.get("fast") or self.models.get("coding")

    def supports_tier(self, tier: str) -> bool:
        if tier == "vision" and not self.capabilities.vision:
            return False
        return bool(self.model_for(tier))

    @abstractmethod
    async def stream(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> AsyncIterator[StreamChunk]:
        raise NotImplementedError

    async def complete(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> ChatResult:
        text_parts: list[str] = []
        usage = Usage()
        finish_reason: str | None = None
        async for chunk in self.stream(messages, model, config):
            if chunk.text:
                text_parts.append(chunk.text)
            if chunk.usage:
                usage.merge(chunk.usage)
            if chunk.finish_reason:
                finish_reason = chunk.finish_reason
        return ChatResult(
            text="".join(text_parts),
            provider=self.id,
            model=model,
            usage=usage,
            finish_reason=finish_reason,
        )

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        raise ProviderUnsupported(self.id, "Embeddings")

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult:
        raise ProviderUnsupported(self.id, "Speech-to-text")

    async def synthesize(self, text: str, voice: str | None, audio_format: str) -> SpeechResult:
        raise ProviderUnsupported(self.id, "Text-to-speech")

    async def close(self) -> None:
        return None

    def status(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "demo": self.demo,
            "models": dict(self.models),
            **{
                "streaming": self.capabilities.streaming,
                "embeddings": self.capabilities.embeddings,
                "vision": self.capabilities.vision,
                "stt": self.capabilities.stt,
                "tts": self.capabilities.tts,
            },
        }
