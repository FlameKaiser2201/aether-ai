from __future__ import annotations

from collections import Counter
from typing import Literal

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.models import Memory
from app.schemas.memory import (
    MemoryCreate,
    MemoryList,
    MemoryOut,
    MemoryUpdate,
    MemoryWipeResult,
)
from app.services import memory_service

router = APIRouter(prefix="/memories", tags=["memories"])

Category = Literal["identity", "preference", "goal", "project", "skill", "relationship", "schedule", "fact"]


@router.get("", response_model=MemoryList)
async def list_memories(
    user: CurrentUser,
    db: DbSession,
    category: Category | None = None,
    q: str | None = Query(default=None, max_length=120),
) -> MemoryList:
    items = await memory_service.list_memories(db, user.id, category=category, query=q)
    all_items = list(
        await db.scalars(select(Memory).where(Memory.user_id == user.id).limit(500))
    )
    counts = Counter(item.category for item in all_items)
    return MemoryList(
        items=[MemoryOut.model_validate(item) for item in items],
        total=len(all_items),
        categories=dict(counts),
    )


@router.post("", response_model=MemoryOut, status_code=201)
async def create_memory(payload: MemoryCreate, user: CurrentUser, db: DbSession) -> MemoryOut:
    memory = await memory_service.create_memory(db, user.id, payload)
    return MemoryOut.model_validate(memory)


@router.patch("/{memory_id}", response_model=MemoryOut)
async def update_memory(
    memory_id: str, payload: MemoryUpdate, user: CurrentUser, db: DbSession
) -> MemoryOut:
    memory = await memory_service.update_memory(db, user.id, memory_id, payload)
    return MemoryOut.model_validate(memory)


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(memory_id: str, user: CurrentUser, db: DbSession) -> Response:
    await memory_service.delete_memory(db, user.id, memory_id)
    return Response(status_code=204)


@router.delete("", response_model=MemoryWipeResult)
async def wipe_memories(user: CurrentUser, db: DbSession) -> MemoryWipeResult:
    deleted = await memory_service.wipe_memories(db, user.id)
    return MemoryWipeResult(deleted=deleted)
