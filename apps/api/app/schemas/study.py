from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

StudyKind = Literal["notes", "summary", "questions", "quiz", "flashcards", "revision_plan"]
StudyLevel = Literal["beginner", "intermediate", "advanced", "exam"]


class StudyGenerateRequest(BaseModel):
    kind: StudyKind
    topic: str = Field(min_length=1, max_length=500)
    level: StudyLevel = "intermediate"
    count: int = Field(default=10, ge=1, le=50)
    context: str | None = Field(default=None, max_length=20000)
    language: str = Field(default="auto", max_length=24)


class StudySetOut(ORMModel):
    id: str
    kind: str
    topic: str
    level: str
    content: dict[str, Any]
    created_at: datetime


class StudySetList(BaseModel):
    items: list[StudySetOut]
    total: int
