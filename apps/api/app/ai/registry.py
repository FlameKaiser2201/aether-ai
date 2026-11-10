"""Provider registry, availability reporting and deterministic routing.

Quality order is OpenRouter -> OpenAI -> DeepSeek -> Groq by default. The
router returns a ranked candidate list so a failed provider can be replaced at
runtime without re-running classification. Demo is only present when no real
provider is configured.
"""

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

DEFAULT_PROVIDER_PRIORITY = [
    "openrouter",
    "openai",
    "deepseek",
    "groq",
    "custom",
    "ollama",
]

STRATEGY_ORDER = {
    "quality": DEFAULT_PROVIDER_PRIORITY,
    "cost": ["deepseek", "groq", "openai", "openrouter", "custom", "ollama"],
    "local": ["ollama", "deepseek", "groq", "openai", "openrouter", "custom"],
}

TIER_FALLBACKS = {
    "fast": ["fast", "balanced", "coding", "reasoning"],
    "balanced": ["balanced", "fast", "coding", "reasoning"],
    "reasoning": ["reasoning", "coding", "balanced", "fast"],
    "coding": ["coding", "reasoning", "balanced", "fast"],
    "vision": ["vision", "balanced", "fast"],
}

MAX_CANDIDATES = 12


class ModelRegistry:
    def __init__(self) -> None:
        self.providers: dict[str, ChatProvider] = {}
        self._build()

    def _build(self) -> None:
        # Construction order follows the quality priority so availability and
        # catalog output are stable and easy to audit.
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
                    "vision": settings.openrouter_vision_model,
                },
                capabilities=ProviderCapabilities(vision=True),
            )
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
                    "vision": settings.deepseek_vision_model,
                },
                capabilities=ProviderCapabilities(vision=True),
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
        if settings.custom_ai_api_key and settings.custom_ai_base_url and settings.custom_ai_model:
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
        """Return configured providers in routing order.

        The quality order is user-configurable via PROVIDER_PRIORITY. Any
        configured provider missing from that list is appended so it is never
        silently ignored. Demo appears only when nothing real is configured.
        """
        base = (
            settings.provider_priority_list
            if strategy == "quality"
            else STRATEGY_ORDER.get(strategy, settings.provider_priority_list)
        )
        ordered = [
            provider_id
            for provider_id in base
            if provider_id in self.providers and provider_id != "demo"
        ]
        ordered.extend(
            provider_id
            for provider_id in self.providers
            if provider_id not in ordered and provider_id != "demo"
        )
        if not ordered:
            ordered.append("demo")
        return ordered

    def candidates(
        self,
        *,
        task_type: str,
        tier: str,
        strategy: str | None = None,
        preferred_provider: str | None = None,
        require_vision: bool = False,
    ) -> list[RouteDecision]:
        """Rank every viable provider/model pair for runtime fallback.

        One model per provider is tried first, in priority order, so a broken
        provider is skipped quickly. Extra tiers for the same provider follow
        as deeper retries.
        """
        strategy = strategy or settings.routing_strategy
        if not self.has_real_provider:
            return [self._demo_decision(task_type, tier)]

        ordered = self.order(strategy)
        if preferred_provider:
            preferred = preferred_provider.lower()
            if preferred in ordered:
                ordered = [preferred, *[pid for pid in ordered if pid != preferred]]

        vision_available = any(
            self.providers[provider_id].capabilities.vision for provider_id in ordered
        )
        primary: list[RouteDecision] = []
        secondary: list[RouteDecision] = []
        for provider_id in ordered:
            provider = self.providers[provider_id]
            if require_vision and vision_available and not provider.capabilities.vision:
                continue
            seen_models: set[str] = set()
            provider_decisions: list[RouteDecision] = []
            for candidate_tier in TIER_FALLBACKS.get(tier, ["balanced", "fast"]):
                model = provider.model_for(candidate_tier)
                if not model or model in seen_models:
                    continue
                seen_models.add(model)
                reason = (
                    f"{task_type} task → {provider.label}/{model} "
                    f"({strategy} strategy)"
                )
                if candidate_tier != tier:
                    reason += f"; {tier} unavailable, using {candidate_tier}"
                if require_vision and not provider.capabilities.vision:
                    reason += "; no vision model configured"
                provider_decisions.append(
                    RouteDecision(
                        provider=provider,
                        model=model,
                        tier=candidate_tier,
                        task_type=task_type,
                        reason=reason,
                        demo=provider.demo,
                    )
                )
            if provider_decisions:
                primary.append(provider_decisions[0])
                secondary.extend(provider_decisions[1:])

        ranked = (primary + secondary)[:MAX_CANDIDATES]
        if ranked:
            return ranked
        return [self._demo_decision(task_type, tier)]

    def route(
        self,
        *,
        task_type: str,
        tier: str,
        strategy: str | None = None,
        preferred_provider: str | None = None,
        require_vision: bool = False,
    ) -> RouteDecision:
        return self.candidates(
            task_type=task_type,
            tier=tier,
            strategy=strategy,
            preferred_provider=preferred_provider,
            require_vision=require_vision,
        )[0]

    def _demo_decision(self, task_type: str, tier: str) -> RouteDecision:
        if settings.demo_mode:
            reason = "DEMO_MODE is enabled and no model provider is configured"
        else:
            reason = "No model provider configured; using the offline demo engine"
        return RouteDecision(
            provider=self.providers["demo"],
            model="demo-local",
            tier=tier,
            task_type=task_type,
            reason=reason,
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
        return any(not provider.demo for provider in self.providers.values())

    @property
    def real_provider_ids(self) -> list[str]:
        return [
            provider_id
            for provider_id in self.order("quality")
            if provider_id in self.providers and not self.providers[provider_id].demo
        ]

    def availability(self) -> dict[str, dict[str, Any]]:
        provider_ids = list(self.order("quality"))
        if "demo" in self.providers and "demo" not in provider_ids:
            provider_ids.append("demo")
        result: dict[str, dict[str, Any]] = {}
        for provider_id in provider_ids:
            provider = self.providers.get(provider_id)
            if provider is None:
                continue
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
