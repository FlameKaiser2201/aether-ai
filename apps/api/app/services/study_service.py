"""Structured study artifact generation."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import study_prompt
from app.ai.registry import registry
from app.ai.types import ChatMessage, GenerationConfig
from app.core.errors import AppError
from app.models import StudySet, User
from app.schemas.study import StudyGenerateRequest
from app.services.usage_service import log_usage
from app.utils.json_utils import parse_json_object

logger = logging.getLogger("aether.study")

REQUIRED_KEYS = {
    "notes": ["title", "overview", "sections"],
    "summary": ["tldr", "key_points"],
    "questions": ["questions"],
    "quiz": ["questions"],
    "flashcards": ["cards"],
    "revision_plan": ["daily_plan"],
}


def _normalize(kind: str, content: dict[str, Any], topic: str, raw: str) -> dict[str, Any]:
    if not content:
        content = {}
    required = REQUIRED_KEYS.get(kind, [])
    if not all(key in content for key in required):
        if kind in {"notes", "summary"}:
            return {
                "title": topic,
                "overview": raw[:4000] or "The model did not return structured JSON.",
                "sections": content.get("sections", []),
                "tldr": content.get("tldr", raw[:400]),
                "key_points": content.get("key_points", []),
                "unstructured": True,
            }
        raise AppError(
            "generation_failed",
            "The model did not return a valid study artifact. Please retry.",
            502,
        )
    return content


async def generate(db: AsyncSession, user: User, payload: StudyGenerateRequest) -> StudySet:
    decision = registry.route(
        task_type="study",
        tier="reasoning" if payload.kind == "revision_plan" else "balanced",
    )
    prompt = study_prompt(
        kind=payload.kind,
        topic=payload.topic,
        level=payload.level,
        count=payload.count,
        context=payload.context,
        language=payload.language,
    )
    result = await decision.provider.complete(
        [
            ChatMessage(
                role="system",
                content=(
                    "You are AETHER's study architect. Be accurate and exam-oriented. "
                    "Return only the requested JSON. Never invent citations."
                ),
            ),
            ChatMessage(role="user", content=prompt),
        ],
        decision.model,
        GenerationConfig(temperature=0.4, max_tokens=4000),
    )
    content = _normalize(payload.kind, parse_json_object(result.text), payload.topic, result.text)
    study_set = StudySet(
        user_id=user.id,
        kind=payload.kind,
        topic=payload.topic,
        level=payload.level,
        content=content,
    )
    db.add(study_set)
    log_usage(
        db,
        user_id=user.id,
        provider=decision.provider_id,
        model=decision.model,
        task_type=f"study_{payload.kind}",
        usage=result.usage,
        latency_ms=0,
    )
    await db.commit()
    await db.refresh(study_set)
    return study_set


async def list_sets(db: AsyncSession, user_id: str, kind: str | None = None) -> list[StudySet]:
    stmt = select(StudySet).where(StudySet.user_id == user_id)
    if kind:
        stmt = stmt.where(StudySet.kind == kind)
    stmt = stmt.order_by(StudySet.created_at.desc()).limit(100)
    return list(await db.scalars(stmt))


async def get_set(db: AsyncSession, user_id: str, set_id: str) -> StudySet:
    record = await db.scalar(
        select(StudySet).where(StudySet.id == set_id, StudySet.user_id == user_id)
    )
    if record is None:
        raise AppError("not_found", "Study set not found", 404)
    return record


async def delete_set(db: AsyncSession, user_id: str, set_id: str) -> None:
    record = await get_set(db, user_id, set_id)
    await db.delete(record)
    await db.commit()
