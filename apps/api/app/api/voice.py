from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response

from app.core.dependencies import CurrentUser
from app.schemas.voice import SynthesizeRequest, TranscribeResponse, VoiceStatus
from app.services import voice_service

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/status", response_model=VoiceStatus)
async def status(user: CurrentUser) -> VoiceStatus:
    return voice_service.status()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    user: CurrentUser,
    audio: UploadFile = File(...),
    language: str | None = None,
) -> TranscribeResponse:
    data = await audio.read(25 * 1024 * 1024 + 1)
    result = await voice_service.transcribe(
        data,
        filename=audio.filename or "audio.webm",
        content_type=audio.content_type or "audio/webm",
        language=language,
    )
    return TranscribeResponse(
        text=result.text,
        language=result.language,
        duration=result.duration,
        provider=result.provider,
    )


@router.post("/synthesize")
async def synthesize(payload: SynthesizeRequest, user: CurrentUser) -> Response:
    result = await voice_service.synthesize(payload.text, payload.voice, payload.format)
    return Response(
        content=result.audio,
        media_type=result.content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Voice-Provider": result.provider,
        },
    )
