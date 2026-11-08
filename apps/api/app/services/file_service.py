"""Upload orchestration, chunk indexing and document analysis."""

from __future__ import annotations

import base64
import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.context import FileExcerpt
from app.ai.prompts import file_analysis_prompt
from app.ai.registry import registry
from app.ai.types import ChatMessage, GenerationConfig
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import new_request_id, sanitize_filename, sanitize_text
from app.models import Conversation, DocumentChunk, File
from app.schemas.files import AnalyzeRequest, AnalyzeResponse
from app.services.extraction import ExtractedDocument, extract_document, is_image
from app.services.storage import storage
from app.services.usage_service import log_usage
from app.utils.json_utils import parse_json_any
from app.utils.text import chunk_text, estimate_tokens, lexical_score

logger = logging.getLogger("aether.files")


async def _owned_conversation(db: AsyncSession, user_id: str, conversation_id: str | None) -> None:
    if not conversation_id:
        return
    exists = await db.scalar(
        select(Conversation.id).where(
            Conversation.id == conversation_id, Conversation.user_id == user_id
        )
    )
    if not exists:
        raise AppError("not_found", "Conversation not found", 404)


async def upload_file(
    db: AsyncSession,
    *,
    user_id: str,
    upload: UploadFile,
    conversation_id: str | None = None,
) -> File:
    original_name = sanitize_filename(upload.filename or "upload")
    data = await upload.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise AppError(
            "file_too_large", f"File exceeds the {settings.max_upload_mb} MB limit", 413
        )
    await _owned_conversation(db, user_id, conversation_id)

    extracted: ExtractedDocument = extract_document(
        data, original_name, upload.content_type or "application/octet-stream"
    )
    extension = Path(original_name).suffix.lower()
    file_id = new_request_id() + new_request_id()[:8]
    storage_key = f"{user_id}/{file_id}{extension}"
    backend = await storage.save(storage_key, data, upload.content_type or "application/octet-stream")

    record = File(
        id=file_id,
        user_id=user_id,
        conversation_id=conversation_id,
        filename=original_name,
        original_name=original_name,
        mime_type=(upload.content_type or "application/octet-stream")[:160],
        size_bytes=len(data),
        storage_backend=backend,
        storage_key=storage_key,
        extracted_text=extracted.text,
        page_count=extracted.page_count,
        status="ready",
        meta={**extracted.meta, "has_text": bool(extracted.text), "is_image": is_image(original_name)},
    )
    db.add(record)
    chunks = chunk_text(extracted.text)[: settings.max_file_chunks] if extracted.text else []
    for index, content in enumerate(chunks):
        db.add(
            DocumentChunk(
                file_id=file_id,
                user_id=user_id,
                chunk_index=index,
                content=content,
                token_count=estimate_tokens(content),
            )
        )
    await db.commit()
    await db.refresh(record)
    logger.info("Stored file %s (%s bytes, %s chunks)", file_id, len(data), len(chunks))
    return record


async def get_file(db: AsyncSession, user_id: str, file_id: str) -> File:
    record = await db.scalar(select(File).where(File.id == file_id, File.user_id == user_id))
    if record is None:
        raise AppError("not_found", "File not found", 404)
    return record


async def list_files(db: AsyncSession, user_id: str, conversation_id: str | None = None) -> list[File]:
    stmt = select(File).where(File.user_id == user_id)
    if conversation_id:
        stmt = stmt.where(File.conversation_id == conversation_id)
    stmt = stmt.order_by(File.created_at.desc()).limit(200)
    return list(await db.scalars(stmt))


async def delete_file(db: AsyncSession, user_id: str, file_id: str) -> None:
    record = await get_file(db, user_id, file_id)
    await storage.delete(record.storage_key)
    await db.delete(record)
    await db.commit()


async def download_file(db: AsyncSession, user_id: str, file_id: str) -> tuple[bytes, str, str]:
    record = await get_file(db, user_id, file_id)
    data = await storage.read(record.storage_key)
    return data, record.mime_type, record.original_name


