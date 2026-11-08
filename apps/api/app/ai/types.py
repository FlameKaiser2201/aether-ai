from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Role = Literal["system", "user", "assistant", "tool"]


@dataclass(slots=True)
class ChatMessage:
    role: Role
    content: str | list[dict[str, Any]]

    def text(self) -> str:
        if isinstance(self.content, str):
            return self.content
        parts = []
        for part in self.content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return "\n".join(parts)

    def as_dict(self) -> dict[str, Any]:
        return {"role": self.role, "content": self.content}


@dataclass(slots=True)
class GenerationConfig:
    temperature: float = 0.55
    max_tokens: int = 4096
    top_p: float = 0.95
    stop: list[str] = field(default_factory=list)
    response_format: dict[str, Any] | None = None


@dataclass(slots=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def merge(self, other: Usage) -> None:
        if other.input_tokens:
            self.input_tokens = other.input_tokens
        if other.output_tokens:
            self.output_tokens = other.output_tokens


@dataclass(slots=True)
class StreamChunk:
    text: str = ""
    finish_reason: str | None = None
    usage: Usage | None = None


@dataclass(slots=True)
class ChatResult:
    text: str
    provider: str
    model: str
    usage: Usage
    finish_reason: str | None = None


@dataclass(slots=True)
class TranscriptionResult:
    text: str
    provider: str
    language: str | None = None
    duration: float | None = None


@dataclass(slots=True)
class SpeechResult:
    audio: bytes
    content_type: str
    provider: str


@dataclass(slots=True)
class ProviderCapabilities:
    streaming: bool = True
    embeddings: bool = False
    vision: bool = False
    stt: bool = False
    tts: bool = False


@dataclass(slots=True)
class RouteDecision:
    provider: Any
    model: str
    tier: str
    task_type: str
    reason: str
    demo: bool = False

    @property
    def provider_id(self) -> str:
        return str(self.provider.id)

    @property
    def provider_name(self) -> str:
        return str(self.provider.label)


@dataclass(slots=True)
class TaskDecision:
    task_type: str
    tier: str
    reason: str
    complex: bool = False
