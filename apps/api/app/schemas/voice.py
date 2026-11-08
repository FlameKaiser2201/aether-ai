from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = None
    provider: str


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str | None = Field(default=None, max_length=80)
    format: Literal["mp3", "wav", "opus"] = "mp3"


class VoiceStatus(BaseModel):
    stt: bool
    tts: bool
    stt_provider: str | None = None
    tts_provider: str | None = None
    browser_fallback: bool = True