async def file_excerpts(
    db: AsyncSession, user_id: str, file_ids: list[str], query: str, max_chars: int = 9000
) -> list[FileExcerpt]:
    if not file_ids:
        return []
    files = list(
        await db.scalars(select(File).where(File.user_id == user_id, File.id.in_(file_ids[:8])))
    )
    excerpts: list[FileExcerpt] = []
    used = 0
    for record in files:
        if record.meta.get("is_image"):
            text = f"[Image attachment: {record.original_name}, {record.meta.get('width')}x{record.meta.get('height')}]"
            excerpts.append(FileExcerpt(filename=record.original_name, content=text))
            continue
        chunks = list(
            await db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.file_id == record.id)
                .order_by(DocumentChunk.chunk_index)
            )
        )
        if not chunks:
            content = record.extracted_text[:4000]
            if content:
                excerpts.append(FileExcerpt(filename=record.original_name, content=content))
                used += len(content)
            continue
        ranked = sorted(
            chunks,
            key=lambda chunk: lexical_score(query, chunk.content),
            reverse=True,
        )[:3]
        ranked.sort(key=lambda chunk: chunk.chunk_index)
        content = "\n\n".join(chunk.content for chunk in ranked)
        if used + len(content) > max_chars:
            content = content[: max(500, max_chars - used)]
        excerpts.append(FileExcerpt(filename=record.original_name, content=content))
        used += len(content)
        if used >= max_chars:
            break
    return excerpts


async def image_data_url(db: AsyncSession, user_id: str, file_id: str) -> str | None:
    try:
        record = await get_file(db, user_id, file_id)
        if not record.meta.get("is_image"):
            return None
        data = await storage.read(record.storage_key)
        encoded = base64.b64encode(data).decode()
        return f"data:{record.mime_type};base64,{encoded}"
    except AppError:
        return None


async def analyze_file(
    db: AsyncSession, *, user_id: str, file_id: str, payload: AnalyzeRequest
) -> AnalyzeResponse:
    record = await get_file(db, user_id, file_id)
    decision = registry.route(task_type="study", tier="balanced")
    content = record.extracted_text
    if not content and not record.meta.get("is_image"):
        raise AppError("empty_document", "No readable text was found in this file", 422)

    prompt = file_analysis_prompt(
        mode=payload.mode,
        filename=record.original_name,
        content=content[:16000] if content else "[Image attachment]",
        instruction=payload.instruction,
        schema_hint=payload.schema_hint,
    )
    messages: list[ChatMessage] = [
        ChatMessage(
            role="system",
            content=(
                "You are AETHER's document analyst. Use only the supplied evidence. "
                "Never invent facts, numbers or citations. Return clean Markdown unless JSON is requested."
            ),
        )
    ]
    image_url = await image_data_url(db, user_id, file_id) if record.meta.get("is_image") else None
    if image_url and decision.provider.capabilities.vision:
        messages.append(
            ChatMessage(
                role="user",
                content=[
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            )
        )
    elif record.meta.get("is_image"):
        raise AppError(
            "vision_unavailable",
            "Image analysis needs a vision-capable provider. Configure OPENAI_API_KEY or enable Ollama with a vision model.",
            422,
        )
    else:
        messages.append(ChatMessage(role="user", content=prompt))

    result = await decision.provider.complete(
        messages, decision.model, GenerationConfig(temperature=0.2, max_tokens=2500)
    )
    parsed = None
    if payload.mode == "extract":
        parsed = parse_json_any(result.text, None)
    log_usage(
        db,
        user_id=user_id,
        provider=decision.provider_id,
        model=decision.model,
        task_type="file_analysis",
        usage=result.usage,
        latency_ms=0,
    )
    await db.commit()
    return AnalyzeResponse(
        file_id=file_id,
        mode=payload.mode,
        content=sanitize_text(result.text, max_length=50000),
        data=parsed,
        provider=decision.provider_id,
        model=decision.model,
    )
