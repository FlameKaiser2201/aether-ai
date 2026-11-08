"""Context assembly with token budgeting and untrusted-content framing."""

from __future__ import annotations

from dataclasses import dataclass

from app.ai.types import ChatMessage
from app.models import Message
from app.utils.security import wrap_untrusted
from app.utils.text import estimate_tokens, truncate


@dataclass(slots=True)
class FileExcerpt:
    filename: str
    content: str


@dataclass(slots=True)
class Source:
    index: int
    title: str
    url: str
    snippet: str
    content: str = ""


def format_file_context(files: list[FileExcerpt], max_total: int = 9000) -> str:
    if not files:
        return ""
    blocks: list[str] = []
    per_file = max(1200, max_total // max(1, len(files)))
    for file in files:
        blocks.append(
            wrap_untrusted(f"file:{file.filename}", truncate(file.content, per_file), per_file)
        )
    return "\n\n".join(blocks)


def format_source_context(sources: list[Source], max_total: int = 9000) -> str:
    if not sources:
        return ""
    blocks: list[str] = []
    per_source = max(900, max_total // max(1, len(sources)))
    for source in sources:
        body = source.content or source.snippet
        blocks.append(
            f"[{source.index}] {source.title} — {source.url}\n"
            + wrap_untrusted(f"web:{source.url}", truncate(body, per_source), per_source)
        )
    return "\n\n".join(blocks)


def build_messages(
    *,
    system_prompt: str,
    summary: str | None,
    history: list[Message],
    user_content: str,
    files: list[FileExcerpt] | None = None,
    sources: list[Source] | None = None,
    budget: int = 24000,
) -> list[ChatMessage]:
    messages: list[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]
    if summary:
        messages.append(
            ChatMessage(role="system", content=f"Rolling conversation summary:\n{truncate(summary, 3000)}")
        )

    # Keep the most recent turns, dropping oldest until the budget is respected.
    recent: list[ChatMessage] = [
        ChatMessage(role=m.role, content=m.content)  # type: ignore[arg-type]
        for m in history
        if m.role in {"user", "assistant"}
    ]
    current = user_content
    extras: list[str] = []
    file_context = format_file_context(files or [])
    if file_context:
        extras.append("## Attached documents\n" + file_context)
    source_context = format_source_context(sources or [])
    if source_context:
        extras.append(
            "## Web sources\nCite these with their index. Do not invent sources.\n" + source_context
        )
    if extras:
        current = current + "\n\n" + "\n\n".join(extras)

    base_tokens = estimate_tokens(system_prompt) + estimate_tokens(current)
    remaining = max(2000, budget - base_tokens)
    selected: list[ChatMessage] = []
    used = 0
    for message in reversed(recent):
        cost = estimate_tokens(message.text()) + 8
        if used + cost > remaining:
            break
        selected.append(message)
        used += cost
    selected.reverse()
    messages.extend(selected)
    messages.append(ChatMessage(role="user", content=current))
    return messages


def history_to_prompt(history: list[Message], limit: int = 30) -> str:
    lines: list[str] = []
    for message in history[-limit:]:
        label = "User" if message.role == "user" else "Assistant"
        lines.append(f"{label}: {truncate(message.content, 1200)}")
    return "\n\n".join(lines)
