"""Provider detection, validation and startup diagnostics.

This module is the single source of truth for which cloud providers are
configured, how their configuration is validated, and which model IDs are
available per task tier. It performs no network I/O: connectivity is verified by
the first request and handled by the runtime fallback in ``app.ai.execution``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlparse

from app.ai.types import ProviderCapabilities
from app.core.config import settings

PLACEHOLDER_KEY_VALUES = {
    "",
    "none",
    "null",
    "changeme",
    "change-me",
    "replace-me",
    "your-api-key",
    "your_api_key",
    "sk-...",
    "api-key",
}

KNOWN_PROVIDERS = {
    "openrouter",
    "openai",
    "deepseek",
    "groq",
    "custom",
    "ollama",
}


def validate_base_url(value: str) -> list[str]:
    """Return configuration problems for an OpenAI-compatible base URL."""
    parsed = urlparse((value or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ["BASE_URL must be an absolute http(s) URL"]
    if parsed.username or parsed.password:
        return ["BASE_URL must not contain credentials"]
    return []


def _clean_models(models: dict[str, str | None]) -> dict[str, str]:
    return {
        tier: model.strip()
        for tier, model in models.items()
        if model and model.strip()
    }


@dataclass(frozen=True, slots=True)
class ProviderSpec:
    """Validated description of a configured OpenAI-compatible provider."""

    id: str
    label: str
    api_key: str
    base_url: str
    models: dict[str, str]
    capabilities: ProviderCapabilities = field(default_factory=ProviderCapabilities)
    extra_headers: dict[str, str] = field(default_factory=dict)

    def issues(self) -> list[str]:
        problems: list[str] = []
        key = (self.api_key or "").strip()
        if not key:
            problems.append("API key is empty")
        elif key.lower() in PLACEHOLDER_KEY_VALUES or key.lower().startswith(
            ("your-", "replace-", "changeme")
        ):
            problems.append("API key looks like a placeholder")
        problems.extend(validate_base_url(self.base_url))
        if not self.models:
            problems.append("No model IDs are configured")
        for tier, model in self.models.items():
            if any(character.isspace() for character in model):
                problems.append(f"{tier} model ID contains whitespace")
        return problems

    def valid(self) -> bool:
        return not self.issues()

    @property
    def model_summary(self) -> str:
        return ", ".join(
            f"{tier}={model}" for tier, model in sorted(self.models.items())
        )


def detect_provider_specs() -> list[ProviderSpec]:
    """Build specs for every provider that has at least one configured field.

    Providers are returned in ``PROVIDER_PRIORITY`` order so startup logs and
    the model catalog are stable and auditable. A provider with a key but a
    missing or malformed URL/model is still returned so validation can report
    the exact problem instead of silently disappearing.
    """
    specs: list[ProviderSpec] = []

    if settings.openrouter_api_key.strip():
        specs.append(
            ProviderSpec(
                id="openrouter",
                label="OpenRouter",
                api_key=settings.openrouter_api_key,
                base_url=settings.openrouter_base_url,
                models=_clean_models(
                    {
                        "fast": settings.openrouter_fast_model,
                        "balanced": settings.openrouter_balanced_model,
                        "reasoning": settings.openrouter_reasoning_model,
                        "coding": settings.openrouter_coding_model,
                        "vision": settings.openrouter_vision_model,
                    }
                ),
                capabilities=ProviderCapabilities(vision=True),
            )
        )

    if settings.openai_api_key.strip():
        specs.append(
            ProviderSpec(
                id="openai",
                label="OpenAI",
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url,
                models=_clean_models(
                    {
                        "fast": settings.openai_fast_model,
                        "balanced": settings.openai_balanced_model,
                        "reasoning": settings.openai_reasoning_model,
                        "coding": settings.openai_coding_model,
                        "vision": settings.openai_vision_model,
                        "embedding": settings.openai_embedding_model,
                    }
                ),
                capabilities=ProviderCapabilities(
                    embeddings=True, vision=True, stt=True, tts=True
                ),
            )
        )

    if settings.deepseek_api_key.strip():
        specs.append(
            ProviderSpec(
                id="deepseek",
                label="DeepSeek",
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
                models=_clean_models(
                    {
                        "fast": settings.deepseek_fast_model,
                        "balanced": settings.deepseek_balanced_model,
                        "reasoning": settings.deepseek_reasoning_model,
                        "coding": settings.deepseek_coding_model,
                        "vision": settings.deepseek_vision_model,
                    }
                ),
                capabilities=ProviderCapabilities(vision=True),
            )
        )

    if settings.groq_api_key.strip():
        specs.append(
            ProviderSpec(
                id="groq",
                label="Groq",
                api_key=settings.groq_api_key,
                base_url=settings.groq_base_url,
                models=_clean_models(
                    {
                        "fast": settings.groq_fast_model,
                        "balanced": settings.groq_balanced_model,
                        "reasoning": settings.groq_reasoning_model,
                        "coding": settings.groq_coding_model,
                    }
                ),
            )
        )

    if (
        settings.custom_ai_api_key.strip()
        or settings.custom_ai_base_url.strip()
        or settings.custom_ai_model.strip()
    ):
        specs.append(
            ProviderSpec(
                id="custom",
                label="Custom OpenAI-compatible",
                api_key=settings.custom_ai_api_key,
                base_url=settings.custom_ai_base_url,
                models=_clean_models(
                    {
                        "fast": settings.custom_ai_model,
                        "balanced": settings.custom_ai_model,
                        "reasoning": settings.custom_ai_model,
                        "coding": settings.custom_ai_model,
                    }
                ),
            )
        )

    priority = settings.provider_priority_list
    rank = {provider_id: index for index, provider_id in enumerate(priority)}
    specs.sort(key=lambda spec: (rank.get(spec.id, len(rank)), spec.id))
    return specs


def validate_provider_specs(specs: list[ProviderSpec]) -> list[str]:
    """Return human-readable configuration problems for all specs."""
    issues: list[str] = []
    for spec in specs:
        issues.extend(f"{spec.id}: {issue}" for issue in spec.issues())
    return issues


def priority_issues() -> list[str]:
    """Report unknown names in PROVIDER_PRIORITY without failing startup."""
    return [
        f"provider_priority: unknown provider '{provider_id}'"
        for provider_id in settings.provider_priority_list
        if provider_id not in KNOWN_PROVIDERS
    ]
