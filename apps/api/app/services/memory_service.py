"""Long-term memory: retrieval, extraction, deduplication and CRUD."""

from __future__ import annotations

import logging
import math
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import memory_extraction_prompt
from app.ai.registry import registry
from app.ai.types import ChatMessage, GenerationConfig
from app.core.config import settings
from app.core.errors import AppError
from app.core.security import sanitize_text
from app.models import Memory
from app.schemas.memory import MemoryCreate, MemoryUpdate
from app.utils.json_utils import parse_json_object
from app.utils.text import lexical_score, normalize_key

logger = logging.getLogger("aether.memory")

VALID_CATEGORIES = {
    "identity", "preference", "goal", "project", "skill", "relationship", "schedule", "fact"
}

_FALLBACK_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    ("identity", "name", re.compile(r"(?i)\bmy name is\s+([A-Z][A-Za-z .'-]{1,60})")),
    ("identity", "employer", re.compile(r"(?i)\bi work (?:at|for)\s+([A-Za-z0-9 &.'-]{2,80})")),
    ("identity", "role", re.compile(r"(?i)\bi(?:'m| am) (?:a|an)\s+([A-Za-z][A-Za-z /-]{2,80})")),
    ("preference", "preference", re.compile(r"(?i)\bi prefer\s+([^.!?\n]{2,160})")),
    ("skill", "learning", re.compile(r"(?i)\bi(?:'m| am) (?:learning|studying)\s+([^.!?\n]{2,120})")),
    ("goal", "goal", re.compile(r"(?i)\bmy goal is\s+([^.!?\n]{2,200})")),
    ("fact", "remembered", re.compile(r"(?i)\bremember that\s+([^.!?\n]{2,240})")),
    ("project", "project", re.compile(r"(?i)\bi(?:'m| am) (?:building|working on)\s+([^.!?\n]{2,160})")),
]


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=False))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


async def _embed(texts: list[str]) -> list[list[float]]:
    if not settings.memory_embeddings or not texts:
        return []
    selected = registry.embedding_provider()
    if not selected:
        return []
    provider, model = selected
    try:
        return await provider.embed(texts, model)
    except Exception as exc:
        logger.warning("Memory embedding failed: %s", exc)
        return []


def _recency_score(value: datetime | None) -> float:
    if value is None:
        return 0.0
    now = datetime.now(UTC)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    age_days = max(0.0, (now - value).total_seconds() / 86400)
    return max(0.0, 1.0 - min(age_days, 120) / 120)


async def retrieve_memories(
    db: AsyncSession, user_id: str, query: str, limit: int | None = None
) -> list[Memory]:
    limit = limit or settings.memory_retrieval_limit
    result = await db.scalars(
        select(Memory).where(Memory.user_id == user_id).order_by(Memory.updated_at.desc()).limit(500)
    )
    memories = list(result)
    if not memories:
        return []
    query_embedding: list[float] = []
    if settings.memory_embeddings and any(m.embedding for m in memories):
        vectors = await _embed([query])
        query_embedding = vectors[0] if vectors else []

    scored: list[tuple[float, Memory]] = []
    for memory in memories:
        text = f"{memory.key} {memory.value}"
        score = lexical_score(query, text) * 2.0 + memory.confidence * 0.35 + _recency_score(memory.updated_at) * 0.25
        if query_embedding and memory.embedding:
            score += _cosine(query_embedding, memory.embedding) * 1.5
        scored.append((score, memory))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [memory for score, memory in scored[:limit] if score > 0.05] or [m for _, m in scored[:2]]
    if selected:
        await db.execute(
            update(Memory)
            .where(Memory.id.in_([m.id for m in selected]))
            .values(last_used_at=datetime.now(UTC))
        )
    return selected


async def upsert_memory(
    db: AsyncSession,
    user_id: str,
    *,
    category: str,
    key: str,
    value: str,
    confidence: float,
    source_conversation_id: str | None = None,
    embedding: list[float] | None = None,
) -> Memory:
    category = category if category in VALID_CATEGORIES else "fact"
    key = normalize_key(key)[:160]
    value = sanitize_text(value, max_length=4000).strip()
    if not value:
        raise AppError("validation_error", "Memory value cannot be blank", 422)
    existing = await db.scalar(
        select(Memory).where(
            Memory.user_id == user_id, Memory.category == category, Memory.key == key
        )
    )
    if existing:
        existing.value = value
        existing.confidence = max(0.1, min(1.0, confidence))
        if embedding:
            existing.embedding = embedding
        if source_conversation_id:
            existing.source_conversation_id = source_conversation_id
        return existing
    memory = Memory(
        user_id=user_id,
        category=category,
        key=key,
        value=value,
        confidence=max(0.1, min(1.0, confidence)),
        source_conversation_id=source_conversation_id,
        embedding=embedding,
    )
    db.add(memory)
    return memory


