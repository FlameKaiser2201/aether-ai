from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Citation(BaseModel):
    index: int
    title: str
    url: str
    snippet: str = ""


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0


class APIError(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: Any | None = None


class PageMeta(BaseModel):
    total: int
    limit: int
    offset: int
    has_more: bool


class Timestamped(ORMModel):
    created_at: datetime
    updated_at: datetime


class OkResponse(BaseModel):
    ok: bool = True
