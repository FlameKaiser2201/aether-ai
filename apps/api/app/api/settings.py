from __future__ import annotations

from fastapi import APIRouter

from app.ai.registry import registry
from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.core.redis_client import cache
from app.schemas.settings import (
    CapabilityStatus,
    ModelOption,
    PreferencesOut,
    PreferencesUpdate,
    ProviderAvailability,
    SettingsOut,
    UserPreferences,
)
from app.services import auth_service
from app.services.storage import storage

router = APIRouter(tags=["settings"])


def _capabilities() -> CapabilityStatus:
    providers = {
        name: ProviderAvailability(**values) for name, values in registry.availability().items()
    }
    return CapabilityStatus(
        providers=providers,
        demo_mode=settings.demo_mode or not registry.has_real_provider,
        web_search=True,
        storage=storage.backend,
        redis=cache.available,
    )


@router.get("/settings", response_model=SettingsOut)
async def get_settings(user: CurrentUser) -> SettingsOut:
    preferences = auth_service.get_preferences(user)
    return SettingsOut(
        preferences=preferences,
        capabilities=_capabilities(),
        routing_strategy=preferences.routing_strategy,
        model_catalog=[ModelOption(**item) for item in registry.catalog()],
        limits={
            "max_upload_mb": settings.max_upload_mb,
            "chat_per_minute": settings.chat_limit_per_minute,
            "context_tokens": settings.context_token_budget,
            "max_output_tokens": settings.max_output_tokens,
            "max_memories": settings.max_memories_per_user,
        },
    )


@router.patch("/settings", response_model=PreferencesOut)
async def update_settings(
    payload: PreferencesUpdate, user: CurrentUser, db: DbSession
) -> PreferencesOut:
    current = auth_service.get_preferences(user)
    updates = payload.model_dump(exclude_none=True)
    merged = UserPreferences(**{**current.model_dump(), **updates})
    user.preferences = merged.model_dump()
    await db.commit()
    return PreferencesOut(preferences=merged)


@router.get("/models")
async def models(user: CurrentUser) -> dict:
    preferences = auth_service.get_preferences(user)
    return {
        "strategy": preferences.routing_strategy,
        "demo_mode": settings.demo_mode or not registry.has_real_provider,
        "models": registry.catalog(),
        "providers": registry.availability(),
    }
