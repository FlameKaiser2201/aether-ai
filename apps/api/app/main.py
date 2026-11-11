"""AETHER API entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.ai.registry import registry
from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, close_db, init_db
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.redis_client import cache
from app.services.auth_service import seed_demo_user
from app.services.storage import storage

configure_logging(settings.log_level)
logger = logging.getLogger("aether")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting %s %s (%s)", settings.app_name, settings.app_version, settings.environment)
    await cache.connect()
    if settings.auto_create_tables:
        await init_db()
        logger.info("Database tables verified")
    if settings.seed_demo:
        async with SessionLocal() as db:
            await seed_demo_user(db)
            logger.warning("Demo account seeded for %s", settings.demo_email)
    provider_report = registry.startup_report()
    if provider_report["validation_issues"]:
        logger.warning(
            "Provider configuration issues: %s",
            "; ".join(provider_report["validation_issues"]),
        )
    if not registry.has_real_provider:
        logger.warning(
            "No valid AI provider configured. AETHER is using the offline local fallback. "
            "Set OPENROUTER_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, "
            "GROQ_API_KEY, or OLLAMA_ENABLED=true."
        )
    else:
        if settings.demo_mode:
            logger.info(
                "DEMO_MODE=true ignored because a valid AI provider is configured"
            )
        logger.info(
            "AI provider priority: %s",
            ", ".join(provider_report["priority"]),
        )
        for provider_id, provider_info in provider_report["providers"].items():
            models = ", ".join(
                f"{tier}={model}"
                for tier, model in provider_info["models"].items()
            )
            logger.info(
                "%s provider ready (%s): %s",
                provider_info["label"],
                provider_id,
                models,
            )
    try:
        yield
    finally:
        await registry.close()
        await storage.close()
        await cache.close()
        await close_db()
        logger.info("Shutdown complete")


docs_enabled = settings.enable_api_docs
app = FastAPI(
    title="AETHER API",
    description="Voice-first AI workspace: study, coding, interviews, research, files and memory.",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(RateLimitMiddleware)
if settings.trusted_host_list and settings.trusted_host_list != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_host_list)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Internal-Secret"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=600,
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "api": settings.api_v1_prefix,
        "docs": "/docs" if docs_enabled else None,
    }


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.app_version}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
