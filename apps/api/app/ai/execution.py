"""Execute a chat turn with automatic cross-provider fallback.

The registry ranks candidates by provider priority. This module walks that
list until a provider succeeds. Streaming fallback is only safe before the
first text token; after that the partial answer is kept instead of restarting
and duplicating output.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.ai.base import ProviderError
from app.ai.types import (
    ChatMessage,
    ChatResult,
    GenerationConfig,
    RouteDecision,
    StreamChunk,
)

logger = logging.getLogger("aether.execution")


@dataclass(slots=True)
class StreamEvent:
    decision: RouteDecision
    chunk: StreamChunk | None = None
    fallback_from: RouteDecision | None = None


def _next_decision(
    candidates: list[RouteDecision], index: int
) -> RouteDecision | None:
    return candidates[index + 1] if index + 1 < len(candidates) else None


def _log_failure(
    decision: RouteDecision,
    exc: Exception,
    next_decision: RouteDecision | None,
) -> None:
    action = (
        f"falling back to {next_decision.provider_id}"
        if next_decision is not None
        else "no fallback remains"
    )
    if isinstance(exc, ProviderError):
        logger.warning(
            "Provider %s failed (%s); %s",
            decision.provider_id,
            exc.message,
            action,
        )
    else:
        logger.exception(
            "Provider %s raised an unexpected error; %s",
            decision.provider_id,
            action,
        )


async def complete_with_fallback(
    candidates: list[RouteDecision],
    messages: list[ChatMessage],
    config: GenerationConfig,
) -> tuple[ChatResult, RouteDecision]:
    """Return the first successful completion and the decision that produced it."""
    if not candidates:
        raise ProviderError("router", "No model provider is configured", 503)

    last_error: Exception | None = None
    for index, decision in enumerate(candidates):
        next_decision = _next_decision(candidates, index)
        try:
            result = await decision.provider.complete(
                messages, decision.model, config
            )
            if result.text.strip() or next_decision is None:
                return result, decision
            last_error = ProviderError(
                decision.provider_id, "Provider returned an empty response", 502
            )
            _log_failure(decision, last_error, next_decision)
        except Exception as exc:
            last_error = exc
            _log_failure(decision, exc, next_decision)

    if last_error is not None:
        raise last_error
    raise ProviderError("router", "No model provider is configured", 503)


async def stream_with_fallback(
    candidates: list[RouteDecision],
    messages: list[ChatMessage],
    config: GenerationConfig,
) -> AsyncIterator[StreamEvent]:
    """Stream the first viable provider, switching before the first token.

    A ``fallback_from`` event is emitted before the replacement provider is
    tried, letting the caller update its SSE metadata. Once text has been sent,
    an error is re-raised so the caller can keep the partial answer rather than
    duplicating it.
    """
    if not candidates:
        raise ProviderError("router", "No model provider is configured", 503)

    last_error: Exception | None = None
    for index, decision in enumerate(candidates):
        emitted = False
        failed: Exception | None = None
        try:
            async for chunk in decision.provider.stream(
                messages, decision.model, config
            ):
                if chunk.text:
                    emitted = True
                yield StreamEvent(decision=decision, chunk=chunk)
            if not emitted:
                failed = ProviderError(
                    decision.provider_id,
                    "Provider returned an empty response",
                    502,
                )
        except Exception as exc:
            if emitted:
                logger.warning(
                    "Provider %s failed mid-stream; keeping the partial response: %s",
                    decision.provider_id,
                    exc,
                )
                raise
            failed = exc

        if failed is None:
            return

        last_error = failed
        next_decision = _next_decision(candidates, index)
        _log_failure(decision, failed, next_decision)
        if next_decision is None:
            break
        yield StreamEvent(decision=next_decision, fallback_from=decision)

    if last_error is not None:
        raise last_error
    raise ProviderError("router", "No model provider is configured", 503)
