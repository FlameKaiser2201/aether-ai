from __future__ import annotations

from fastapi import APIRouter, Response

from app.ai.registry import registry
from app.core.config import settings
from app.core.database import check_database
from app.core.redis_client import cache
from app.services.storage import storage

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health() -> dict:
    return {
        "status": "ok",
        "name": settings.app_name,
        "version": settings.app_version,
        "demo_mode": not registry.has_real_provider,
    }


@router.get("/ready")
async def ready(response: Response) -> dict:
    database = await check_database()
    redis = await cache.ping()
    healthy = database
    if not healthy:
        response.status_code = 503
    return {
        "status": "ready" if healthy else "degraded",
        "database": database,
        "redis": redis,
        "storage": storage.backend,
        "providers": len([p for p in registry.providers.values() if not p.demo]),
    }
