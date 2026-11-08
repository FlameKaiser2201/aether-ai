from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class UserPreferences(BaseModel):
    language: Literal["auto", "en", "hi", "hinglish"] = "auto"
    response_style: Literal["concise", "balanced", "detailed"] = "balanced"
    theme: Literal["dark", "system"] = "dark"
    auto_speak: bool = True
    continuous_listening: bool = False
    auto_memory: bool = True
    web_search_default: bool = False
    routing_strategy: Literal["quality", "cost", "local"] = "quality"
    voice_name: str = Field(default="auto", max_length=80)
    voice_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    voice_pitch: float = Field(default=1.0, ge=0.0, le=2.0)
    study_level: Literal["beginner", "intermediate", "advanced", "exam"] = "intermediate"
    interview_role: str = Field(default="", max_length=120)
    interview_company: str = Field(default="", max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    code_language: str = Field(default="python", max_length=32)
    show_routing: bool = True
    demo_banner_dismissed: bool = False


class PreferencesUpdate(BaseModel):
    language: Literal["auto", "en", "hi", "hinglish"] | None = None
    response_style: Literal["concise", "balanced", "detailed"] | None = None
    theme: Literal["dark", "system"] | None = None
    auto_speak: bool | None = None
    continuous_listening: bool | None = None
    auto_memory: bool | None = None
    web_search_default: bool | None = None
    routing_strategy: Literal["quality", "cost", "local"] | None = None
    voice_name: str | None = Field(default=None, max_length=80)
    voice_rate: float | None = Field(default=None, ge=0.5, le=2.0)
    voice_pitch: float | None = Field(default=None, ge=0.0, le=2.0)
    study_level: Literal["beginner", "intermediate", "advanced", "exam"] | None = None
    interview_role: str | None = Field(default=None, max_length=120)
    interview_company: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    code_language: str | None = Field(default=None, max_length=32)
    show_routing: bool | None = None
    demo_banner_dismissed: bool | None = None


class ProviderAvailability(BaseModel):
    chat: bool
    streaming: bool
    embeddings: bool
    vision: bool
    stt: bool
    tts: bool
    demo: bool = False


class CapabilityStatus(BaseModel):
    providers: dict[str, ProviderAvailability]
    demo_mode: bool
    web_search: bool
    storage: str
    redis: bool


class ModelOption(BaseModel):
    tier: str
    provider: str
    model: str
    available: bool


class SettingsOut(BaseModel):
    preferences: UserPreferences
    capabilities: CapabilityStatus
    routing_strategy: str
    model_catalog: list[ModelOption]
    limits: dict[str, int]


class PreferencesOut(BaseModel):
    preferences: UserPreferences
