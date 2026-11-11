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
from app.ai.provider_config import (
    detect_provider_specs,
    priority_issues,
    validate_base_url,
    validate_provider_specs,
)
from app.ai.types import RouteDecision
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

# Product model priority for the default quality strategy:
# Claude Sonnet -> GPT-4.1 -> Gemini via OpenRouter -> DeepSeek V4.1 -> Groq.
# Each entry is (provider_id, model_tier). Providers that are not configured
# are skipped, and the provider-order fallback below fills any remaining gaps.
QUALITY_MODEL_CHAIN: dict[str, list[tuple[str, str]]] = {
    "fast": [
        ("openrouter", "fast"),
        ("openai", "fast"),
        ("deepseek", "fast"),
        ("groq", "fast"),
    ],
    "balanced": [
        ("openrouter", "balanced"),
        ("openai", "balanced"),
        ("openrouter", "fast"),
        ("deepseek", "balanced"),
        ("groq", "balanced"),
    ],
    "reasoning": [
        ("openrouter", "reasoning"),
        ("openai", "reasoning"),
        ("openrouter", "fast"),
        ("deepseek", "reasoning"),
        ("groq", "reasoning"),
    ],
    "coding": [
        ("openrouter", "coding"),
        ("openai", "coding"),
        ("openrouter", "fast"),
        ("deepseek", "coding"),
        ("groq", "coding"),
    ],
    "vision": [
        ("openrouter", "vision"),
        ("openai", "vision"),
        ("deepseek", "vision"),
    ],
}

MAX_CANDIDATES = 16


