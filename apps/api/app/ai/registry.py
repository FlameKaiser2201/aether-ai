"""Provider registry, availability reporting and deterministic routing."""

from __future__ import annotations

import logging
from typing import Any

from app.ai.base import ChatProvider
from app.ai.demo import DemoProvider
from app.ai.ollama import OllamaProvider
from app.ai.openai_compatible import OpenAICompatibleProvider
from app.ai.types import ProviderCapabilities, RouteDecision
from app.core.config import settings

logger = logging.getLogger("aether.registry")

STRATEGY_ORDER = {
    "quality": ["openai", "deepseek", "groq", "openrouter", "custom", "ollama", "demo"],
    "cost": ["deepseek", "groq", "openai", "openrouter", "custom", "ollama", "demo"],
    "local": ["ollama", "deepseek", "openai", "groq", "openrouter", "custom", "demo"],
}

TIER_FALLBACKS = {
    "fast": ["fast", "balanced", "coding", "reasoning"],
    "balanced": ["balanced", "fast", "coding", "reasoning"],
    "reasoning": ["reasoning", "coding", "balanced", "fast"],
    "coding": ["coding", "reasoning", "balanced", "fast"],
    "vision": ["vision", "balanced", "fast"],
}


class ModelRegistry:
    def __init__(self) -> None:
        self.providers: dict[str, ChatProvider] = {}
        self._build()

    def _build(self) -> None:
        if settings.openai_api_key:
            self.providers["openai"] = OpenAICompatibleProvider(
                provider_id="openai",
                label="OpenAI",
                base_url=settings.openai_base_url,
                api_key=settings.openai_api_key,
                models={
                    "fast": settings.openai_fast_model,
                    "balanced": settings.openai_balanced_model,
                    "reasoning": settings.openai_reasoning_model,
                    "coding": settings.openai_coding_model,
                    "vision": settings.openai_vision_model,
                    "embedding": settings.openai_embedding_model,
                },
                capabilities=ProviderCapabilities(
                    embeddings=True, vision=True, stt=True, tts=True
                ),
            )
        if settings.deepseek_api_key:
            self.providers["deepseek"] = OpenAICompatibleProvider(
                provider_id="deepseek",
                label="DeepSeek",
                base_url=settings.deepseek_base_url,
                api_key=settings.deepseek_api_key,
                models={
                    "fast": settings.deepseek_fast_model,
                    "balanced": settings.deepseek_balanced_model,
                    "reasoning": settings.deepseek_reasoning_model,
                    "coding": settings.deepseek_coding_model,
                },
            )
        if settings.groq_api_key:
            self.providers["groq"] = OpenAICompatibleProvider(
                provider_id="groq",
                label="Groq",
                base_url=settings.groq_base_url,
                api_key=settings.groq_api_key,
                models={
                    "fast": settings.groq_fast_model,
                    "balanced": settings.groq_balanced_model,
                    "reasoning": settings.groq_reasoning_model,
                    "coding": settings.groq_coding_model,
                },
            )
        if settings.openrouter_api_key:
            self.providers["openrouter"] = OpenAICompatibleProvider(
                provider_id="openrouter",
                label="OpenRouter",
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                models={
                    "fast": settings.openrouter_fast_model,
                    "balanced": settings.openrouter_balanced_model,
                    "reasoning": settings.openrouter_reasoning_model,
                    "coding": settings.openrouter_coding_model,
                    "vision": settings.openrouter_balanced_model,
                },
                capabilities=ProviderCapabilities(vision=True),
            )
        if settings.custom_ai_api_key and settings.custom_ai_base_url:
            self.providers["custom"] = OpenAICompatibleProvider(
                provider_id="custom",
                label="Custom OpenAI-compatible",
                base_url=settings.custom_ai_base_url,
                api_key=settings.custom_ai_api_key,
                models={
                    "fast": settings.custom_ai_model,
                    "balanced": settings.custom_ai_model,
                    "reasoning": settings.custom_ai_model,
                    "coding": settings.custom_ai_model,
                },
            )
        if settings.ollama_enabled:
            self.providers["ollama"] = OllamaProvider(
                settings.ollama_base_url,
                {
                    "fast": settings.ollama_fast_model,
                    "balanced": settings.ollama_balanced_model,
                    "reasoning": settings.ollama_reasoning_model,
                    "coding": settings.ollama_coding_model,
                    "vision": settings.ollama_vision_model,
                    "embedding": settings.ollama_fast_model,
                },
            )
        self.providers["demo"] = DemoProvider()

    def get(self, provider_id: str) -> ChatProvider | None:
        return self.providers.get(provider_id)

    def order(self, strategy: str) -> list[str]:
        return STRATEGY_ORDER.get(strategy, STRATEGY_ORDER["quality"])

    def route(
        self,
        *,
        task_type: str,
        tier: str,
        strategy: str | None = None,
        preferred_provider: str | None = None,
        require_vision: bool = False,
    ) -> RouteDecision:
        strategy = strategy or settings.routing_strategy
        if settings.demo_mode:
            provider = self.providers["demo"]
            return RouteDecision(
                provider=provider,
                model="demo-local",
                tier=tier,
                task_type=task_type,
                reason="DEMO_MODE is enabled",
                demo=True,
            )

        candidates: list[str] = []
        if preferred_provider and preferred_provider in self.providers:
            candidates.append(preferred_provider)
        candidates.extend(self.order(strategy))

        for provider_id in candidates:
            provider = self.providers.get(provider_id)
            if provider is None:
                continue
            if require_vision and not provider.capabilities.vision:
                continue
            for candidate_tier in TIER_FALLBACKS.get(tier, ["balanced", "fast"]):
                model = provider.model_for(candidate_tier)
                if model:
                    reason = f"{task_type} task → {provider.label}/{model} ({strategy} strategy)"
                    if candidate_tier != tier:
                        reason += f"; {tier} unavailable, using {candidate_tier}"
                    return RouteDecision(
                        provider=provider,
                        model=model,
                        tier=candidate_tier,
                        task_type=task_type,
                        reason=reason,
                        demo=provider.demo,
                    )

        provider = self.providers["demo"]
        return RouteDecision(
            provider=provider,
            model="demo-local",
            tier="fast",
            task_type=task_type,
            reason="No model provider configured; using offline demo engine",
            demo=True,
        )

    def embedding_provider(self) -> tuple[ChatProvider, str] | None:
        for provider_id in self.order("quality"):
            provider = self.providers.get(provider_id)
            if provider and provider.capabilities.embeddings:
                model = provider.models.get("embedding") or provider.model_for("fast")
                if model:
                    return provider, model
        return None

    def stt_provider(self) -> ChatProvider | None:
        for provider_id in ("openai", "groq", "custom"):
            provider = self.providers.get(provider_id)
            if provider and provider.capabilities.stt:
                return provider
        return None

    def tts_provider(self) -> ChatProvider | None:
        provider = self.providers.get("openai")
        if provider and provider.capabilities.tts:
            return provider
        return None

    @property
    def has_real_provider(self) -> bool:
        return any(not p.demo for p in self.providers.values())

    def availability(self) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for provider_id, provider in self.providers.items():
            result[provider_id] = {
                "chat": True,
                "streaming": provider.capabilities.streaming,
                "embeddings": provider.capabilities.embeddings,
                "vision": provider.capabilities.vision,
                "stt": provider.capabilities.stt,
                "tts": provider.capabilities.tts,
                "demo": provider.demo,
            }
        return result

    def catalog(self) -> list[dict[str, Any]]:
        options: list[dict[str, Any]] = []
        seen: set[tuple[str, str, str]] = set()
        for provider_id in self.order("quality"):
            provider = self.providers.get(provider_id)
            if not provider:
                continue
            for tier in ("fast", "balanced", "reasoning", "coding", "vision"):
                model = provider.model_for(tier)
                if not model or not provider.supports_tier(tier):
                    continue
                key = (tier, provider_id, model)
                if key in seen:
                    continue
                seen.add(key)
                options.append(
                    {
                        "tier": tier,
                        "provider": provider_id,
                        "model": model,
                        "available": True,
                    }
                )
        return options

    async def close(self) -> None:
        for provider in self.providers.values():
            await provider.close()


registry = ModelRegistry()
