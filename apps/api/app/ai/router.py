"""Deterministic task classification and multi-task planning."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ai.types import TaskDecision
from app.schemas.chat import PlanStep

CODE_RE = re.compile(
    r"(?i)(```|def |class |function |const |let |var |import |from .* import|public |private |"
    r"console\.log|print\(|debug|refactor|stack ?trace|traceback|exception|compile|syntax|"
    r"api endpoint|database query|sql\b|regex|algorithm|unit test|code review|pull request|"
    r"\b(python|java|javascript|typescript|c\+\+|c#|golang|rust|php|dart|kotlin|swift|ruby)\b|"
    r"\b(react|next\.js|node\.js|express|django|fastapi|flask|spring boot|asp\.net|angular|vue|flutter)\b)"
)
REASONING_RE = re.compile(
    r"(?i)(prove|derive|architecture|trade-?off|design a|system design|scalab|distributed|"
    r"optimi[sz]e|complexity|root cause|strategy|compare .* and .*|evaluate|critique|"
    r"why (does|do|is|are)|step[- ]by[- ]step)"
)
STUDY_RE = re.compile(
    r"(?i)(teach|explain|notes?|summar|quiz|flashcards?|exam|revision|revise|syllabus|"
    r"important questions|study plan|learn|concept|tutorial|practice questions)"
)
INTERVIEW_RE = re.compile(
    r"(?i)(interview|mock interview|hr round|behavio(u)?ral|dsa|leetcode|"
    r"system design (?:interview|round|question)|tell me about yourself|star method|hiring|"
    r"recruit|google|amazon|microsoft|meta|flipkart|infosys|tcs|accenture|company-specific)"
)
RESEARCH_RE = re.compile(
    r"(?i)(search|latest|today|news|current|2025|2026|sources?|cite|citation|research|"
    r"look up|web|internet|compare prices|market|report on)"
)
GREETING_RE = re.compile(r"(?i)^(hi|hello|hey|yo|namaste|good (morning|afternoon|evening))[\s!.,]*$")


@dataclass(slots=True)
class ClassificationInput:
    message: str
    mode: str = "auto"
    has_files: bool = False
    has_images: bool = False
    voice: bool = False
    web_search: bool | None = None


def classify(data: ClassificationInput) -> TaskDecision:
    text = data.message.strip()
    lowered = text.lower()
    explicit = data.mode if data.mode != "auto" else None

    if data.has_images:
        return TaskDecision("vision", "vision", "Image attachment requires a vision-capable model")
    if explicit == "coding":
        return TaskDecision("coding", "coding", "Explicit coding mode")
    if explicit == "interview":
        return TaskDecision("interview", "reasoning", "Explicit interview mode")
    if explicit == "study":
        return TaskDecision("study", "balanced", "Explicit study mode")
    if explicit == "research":
        return TaskDecision("research", "balanced", "Explicit research mode")
    if explicit == "voice":
        return TaskDecision("voice", "fast", "Explicit voice mode")

    if data.has_files:
        return TaskDecision("study", "balanced", "Document attached; using document analysis context")

    if CODE_RE.search(text):
        return TaskDecision("coding", "coding", "Code or engineering intent detected")
    if INTERVIEW_RE.search(text):
        return TaskDecision("interview", "reasoning", "Interview preparation intent detected")
    if STUDY_RE.search(text):
        return TaskDecision("study", "balanced", "Study/learning intent detected")
    if data.web_search is True or RESEARCH_RE.search(text):
        return TaskDecision("research", "balanced", "Research or current-information intent detected")
    if data.voice and len(text) < 600:
        return TaskDecision("voice", "fast", "Short voice turn")
    if len(text) > 1200 or REASONING_RE.search(text):
        return TaskDecision("reasoning", "reasoning", "Complex or multi-step reasoning detected")
    if GREETING_RE.match(lowered):
        return TaskDecision("general", "fast", "Conversational greeting")
    return TaskDecision("general", "fast", "Short general request")


def plan_tasks(message: str) -> list[PlanStep]:
    text = message.strip()
    candidates: list[str] = []
    numbered = re.findall(r"(?m)^\s*(?:\d+[.)]|[-*•])\s+(.{4,180})$", text)
    if len(numbered) >= 2:
        candidates = numbered
    else:
        split = re.split(r"(?i)\s+(?:and then|then also|also|and also|plus)\s+", text)
        if len(split) >= 2:
            candidates = [part.strip() for part in split if len(part.strip()) > 8]
    candidates = candidates[:6]
    steps: list[PlanStep] = []
    for index, candidate in enumerate(candidates):
        task_type = classify(ClassificationInput(candidate)).task_type
        priority = 3
        if re.search(r"(?i)(bug|broken|urgent|error|security|fails?|crash)", candidate):
            priority = 1
        elif re.search(r"(?i)(exam|deadline|tomorrow|today|interview)", candidate):
            priority = 2
        elif task_type in {"coding", "interview"}:
            priority = 2
        steps.append(
            PlanStep(
                title=candidate[:160],
                task_type=task_type,
                priority=min(5, priority + (1 if index > 3 else 0)),
                status="pending",
            )
        )
    return steps
