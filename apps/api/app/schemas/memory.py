from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

MemoryCategory = Literal[
    "identity", "preference", "goal", "project", "skill", "relationship", "schedule", "fact"
]


class MemoryCreate(BaseModel):
    category: MemoryCategory = "fact"
    key: str = Field(min_length=1, max_length=160)
    value: str = Field(min_length=1, max_length=4000)
    confidence: float = Field(default=0.9, ge=0, le=1)


class MemoryUpdate(BaseModel):
    category: MemoryCategory | None = None
    key: str | None = Field(default=None, min_length=1, max_length=160)
    value: str | None = Field(default=None, min_length=1, max_length=4000)
    confidence: float | None = Field(default=None, ge=0, le=1)


class MemoryOut(ORMModel):
    id: str
    category: str
    key: str
    value: str
    confidence: float
    source_conversation_id: str | None
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


class MemoryList(BaseModel):
    items: list[MemoryOut]
    total: int
    categories: dict[str, int] = Field(default_factory=dict)


class MemoryWipeResult(BaseModel):
    deleted: int
