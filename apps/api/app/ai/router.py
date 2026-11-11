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
    r"(?i)(search the web|web search|look up|google|latest|today|news|current events|"
    r"sources?|cite|citation|research|compare prices|market|report on)"
)
CURRENT_INFO_RE = re.compile(
    r"(?i)(\b(latest|newest|today|tonight|this (?:week|month|year)|current(?:ly)?|right now|"
    r"news|breaking|recent(?:ly)?|new release|just released|release date|"
    r"pricing|price of|stock price|weather|forecast|who won|election|as of|"
    r"2025|2026|AI developments?|model launch|new model|announcement|changelog|"
    r"up[- ]to[- ]date|end of life|eol)\b|"
    r"what(?:'s| is) new|what happened|recent developments|current events)"
)
WEB_INTENT_RE = re.compile(
    r"(?i)(\bsearch (?:the )?(?:web|internet|online)\b|\bweb search\b|"
    r"\blook (?:it |this |that )?up\b|\bbrowse (?:the )?(?:web|internet)\b|"
    r"\bgoogle (?:this|that|it|for)\b|\bfind (?:me )?(?:some )?sources\b|"
    r"\bwith (?:sources|citations)\b|\bcite (?:your )?sources\b)"
)
CODE_EDIT_RE = re.compile(
    r"(?i)\b(fix|debug|refactor|rewrite|update|change|edit|implement|write|review|"
    r"explain|optimi[sz]e)\b[^.!?\n]{0,80}\b(code|function|class|file|script|"
    r"program|app|bug|component|endpoint|query|test)\b"
)
GREETING_RE = re.compile(r"(?i)^(hi|hello|hey|yo|namaste|good (morning|afternoon|evening))[\s!.,]*$")
SMALL_TALK_RE = re.compile(
    r"(?i)^(thanks|thank you|ok|okay|cool|nice|great|sure|got it|sounds good|"
    r"how are you|how's it going|what's up|who are you)[\s!.,?]*$"
)


@dataclass(slots=True)
class ClassificationInput:
    message: str
    mode: str = "auto"
    has_files: bool = False
    has_images: bool = False
    voice: bool = False
    web_search: bool | None = None


def needs_web_search(message: str) -> bool:
    """Return True when a request genuinely depends on current information.

    Code-editing requests are excluded even if they contain words such as
    "update" or "version", so "update this function" never triggers a search.
    """
    text = message.strip()
    if not text:
        return False
    if CODE_EDIT_RE.search(text):
        return False
    return bool(CURRENT_INFO_RE.search(text) or WEB_INTENT_RE.search(text))


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
    if data.web_search is True or RESEARCH_RE.search(text) or needs_web_search(text):
        return TaskDecision("research", "balanced", "Research or current-information intent detected")
    if data.voice and len(text) < 600:
        return TaskDecision("voice", "fast", "Short voice turn")
    if len(text) > 1200 or REASONING_RE.search(text):
        return TaskDecision("reasoning", "reasoning", "Complex or multi-step reasoning detected")
    if GREETING_RE.match(lowered) or SMALL_TALK_RE.match(lowered):
        return TaskDecision("general", "fast", "Conversational turn")
    return TaskDecision("general", "balanced", "General request")


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
