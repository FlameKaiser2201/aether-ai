"""Text utilities: token estimation, chunking, retrieval scoring, titles."""

from __future__ import annotations

import re
from collections import Counter

_WORD_RE = re.compile(r"[A-Za-z0-9_+#.-]{2,}")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "have", "will", "your", "you",
    "are", "was", "were", "what", "when", "where", "which", "how", "why", "can", "could",
    "should", "would", "about", "into", "than", "then", "them", "they", "there", "their",
    "but", "not", "all", "any", "also", "just", "more", "most", "some", "such", "only",
    "a", "an", "of", "to", "in", "on", "at", "is", "it", "as", "by", "or", "be", "do",
}


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def truncate(text: str, max_chars: int, marker: str = "\n...[truncated]") -> str:
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - len(marker))] + marker


def chunk_text(text: str, max_chars: int = 1800, overlap: int = 200) -> list[str]:
    """Paragraph-aware chunks with a character overlap."""
    text = re.sub(r"\r\n?", "\n", text).strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            start = 0
            while start < len(paragraph):
                end = min(len(paragraph), start + max_chars)
                chunks.append(paragraph[start:end].strip())
                if end == len(paragraph):
                    break
                start = max(start + 1, end - overlap)
            continue
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > max_chars:
            chunks.append(current.strip())
            tail = current[-overlap:] if overlap and current else ""
            current = f"{tail}\n\n{paragraph}".strip()
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c]


def words(text: str) -> list[str]:
    return [w.lower() for w in _WORD_RE.findall(text or "") if w.lower() not in STOPWORDS]


def lexical_score(query: str, text: str) -> float:
    q = Counter(words(query))
    if not q:
        return 0.0
    t = Counter(words(text))
    if not t:
        return 0.0
    overlap = sum(min(count, t.get(word, 0)) for word, count in q.items())
    return overlap / max(1, sum(q.values()))


def rank_texts(query: str, items: list[tuple[str, str]], limit: int = 8) -> list[tuple[str, str, float]]:
    scored = [(key, text, lexical_score(query, text)) for key, text in items]
    scored.sort(key=lambda item: item[2], reverse=True)
    return [item for item in scored if item[2] > 0][:limit] or scored[:limit]


def title_from_message(message: str, fallback: str = "New conversation") -> str:
    cleaned = re.sub(r"```.*?```", " ", message, flags=re.DOTALL)
    cleaned = re.sub(r"[#*_>`\n\r\t]+", " ", cleaned)
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return fallback
    title = cleaned[:78].rstrip(" ,.;:-")
    if len(cleaned) > 78:
        title = title.rsplit(" ", 1)[0] + "…"
    return title or fallback


def split_sentences(text: str, max_chars: int = 280) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_RE.split(text) if p.strip()]
    result: list[str] = []
    for part in parts:
        if len(part) <= max_chars:
            result.append(part)
        else:
            result.extend(part[i : i + max_chars] for i in range(0, len(part), max_chars))
    return result


def normalize_key(value: str) -> str:
    value = re.sub(r"[^a-z0-9\s_-]", "", value.lower()).strip()
    return re.sub(r"\s+", " ", value)[:140] or "fact"


def format_memories(memories: list[object], max_chars: int = 3000) -> str:
    lines: list[str] = []
    total = 0
    for memory in memories:
        category = getattr(memory, "category", "fact")
        key = getattr(memory, "key", "")
        value = getattr(memory, "value", "")
        line = f"- [{category}] {key}: {value}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line)
    return "\n".join(lines)
