"""Defensive parsing for model-produced JSON."""

from __future__ import annotations

import json
import re
from typing import Any

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def _candidate_strings(text: str) -> list[str]:
    candidates: list[str] = []
    for match in _FENCE_RE.findall(text):
        candidates.append(match.strip())
    stripped = text.strip()
    candidates.append(stripped)
    for opener, closer in (("{", "}"), ("[", "]")):
        start = stripped.find(opener)
        end = stripped.rfind(closer)
        if start != -1 and end > start:
            candidates.append(stripped[start : end + 1])
    return candidates


def _repair(raw: str) -> str:
    raw = raw.strip().replace("\u201c", '"').replace("\u201d", '"')
    raw = re.sub(r",\s*([}\]])", r"\1", raw)
    raw = re.sub(r"(?m)^\s*//.*$", "", raw)
    return raw


def parse_json_object(text: str, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    for candidate in _candidate_strings(text):
        for attempt in (candidate, _repair(candidate)):
            try:
                value = json.loads(attempt)
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                continue
    return fallback or {}


def parse_json_list(text: str, fallback: list[Any] | None = None) -> list[Any]:
    for candidate in _candidate_strings(text):
        for attempt in (candidate, _repair(candidate)):
            try:
                value = json.loads(attempt)
                if isinstance(value, list):
                    return value
            except json.JSONDecodeError:
                continue
    return fallback or []


def parse_json_any(text: str, fallback: Any = None) -> Any:
    for candidate in _candidate_strings(text):
        for attempt in (candidate, _repair(candidate)):
            try:
                return json.loads(attempt)
            except json.JSONDecodeError:
                continue
    return fallback