async def create_memory(db: AsyncSession, user_id: str, payload: MemoryCreate) -> Memory:
    embeddings = await _embed([f"{payload.key} {payload.value}"])
    memory = await upsert_memory(
        db,
        user_id,
        category=payload.category,
        key=payload.key,
        value=payload.value,
        confidence=payload.confidence,
        embedding=embeddings[0] if embeddings else None,
    )
    await _enforce_limit(db, user_id)
    await db.commit()
    await db.refresh(memory)
    return memory


async def update_memory(db: AsyncSession, user_id: str, memory_id: str, payload: MemoryUpdate) -> Memory:
    memory = await db.scalar(select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id))
    if memory is None:
        raise AppError("not_found", "Memory not found", 404)
    if payload.category is not None:
        memory.category = payload.category
    if payload.key is not None:
        memory.key = normalize_key(payload.key)
    if payload.value is not None:
        memory.value = sanitize_text(payload.value, max_length=4000).strip()
    if payload.confidence is not None:
        memory.confidence = payload.confidence
    embeddings = await _embed([f"{memory.key} {memory.value}"])
    if embeddings:
        memory.embedding = embeddings[0]
    await db.commit()
    await db.refresh(memory)
    return memory


async def delete_memory(db: AsyncSession, user_id: str, memory_id: str) -> None:
    result = await db.execute(delete(Memory).where(Memory.id == memory_id, Memory.user_id == user_id))
    if not result.rowcount:
        raise AppError("not_found", "Memory not found", 404)
    await db.commit()


async def wipe_memories(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(delete(Memory).where(Memory.user_id == user_id))
    await db.commit()
    return int(result.rowcount or 0)


async def list_memories(
    db: AsyncSession, user_id: str, *, category: str | None = None, query: str | None = None
) -> list[Memory]:
    stmt = select(Memory).where(Memory.user_id == user_id)
    if category:
        stmt = stmt.where(Memory.category == category)
    if query:
        pattern = f"%{query[:120]}%"
        stmt = stmt.where(Memory.key.ilike(pattern) | Memory.value.ilike(pattern))
    stmt = stmt.order_by(Memory.updated_at.desc()).limit(500)
    return list(await db.scalars(stmt))


async def _enforce_limit(db: AsyncSession, user_id: str) -> None:
    count = await db.scalar(select(func.count()).select_from(Memory).where(Memory.user_id == user_id)) or 0
    if count <= settings.max_memories_per_user:
        return
    excess = count - settings.max_memories_per_user
    oldest = await db.scalars(
        select(Memory)
        .where(Memory.user_id == user_id)
        .order_by(Memory.confidence.asc(), Memory.updated_at.asc())
        .limit(excess)
    )
    for memory in oldest:
        await db.delete(memory)


def _fallback_extract(user_text: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for category, key, pattern in _FALLBACK_PATTERNS:
        match = pattern.search(user_text)
        if match:
            found.append(
                {
                    "category": category,
                    "key": key,
                    "value": match.group(1).strip(),
                    "confidence": 0.7,
                }
            )
    return found[:4]


async def extract_and_store(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str,
    user_text: str,
    assistant_text: str,
    enabled: bool,
) -> int:
    if not enabled or not user_text.strip():
        return 0
    candidates: list[dict[str, Any]] = []
    if not settings.effective_demo_mode:
        decision = registry.route(task_type="general", tier="fast")
        try:
            result = await decision.provider.complete(
                [
                    ChatMessage(role="system", content="You extract durable user memories. Return strict JSON."),
                    ChatMessage(
                        role="user",
                        content=memory_extraction_prompt(
                            user_text=user_text, assistant_text=assistant_text
                        ),
                    ),
                ],
                decision.model,
                GenerationConfig(temperature=0.1, max_tokens=700),
            )
            parsed = parse_json_object(result.text, {"memories": []})
            candidates = [
                item for item in parsed.get("memories", []) if isinstance(item, dict)
            ][:4]
        except Exception as exc:
            logger.warning("LLM memory extraction failed: %s", exc)
    candidates.extend(_fallback_extract(user_text))

    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for item in candidates:
        category = str(item.get("category", "fact")).lower()
        if category not in VALID_CATEGORIES:
            category = "fact"
        key = normalize_key(str(item.get("key", "fact")))
        value = sanitize_text(str(item.get("value", "")), max_length=4000).strip()
        if not value or len(value) < 2:
            continue
        try:
            confidence = max(0.1, min(1.0, float(item.get("confidence", 0.75))))
        except (TypeError, ValueError):
            confidence = 0.75
        deduped[(category, key)] = {
            "category": category,
            "key": key,
            "value": value,
            "confidence": confidence,
        }

    if not deduped:
        return 0
    texts = [f"{item['key']} {item['value']}" for item in deduped.values()]
    embeddings = await _embed(texts)
    for index, item in enumerate(deduped.values()):
        await upsert_memory(
            db,
            user_id,
            category=item["category"],
            key=item["key"],
            value=item["value"],
            confidence=item["confidence"],
            source_conversation_id=conversation_id,
            embedding=embeddings[index] if index < len(embeddings) else None,
        )
    await _enforce_limit(db, user_id)
    return len(deduped)