class ModelRegistry:
    def __init__(self) -> None:
        self.providers: dict[str, ChatProvider] = {}
        self.validation_issues: list[str] = []
        self._build()

    def _build(self) -> None:
        specs = detect_provider_specs()
        self.validation_issues.extend(validate_provider_specs(specs))
        self.validation_issues.extend(priority_issues())

        for spec in specs:
            issues = spec.issues()
            if issues:
                logger.warning(
                    "Skipping %s provider: %s", spec.label, "; ".join(issues)
                )
                continue
            self.providers[spec.id] = OpenAICompatibleProvider(
                provider_id=spec.id,
                label=spec.label,
                base_url=spec.base_url,
                api_key=spec.api_key,
                models=spec.models,
                capabilities=spec.capabilities,
                extra_headers=spec.extra_headers,
            )

        if settings.ollama_enabled:
            ollama_issues = validate_base_url(settings.ollama_base_url)
            if not any(
                model.strip()
                for model in (
                    settings.ollama_fast_model,
                    settings.ollama_balanced_model,
                    settings.ollama_reasoning_model,
                    settings.ollama_coding_model,
                    settings.ollama_vision_model,
                )
            ):
                ollama_issues.append("No model IDs are configured")
            if ollama_issues:
                self.validation_issues.extend(
                    f"ollama: {issue}" for issue in ollama_issues
                )
                logger.warning(
                    "Skipping Ollama provider: %s", "; ".join(ollama_issues)
                )
            else:
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

        # Demo is constructed only when no valid real provider exists. With a
        # real key it is not even present in the registry, so no route, model
        # catalog or settings response can expose it.
        if not self.has_real_provider:
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

        The default quality strategy follows the product model order:
        Claude Sonnet -> GPT-4.1 -> Gemini via OpenRouter -> DeepSeek V4.1 ->
        Groq. A custom ``PROVIDER_PRIORITY`` switches to provider-order routing
        so operators can deliberately put another provider first. In both
        cases every configured provider/model is included as a deeper fallback.
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
        require_vision = require_vision and vision_available

        chain: list[tuple[str, str]] = []
        if (
            strategy == "quality"
            and not preferred_provider
            and settings.provider_priority_list[:4] == DEFAULT_PROVIDER_PRIORITY[:4]
        ):
            chain.extend(QUALITY_MODEL_CHAIN.get(tier, []))

        # Deeper fallbacks: every provider's preferred tier first, then the
        # remaining tiers. This guarantees that a configured provider is never
        # ignored just because it is not in the quality chain.
        primary: list[tuple[str, str]] = []
        secondary: list[tuple[str, str]] = []
        for provider_id in ordered:
            fallback_tiers = TIER_FALLBACKS.get(tier, ["balanced", "fast"])
            for index, candidate_tier in enumerate(fallback_tiers):
                entry = (provider_id, candidate_tier)
                if index == 0:
                    primary.append(entry)
                else:
                    secondary.append(entry)
        chain.extend(primary)
        chain.extend(secondary)

        decisions: list[RouteDecision] = []
        seen: set[tuple[str, str]] = set()
        for provider_id, candidate_tier in chain:
            provider = self.providers.get(provider_id)
            if provider is None or provider.demo:
                continue
            if require_vision and not provider.capabilities.vision:
                continue
            model = provider.model_for(candidate_tier)
            if not model:
                continue
            key = (provider_id, model)
            if key in seen:
                continue
            seen.add(key)
            reason = (
                f"{task_type} task → {provider.label}/{model} "
                f"({strategy} strategy)"
            )
            if candidate_tier != tier:
                reason += f"; {tier} tier fallback via {candidate_tier}"
            decisions.append(
                RouteDecision(
                    provider=provider,
                    model=model,
                    tier=candidate_tier,
                    task_type=task_type,
                    reason=reason,
                    demo=provider.demo,
                )
            )
            if len(decisions) >= MAX_CANDIDATES:
                break

        if decisions:
            return decisions
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
        # If a real provider is configured but no ranked candidate matched (for
        # example a vision request with no vision model), use that provider's
        # best available text model. Demo must never leak into a real deployment.
        if self.has_real_provider:
            for provider_id in self.order("quality"):
                provider = self.providers.get(provider_id)
                if provider is None or provider.demo:
                    continue
                model = (
                    provider.model_for(tier)
                    or provider.model_for("balanced")
                    or provider.model_for("fast")
                )
                if model:
                    return RouteDecision(
                        provider=provider,
                        model=model,
                        tier=tier,
                        task_type=task_type,
                        reason=(
                            f"{task_type} task → {provider.label}/{model} "
                            "(last-resort real-provider fallback)"
                        ),
                        demo=False,
                    )

        provider = self.providers.get("demo")
        if provider is None:
            provider = DemoProvider()
            self.providers["demo"] = provider
        if settings.demo_mode:
            reason = "DEMO_MODE is enabled and no valid AI provider is configured"
        else:
            reason = "No valid AI provider is configured; using the offline local fallback"
        return RouteDecision(
            provider=provider,
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
        # No unconditional demo entry: when a real provider is configured the
        # demo provider is not registered at all, so it cannot appear here.
        provider_ids = list(self.order("quality"))
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

    def startup_report(self) -> dict[str, Any]:
        """Describe detected providers and the strongest model per tier.

        The report never contains API keys. It is safe to log and to expose via
        the health endpoint for deployment verification.
        """
        providers: dict[str, dict[str, Any]] = {}
        for provider_id in self.order("quality"):
            provider = self.providers.get(provider_id)
            if provider is None or provider.demo:
                continue
            providers[provider_id] = {
                "label": provider.label,
                "base_url": getattr(provider, "base_url", None),
                "models": {
                    tier: model
                    for tier, model in provider.models.items()
                    if tier != "embedding"
                },
            }

        selected: dict[str, str] = {}
        if self.has_real_provider:
            for tier in ("fast", "balanced", "reasoning", "coding", "vision"):
                decision = self.route(task_type="general", tier=tier)
                selected[tier] = f"{decision.provider_id}/{decision.model}"

        return {
            "demo_mode": not self.has_real_provider,
            "priority": self.real_provider_ids,
            "providers": providers,
            "selected": selected,
            "validation_issues": list(self.validation_issues),
        }

    async def close(self) -> None:
        for provider in self.providers.values():
            await provider.close()


registry = ModelRegistry()
