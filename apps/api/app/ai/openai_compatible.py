"""OpenAI-compatible chat, embeddings, Whisper and TTS client.

Works with OpenAI, DeepSeek, Groq, OpenRouter, Together, Mistral, vLLM, LM Studio,
LiteLLM gateways and any other `/chat/completions` implementation.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.base import ChatProvider, ProviderError
from app.ai.types import (
    ChatMessage,
    GenerationConfig,
    ProviderCapabilities,
    SpeechResult,
    StreamChunk,
    TranscriptionResult,
    Usage,
)
from app.core.config import settings
from app.utils.security import scrub_secrets


class OpenAICompatibleProvider(ChatProvider):
    def __init__(
        self,
        *,
        provider_id: str,
        label: str,
        base_url: str,
        api_key: str,
        models: dict[str, str],
        capabilities: ProviderCapabilities | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.id = provider_id
        self.label = label
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.models = {k: v for k, v in models.items() if v}
        self.capabilities = capabilities or ProviderCapabilities()
        self.extra_headers = extra_headers or {}
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    settings.provider_timeout_seconds, connect=10.0, write=60.0, pool=10.0
                ),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._client

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "AETHER/1.0",
            **self.extra_headers,
        }
        if self.id == "openrouter":
            headers.setdefault("HTTP-Referer", settings.app_url)
            headers.setdefault("X-Title", "AETHER")
        return headers

    def _payload(
        self, messages: list[ChatMessage], model: str, config: GenerationConfig, stream: bool
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.as_dict() for m in messages],
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "top_p": config.top_p,
            "stream": stream,
        }
        if stream:
            payload["stream_options"] = {"include_usage": True}
        if config.stop:
            payload["stop"] = config.stop
        if config.response_format:
            payload["response_format"] = config.response_format
        return payload

    async def _stream_once(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
        include_usage_option: bool,
    ) -> AsyncIterator[StreamChunk]:
        payload = self._payload(messages, model, config, True)
        if not include_usage_option:
            payload.pop("stream_options", None)
        try:
            async with self.client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", errors="replace")[:800]
                    raise ProviderError(
                        self.id,
                        f"{self.label} returned {response.status_code}: {scrub_secrets(body)}",
                        status_code=502 if response.status_code >= 500 else 400,
                        retryable=response.status_code >= 429,
                    )
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    usage = event.get("usage")
                    if usage:
                        yield StreamChunk(
                            usage=Usage(
                                input_tokens=int(usage.get("prompt_tokens") or 0),
                                output_tokens=int(usage.get("completion_tokens") or 0),
                            )
                        )
                    for choice in event.get("choices") or []:
                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if isinstance(content, list):
                            content = "".join(
                                str(part.get("text", ""))
                                for part in content
                                if isinstance(part, dict)
                            )
                        finish = choice.get("finish_reason")
                        if content or finish:
                            yield StreamChunk(text=content or "", finish_reason=finish)
        except httpx.TimeoutException as exc:
            raise ProviderError(self.id, f"{self.label} timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(self.id, f"Could not reach {self.label}", 502) from exc

    async def stream(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> AsyncIterator[StreamChunk]:
        try:
            async for chunk in self._stream_once(messages, model, config, True):
                yield chunk
        except ProviderError as exc:
            if "stream_options" not in exc.message.lower() and exc.status_code != 400:
                raise
            async for chunk in self._stream_once(messages, model, config, False):
                yield chunk

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        if not self.capabilities.embeddings:
            raise ProviderError(self.id, "Embeddings are not configured for this provider", 501, False)
        embedding_model = model or self.models.get("embedding")
        if not embedding_model:
            raise ProviderError(self.id, "No embedding model configured", 501, False)
        try:
            response = await self.client.post(
                f"{self.base_url}/embeddings",
                headers=self._headers(),
                json={"model": embedding_model, "input": texts},
            )
            response.raise_for_status()
            data = response.json().get("data", [])
            return [item.get("embedding", []) for item in sorted(data, key=lambda x: x.get("index", 0))]
        except httpx.HTTPError as exc:
            raise ProviderError(self.id, "Embedding request failed", 502) from exc

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult:
        if not self.capabilities.stt:
            raise ProviderError(self.id, "Speech-to-text is not configured", 501, False)
        data: dict[str, str] = {"model": settings.openai_stt_model, "response_format": "json"}
        if language and language != "auto":
            data["language"] = language
        try:
            response = await self.client.post(
                f"{self.base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}", "User-Agent": "AETHER/1.0"},
                data=data,
                files={"file": (filename, audio, content_type)},
            )
            response.raise_for_status()
            payload = response.json()
            return TranscriptionResult(
                text=str(payload.get("text", "")).strip(),
                provider=self.id,
                language=payload.get("language"),
                duration=payload.get("duration"),
            )
        except httpx.HTTPError as exc:
            raise ProviderError(self.id, "Transcription failed", 502) from exc

    async def synthesize(self, text: str, voice: str | None, audio_format: str) -> SpeechResult:
        if not self.capabilities.tts:
            raise ProviderError(self.id, "Text-to-speech is not configured", 501, False)
        try:
            response = await self.client.post(
                f"{self.base_url}/audio/speech",
                headers=self._headers(),
                json={
                    "model": settings.openai_tts_model,
                    "input": text,
                    "voice": voice or settings.openai_tts_voice,
                    "response_format": audio_format if audio_format in {"mp3", "wav", "opus"} else "mp3",
                },
            )
            response.raise_for_status()
            content_type = "audio/mpeg" if audio_format == "mp3" else f"audio/{audio_format}"
            return SpeechResult(audio=response.content, content_type=content_type, provider=self.id)
        except httpx.HTTPError as exc:
            raise ProviderError(self.id, "Speech synthesis failed", 502) from exc

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
