from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

InterviewType = Literal["hr", "technical", "dsa", "system_design", "behavioral", "mixed"]
Difficulty = Literal["easy", "medium", "hard"]


class Question(BaseModel):
    index: int
    question: str
    category: str
    difficulty: str
    hint: str = ""
    answer_guide: str = ""


class QuestionBankItem(Question):
    role: str
    company: str


class SessionCreate(BaseModel):
    role: str = Field(min_length=1, max_length=120)
    company: str = Field(default="General", max_length=120)
    type: InterviewType = "mixed"
    difficulty: Difficulty = "medium"
    question_count: int = Field(default=5, ge=1, le=20)


class SessionOut(ORMModel):
    id: str
    role: str
    company: str
    type: str
    difficulty: str
    status: str
    questions: list[dict[str, Any]]
    score: float | None
    feedback: dict[str, Any]
    created_at: datetime
    completed_at: datetime | None


class SessionList(BaseModel):
    items: list[SessionOut]
    total: int


class AnswerRequest(BaseModel):
    question_index: int = Field(ge=0)
    answer: str = Field(min_length=1, max_length=10000)


class EvaluationOut(BaseModel):
    question_index: int
    score: float
    rubric: dict[str, float]
    strengths: list[str]
    improvements: list[str]
    model_answer: str
    next_question: dict[str, Any] | None = None


class ReportOut(BaseModel):
    session_id: str
    score: float
    overall: str
    strengths: list[str]
    gaps: list[str]
    next_steps: list[str]
    per_question: list[dict[str, Any]]
