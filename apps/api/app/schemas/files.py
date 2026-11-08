from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class FileOut(ORMModel):
    id: str
    conversation_id: str | None
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    storage_backend: str
    page_count: int
    status: str
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class FileList(BaseModel):
    items: list[FileOut]
    total: int


class AnalyzeRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=4000)
    mode: Literal["analyze", "summarize", "extract"] = "analyze"
    schema_hint: str | None = Field(default=None, max_length=2000)


class AnalyzeResponse(BaseModel):
    file_id: str
    mode: str
    content: str
    data: Any | None = None
    provider: str
    model: str
