from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning", "info"]
    line: int | None = None
    column: int | None = None
    rule: str
    message: str
    suggestion: str = ""


class ValidationReport(BaseModel):
    language: str
    ok: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    checked: list[str] = Field(default_factory=list)


class CodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100000)
    language: str | None = Field(default=None, max_length=32)
    goal: str | None = Field(default=None, max_length=2000)


class CodeActionResponse(BaseModel):
    result: str
    code: str | None = None
    validation: ValidationReport
    provider: str
    model: str
