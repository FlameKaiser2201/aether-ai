"""Environment-backed application configuration.

Secrets are server-only. Nothing in this module is ever serialized to a client.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_ACCESS_SECRET = "dev-access-secret-change-me-0123456789abcdef"
DEV_REFRESH_SECRET = "dev-refresh-secret-change-me-0123456789abcdef"
DEV_INTERNAL_SECRET = "dev-internal-secret-change-me-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- app ---
    app_name: str = "AETHER"
    app_version: str = "1.0.0"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    enable_api_docs: bool = True
    trust_proxy_headers: bool = False

    # --- database / cache ---
    database_url: str = "sqlite+aiosqlite:///./data/aether.db"
    redis_url: str = ""
    auto_create_tables: bool = True

    # --- auth ---
    jwt_access_secret: str = DEV_ACCESS_SECRET
    jwt_refresh_secret: str = DEV_REFRESH_SECRET
    internal_api_secret: str = DEV_INTERNAL_SECRET
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cookie_secure: bool = False
    seed_demo: bool = False
    demo_email: str = "demo@aether.local"
    demo_password: str = "AetherDemo!2026"

    # --- rate limits ---
    rate_limit_per_minute: int = 120
    chat_limit_per_minute: int = 30
    auth_limit_per_minute: int = 10
    upload_limit_per_hour: int = 60
    login_max_failures: int = 8
    login_lockout_seconds: int = 900

    # --- AI providers (OpenAI-compatible) ---
    # Priority is OpenRouter -> OpenAI -> DeepSeek -> Groq. Override with
    # PROVIDER_PRIORITY, e.g. "openai,openrouter,deepseek,groq".
    provider_priority: str = "openrouter,openai,deepseek,groq,custom,ollama"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_fast_model: str = "gpt-4.1-mini"
    openai_balanced_model: str = "gpt-4.1"
    openai_reasoning_model: str = "gpt-4.1"
    openai_coding_model: str = "gpt-4.1"
    openai_vision_model: str = "gpt-4.1"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_stt_model: str = "whisper-1"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "nova"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_fast_model: str = "deepseek-flash"
    deepseek_balanced_model: str = "deepseek-flash"
    deepseek_reasoning_model: str = "deepseek-v4-pro"
    deepseek_coding_model: str = "deepseek-v4-pro"
    deepseek_vision_model: str = "deepseek-flash"

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_fast_model: str = "openai/gpt-oss-20b"
    groq_balanced_model: str = "openai/gpt-oss-120b"
    groq_reasoning_model: str = "openai/gpt-oss-120b"
    groq_coding_model: str = "openai/gpt-oss-120b"

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_fast_model: str = "google/gemini-3.8-flash"
    openrouter_balanced_model: str = "anthropic/claude-sonnet-5.5"
    openrouter_reasoning_model: str = "anthropic/claude-sonnet-5.5"
    openrouter_coding_model: str = "anthropic/claude-sonnet-5.5"
    openrouter_vision_model: str = "anthropic/claude-sonnet-5.5"

    custom_ai_api_key: str = ""
    custom_ai_base_url: str = ""
    custom_ai_model: str = ""

    ollama_enabled: bool = False
    ollama_base_url: str = "http://localhost:11434"
    ollama_fast_model: str = "llama3.1:8b"
    ollama_balanced_model: str = "llama3.1:8b"
    ollama_reasoning_model: str = "deepseek-r1:8b"
    ollama_coding_model: str = "qwen2.5-coder:7b"
    ollama_vision_model: str = "llava:7b"

    routing_strategy: Literal["quality", "cost", "local"] = "quality"
    context_token_budget: int = 24000
    max_output_tokens: int = 4096
    temperature: float = 0.55
    provider_timeout_seconds: float = 120.0
    demo_mode: bool = False

    # --- web research ---
    tavily_api_key: str = ""
    brave_search_api_key: str = ""
    serper_api_key: str = ""
    searxng_url: str = ""
    web_search_auto: bool = True
    search_cache_seconds: int = 1800
    search_max_results: int = 6
    search_fetch_pages: int = 3

    # --- voice ---
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-3"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model: str = "eleven_turbo_v2_5"

    # --- storage ---
    storage_backend: Literal["auto", "local", "supabase"] = "auto"
    storage_dir: str = "./data/storage"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket: str = "aether-files"
    max_upload_mb: int = 25
    max_file_chunks: int = 240

    # --- memory ---
    auto_memory: bool = True
    memory_embeddings: bool = True
    max_memories_per_user: int = 500
    memory_retrieval_limit: int = 8
    history_turn_limit: int = 60
    summary_start_after: int = 16
    summary_every_messages: int = 6

    # --- derived ---
    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: object) -> object:
        """Accept managed-provider URLs and normalize them for asyncpg."""
        if not isinstance(value, str):
            return value
        url = value.strip()
        for prefix in (
            "postgres://",
            "postgresql://",
            "postgresql+psycopg://",
            "postgresql+psycopg2://",
        ):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url[len(prefix) :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_host_list(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def provider_priority_list(self) -> list[str]:
        return [
            provider.strip().lower()
            for provider in self.provider_priority.split(",")
            if provider.strip()
        ]

    @property
    def has_real_provider_key(self) -> bool:
        return any(
            [
                self.openai_api_key,
                self.deepseek_api_key,
                self.groq_api_key,
                self.openrouter_api_key,
                self.custom_ai_api_key and self.custom_ai_base_url,
                self.ollama_enabled,
            ]
        )

    @property
    def effective_demo_mode(self) -> bool:
        """Demo is a last resort, never a choice when a provider is configured.

        ``DEMO_MODE=true`` cannot override a real key: if any provider is
        configured, requests are sent to a real model.
        """
        return not self.has_real_provider_key

    @property
    def storage_uses_supabase(self) -> bool:
        configured = bool(self.supabase_url and self.supabase_service_role_key)
        if self.storage_backend == "supabase":
            return configured
        if self.storage_backend == "local":
            return False
        return configured

    @model_validator(mode="after")
    def _production_guardrails(self) -> Settings:
        if self.environment == "production":
            problems: list[str] = []
            if len(self.jwt_access_secret) < 32 or "change-me" in self.jwt_access_secret:
                problems.append("JWT_ACCESS_SECRET must be a unique 32+ character secret")
            if len(self.jwt_refresh_secret) < 32 or "change-me" in self.jwt_refresh_secret:
                problems.append("JWT_REFRESH_SECRET must be a unique 32+ character secret")
            if len(self.internal_api_secret) < 32 or "change-me" in self.internal_api_secret:
                problems.append("INTERNAL_API_SECRET must be a unique 32+ character secret")
            if self.cors_origins.strip() == "*":
                problems.append("CORS_ORIGINS cannot be '*' in production")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE must be true in production")
            if self.seed_demo:
                problems.append("SEED_DEMO must be false in production")
            if problems:
                raise ValueError("Insecure production configuration: " + "; ".join(problems))
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
