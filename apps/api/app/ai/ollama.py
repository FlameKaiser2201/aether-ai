"""Native Ollama provider (chat streaming, embeddings, vision)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.ai.base import ChatProvider, ProviderError
from app.ai.types import (
    ChatMessage,
    GenerationConfig,
    ProviderCapabilities,
    StreamChunk,
    Usage,
)
from app.core.config import settings


class OllamaProvider(ChatProvider):
    id = "ollama"
    label = "Ollama (local)"

    def __init__(self, base_url: str, models: dict[str, str]) -> None:
        self.base_url = base_url.rstrip("/")
        self.models = {k: v for k, v in models.items() if v}
        self.capabilities = ProviderCapabilities(embeddings=True, vision=True)
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(settings.provider_timeout_seconds, connect=5.0)
            )
        return self._client

    async def stream(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> AsyncIterator[StreamChunk]:
        payload = {
            "model": model,
            "messages": [m.as_dict() for m in messages],
            "stream": True,
            "options": {
                "temperature": config.temperature,
                "num_predict": config.max_tokens,
                "top_p": config.top_p,
            },
        }
        try:
            async with self.client.stream(
                "POST", f"{self.base_url}/api/chat", json=payload
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", errors="replace")[:500]
                    raise ProviderError("ollama", f"Ollama returned {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if event.get("error"):
                        raise ProviderError("ollama", str(event["error"]))
                    message = event.get("message") or {}
                    text = message.get("content") or ""
                    done = bool(event.get("done"))
                    if text or done:
                        usage = None
                        if done:
                            usage = Usage(
                                input_tokens=int(event.get("prompt_eval_count") or 0),
                                output_tokens=int(event.get("eval_count") or 0),
                            )
                        yield StreamChunk(text=text, finish_reason="stop" if done else None, usage=usage)
        except httpx.HTTPError as exc:
            raise ProviderError("ollama", "Could not reach Ollama. Is it running?", 502) from exc

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        embedding_model = model or self.models.get("embedding") or self.models.get("fast")
        if not embedding_model:
            raise ProviderError("ollama", "No embedding model configured", 501, False)
        vectors: list[list[float]] = []
        try:
            for text in texts:
                response = await self.client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": embedding_model, "prompt": text},
                )
                response.raise_for_status()
                vectors.append(response.json().get("embedding", []))
            return vectors
        except httpx.HTTPError as exc:
            raise ProviderError("ollama", "Ollama embedding failed", 502) from exc

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
