from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.database import SessionLocal
from app.core.dependencies import CurrentUser, DbSession
from app.core.errors import AppError
from app.models import Conversation, Message
from app.schemas.chat import (
    ChatMeta,
    ChatRequest,
    ChatResponse,
    ConversationOut,
    MessageOut,
    PlanStep,
)
from app.schemas.common import Citation, Usage
from app.services import chat_service

logger = logging.getLogger("aether.chat.api")
router = APIRouter(prefix="/chat", tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/stream")
async def stream(payload: ChatRequest, user: CurrentUser, request: Request) -> StreamingResponse:
    queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue(maxsize=256)

    async def produce() -> None:
        try:
            async with SessionLocal() as db:
                async for event, data in chat_service.stream_chat(db, user, payload):
                    await queue.put((event, data))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Chat producer failed")
            await queue.put(
                (
                    "error",
                    {"code": "chat_failed", "message": "The response could not be completed."},
                )
            )
        finally:
            await queue.put(None)

    producer = asyncio.create_task(produce())

    async def generate():
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": ping\n\n"
                    continue
                if item is None:
                    break
                event, data = item
                yield _sse(event, data)
                if await request.is_disconnected():
                    break
        finally:
            if not producer.done():
                producer.cancel()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest, user: CurrentUser, db: DbSession) -> ChatResponse:
    events: list[tuple[str, dict]] = []
    async for event, data in chat_service.stream_chat(db, user, payload):
        events.append((event, data))
    errors = [data for event, data in events if event == "error"]
    if errors:
        raise AppError(
            errors[0].get("code", "chat_failed"),
            errors[0].get("message", "Chat failed"),
            502,
        )
    meta_event = next((data for event, data in events if event == "meta"), {})
    done_event = next((data for event, data in events if event == "done"), {})
    citations_event = next((data for event, data in events if event == "citations"), {})
    validation_event = next((data for event, data in events if event == "validation"), {})
    usage_event = next((data for event, data in events if event == "usage"), {})

    conversation = await db.get(Conversation, done_event.get("conversation_id"))
    message = await db.get(Message, done_event.get("message_id"))
    if conversation is None or message is None:
        raise AppError("chat_failed", "The response was not persisted", 500)
    return ChatResponse(
        conversation=ConversationOut.model_validate(conversation),
        message=MessageOut.model_validate(message),
        citations=[Citation(**item) for item in citations_event.get("sources", [])],
        usage=Usage(
            input_tokens=usage_event.get("input_tokens", 0),
            output_tokens=usage_event.get("output_tokens", 0),
            latency_ms=usage_event.get("latency_ms", 0),
        ),
        plan=[PlanStep(**item) for item in meta_event.get("plan", [])],
        validation={"blocks": validation_event.get("blocks", [])} if validation_event else None,
        meta=ChatMeta(
            conversation_id=conversation.id,
            message_id=message.id,
            provider=meta_event.get("provider", "unknown"),
            model=meta_event.get("model", "unknown"),
            tier=meta_event.get("tier", "fast"),
            task_type=meta_event.get("task_type", "general"),
            routing_reason=meta_event.get("routing_reason", ""),
            demo=bool(meta_event.get("demo")),
            plan=[PlanStep(**item) for item in meta_event.get("plan", [])],
            mode=meta_event.get("mode", "auto"),
        ),
    )
