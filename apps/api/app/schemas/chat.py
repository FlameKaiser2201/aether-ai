from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import Citation, ORMModel, Usage

ChatMode = Literal["auto", "general", "study", "coding", "interview", "research", "voice"]
MessageRole = Literal["system", "user", "assistant", "tool"]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    conversation_id: str | None = Field(default=None, max_length=36)
    mode: ChatMode = "auto"
    file_ids: list[str] = Field(default_factory=list, max_length=8)
    web_search: bool | None = None
    voice: bool = False
    language: str | None = Field(default=None, max_length=16)

    def normalized(self) -> ChatRequest:
        return self.model_copy(update={"message": self.message.strip()})


class PlanStep(BaseModel):
    title: str
    task_type: str
    priority: int = Field(ge=1, le=5)
    status: str = "pending"


class ChatMeta(BaseModel):
    conversation_id: str
    message_id: str | None = None
    provider: str
    model: str
    tier: str
    task_type: str
    routing_reason: str
    demo: bool = False
    plan: list[PlanStep] = Field(default_factory=list)
    mode: ChatMode = "auto"


class MessageOut(ORMModel):
    id: str
    role: str
    content: str
    provider: str | None = None
    model: str | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ConversationOut(ORMModel):
    id: str
    title: str
    mode: str
    summary: str | None = None
    message_count: int
    pinned: bool
    archived: bool
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut] = Field(default_factory=list)


class ConversationList(BaseModel):
    items: list[ConversationOut]
    total: int
    limit: int
    offset: int


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    mode: ChatMode = "general"


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    pinned: bool | None = None
    archived: bool | None = None


class ChatResponse(BaseModel):
    conversation: ConversationOut
    message: MessageOut
    citations: list[Citation] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    plan: list[PlanStep] = Field(default_factory=list)
    validation: dict[str, Any] | None = None
    meta: ChatMeta


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=5000)
    priority: int = Field(default=3, ge=1, le=5)
    due_at: datetime | None = None
    conversation_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=5000)
    priority: int | None = Field(default=None, ge=1, le=5)
    status: str | None = Field(default=None, pattern="^(pending|in_progress|done|cancelled)$")
    due_at: datetime | None = None


class TaskOut(ORMModel):
    id: str
    title: str
    description: str | None
    priority: int
    status: str
    due_at: datetime | None
    conversation_id: str | None
    created_at: datetime
    updated_at: datetime
