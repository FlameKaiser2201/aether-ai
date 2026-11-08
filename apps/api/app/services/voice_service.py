"""Speech-to-text and text-to-speech gateway."""

from __future__ import annotations

import logging
import re

import httpx

from app.ai.registry import registry
from app.ai.types import SpeechResult, TranscriptionResult
from app.core.config import settings
from app.core.errors import AppError
from app.schemas.voice import VoiceStatus
from app.utils.security import scrub_secrets

logger = logging.getLogger("aether.voice")

MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO = {
    "audio/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/ogg",
    "audio/m4a", "audio/x-m4a", "video/webm", "application/octet-stream",
}


def status() -> VoiceStatus:
    stt_provider = None
    tts_provider = None
    if settings.deepgram_api_key:
        stt_provider = "deepgram"
    elif registry.stt_provider():
        stt_provider = registry.stt_provider().id  # type: ignore[union-attr]
    if settings.elevenlabs_api_key:
        tts_provider = "elevenlabs"
    elif registry.tts_provider():
        tts_provider = registry.tts_provider().id  # type: ignore[union-attr]
    return VoiceStatus(
        stt=bool(stt_provider),
        tts=bool(tts_provider),
        stt_provider=stt_provider,
        tts_provider=tts_provider,
        browser_fallback=True,
    )


async def transcribe(
    audio: bytes, filename: str, content_type: str, language: str | None = None
) -> TranscriptionResult:
    if not audio:
        raise AppError("empty_audio", "No audio was uploaded", 422)
    if len(audio) > MAX_AUDIO_BYTES:
        raise AppError("audio_too_large", "Audio exceeds the 25 MB limit", 413)
    if content_type.split(";")[0] not in ALLOWED_AUDIO:
        raise AppError("unsupported_audio", "Unsupported audio format", 415)

    if settings.deepgram_api_key:
        params = {
            "model": settings.deepgram_model,
            "smart_format": "true",
            "punctuate": "true",
            "detect_language": "true",
        }
        if language and language != "auto":
            params.pop("detect_language", None)
            params["language"] = language
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://api.deepgram.com/v1/listen",
                    params=params,
                    headers={
                        "Authorization": f"Token {settings.deepgram_api_key}",
                        "Content-Type": content_type,
                    },
                    content=audio,
                )
                response.raise_for_status()
                payload = response.json()
            channels = payload.get("results", {}).get("channels", [])
            alternative = channels[0].get("alternatives", [{}])[0] if channels else {}
            return TranscriptionResult(
                text=str(alternative.get("transcript", "")).strip(),
                provider="deepgram",
                language=payload.get("results", {}).get("channels", [{}])[0].get("detected_language"),
                duration=payload.get("metadata", {}).get("duration"),
            )
        except httpx.HTTPError as exc:
            logger.warning("Deepgram failed: %s", scrub_secrets(str(exc)))
            raise AppError("stt_failed", "Speech recognition is temporarily unavailable", 502) from exc

    provider = registry.stt_provider()
    if provider is not None:
        try:
            return await provider.transcribe(audio, filename, content_type, language)
        except Exception as exc:
            logger.warning("Provider STT failed: %s", scrub_secrets(str(exc)))
            raise AppError("stt_failed", "Speech recognition is temporarily unavailable", 502) from exc

    raise AppError(
        "stt_unavailable",
        "No server-side speech recognition is configured. Use the browser voice mode or set DEEPGRAM_API_KEY / OPENAI_API_KEY.",
        503,
    )


def strip_markdown_for_speech(text: str) -> str:
    text = re.sub(r"```.*?```", " Code block omitted. ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", text)
    text = re.sub(r"(?m)^\s*[-*+]\s+", "", text)
    text = re.sub(r"[*_~>|#]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()[:4000]


async def synthesize(text: str, voice: str | None, audio_format: str) -> SpeechResult:
    clean = strip_markdown_for_speech(text)
    if not clean:
        raise AppError("empty_speech", "There is no speakable text", 422)

    if settings.elevenlabs_api_key:
        voice_id = (
            voice
            if voice and re.fullmatch(r"[A-Za-z0-9]{12,40}", voice)
            else settings.elevenlabs_voice_id
        )
        output_format = "mp3_44100_128" if audio_format == "mp3" else "pcm_44100"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                    params={"output_format": output_format},
                    headers={
                        "xi-api-key": settings.elevenlabs_api_key,
                        "Content-Type": "application/json",
                        "Accept": "audio/mpeg",
                    },
                    json={
                        "text": clean,
                        "model_id": settings.elevenlabs_model,
                        "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
                    },
                )
                response.raise_for_status()
            content_type = "audio/mpeg" if audio_format == "mp3" else "audio/wav"
            return SpeechResult(audio=response.content, content_type=content_type, provider="elevenlabs")
        except httpx.HTTPError as exc:
            logger.warning("ElevenLabs failed: %s", scrub_secrets(str(exc)))
            raise AppError("tts_failed", "Voice synthesis is temporarily unavailable", 502) from exc

    provider = registry.tts_provider()
    if provider is not None:
        try:
            return await provider.synthesize(clean, voice, audio_format)
        except Exception as exc:
            logger.warning("Provider TTS failed: %s", scrub_secrets(str(exc)))
            raise AppError("tts_failed", "Voice synthesis is temporarily unavailable", 502) from exc

    raise AppError(
        "tts_unavailable",
        "No server-side voice is configured. The browser will use its built-in speech synthesis.",
        503,
    )
