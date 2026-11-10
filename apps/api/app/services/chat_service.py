"""Chat orchestration: context, routing, tools, streaming and persistence."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.capability_guard import check_request, limitation_markdown
from app.ai.code_guard import (
    aggregate_ok,
    code_repair_prompt,
    extract_code_blocks,
    validate_text,
)
from app.ai.context import Source, build_messages, history_to_prompt
from app.ai.execution import complete_with_fallback, stream_with_fallback
from app.ai.prompts import build_system_prompt, summary_prompt
from app.ai.registry import registry
from app.ai.router import ClassificationInput, classify, plan_tasks
from app.ai.types import ChatMessage, GenerationConfig, Usage
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.security import sanitize_text
from app.models import Conversation, File, Message, Task, User
from app.schemas.chat import ChatRequest, PlanStep
from app.services import auth_service, file_service, memory_service, search_service
from app.services.usage_service import log_usage
from app.utils.text import estimate_tokens, format_memories, title_from_message

logger = logging.getLogger("aether.chat")

Event = tuple[str, dict]
_background_tasks: set[asyncio.Task] = set()


async def _get_or_create_conversation(
    db: AsyncSession, user: User, payload: ChatRequest
) -> Conversation:
    if payload.conversation_id:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == payload.conversation_id, Conversation.user_id == user.id
            )
        )
        if conversation is None:
            raise AppError("not_found", "Conversation not found", 404)
        return conversation
    conversation = Conversation(
        user_id=user.id,
        title=title_from_message(payload.message),
        mode=payload.mode if payload.mode != "auto" else "chat",
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def _owned_files(db: AsyncSession, user_id: str, file_ids: list[str]) -> list[File]:
    unique_ids = list(dict.fromkeys(file_ids))[:8]
    if not unique_ids:
        return []
    files = list(
        await db.scalars(select(File).where(File.user_id == user_id, File.id.in_(unique_ids)))
    )
    if len(files) != len(unique_ids):
        raise AppError("not_found", "One or more attachments were not found", 404)
    return files


def _chunks(text: str, size: int = 28) -> list[str]:
    return [text[index : index + size] for index in range(0, len(text), size)]


def _sse_plan(plan: list[PlanStep]) -> list[dict]:
    return [step.model_dump() for step in plan]


def _meta_event(
    *,
    conversation_id: str,
    provider: str,
    model: str,
    tier: str,
    task_type: str,
    routing_reason: str,
    demo: bool,
    plan: list[PlanStep],
    mode: str,
    message_id: str | None = None,
) -> dict:
    return {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "provider": provider,
        "model": model,
        "tier": tier,
        "task_type": task_type,
        "routing_reason": routing_reason,
        "demo": demo,
        "plan": _sse_plan(plan),
        "mode": mode,
    }


async def _save_assistant(
    db: AsyncSession,
    conversation: Conversation,
    *,
    content: str,
    provider: str,
    model: str,
    usage_input: int,
    usage_output: int,
    latency_ms: int,
    citations: list[dict],
    meta: dict,
) -> Message:
    message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=sanitize_text(content, max_length=200000),
        provider=provider,
        model=model,
        input_tokens=usage_input,
        output_tokens=usage_output,
        latency_ms=latency_ms,
        citations=citations,
        meta=meta,
    )
    db.add(message)
    conversation.message_count += 1
    conversation.last_message_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)
    # The conversation's updated_at is maintained by the database. Refresh it
    # so the non-streaming response can serialize it without a lazy load.
    await db.refresh(conversation)
    return message


async def _post_turn(
    *,
    user_id: str,
    conversation_id: str,
    user_text: str,
    assistant_text: str,
    auto_memory: bool,
    conversation_count: int,
) -> None:
    try:
        async with SessionLocal() as db:
            if auto_memory:
                await memory_service.extract_and_store(
                    db,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    user_text=user_text,
                    assistant_text=assistant_text,
                    enabled=True,
                )
                await db.commit()
            if conversation_count >= 24 and conversation_count % 8 == 0:
                conversation = await db.get(Conversation, conversation_id)
                if conversation:
                    messages = list(
                        await db.scalars(
                            select(Message)
                            .where(Message.conversation_id == conversation_id)
                            .order_by(Message.created_at.desc())
                            .limit(30)
                        )
                    )
                    messages.reverse()
                    candidates = registry.candidates(
                        task_type="general", tier="fast"
                    )
                    result, _ = await complete_with_fallback(
                        candidates,
                        [
                            ChatMessage(role="system", content="You maintain concise conversation memory."),
                            ChatMessage(
                                role="user",
                                content=summary_prompt(
                                    existing_summary=conversation.summary or "",
                                    transcript=history_to_prompt(messages, 30),
                                ),
                            ),
                        ],
                        GenerationConfig(temperature=0.2, max_tokens=600),
                    )
                    conversation.summary = result.text[:4000]
                    await db.commit()
    except Exception:
        logger.exception("Post-turn memory/summary task failed")


def _schedule_post_turn(**kwargs) -> None:
    if settings.environment == "test":
        return
    task = asyncio.create_task(_post_turn(**kwargs))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def stream_chat(
    db: AsyncSession,
    user: User,
    payload: ChatRequest,
    *,
    is_disconnected: Callable[[], bool] | None = None,
) -> AsyncIterator[Event]:
    started = time.perf_counter()
    payload = payload.normalized()
    preferences = auth_service.get_preferences(user)
    citations: list[dict] = []
    plan: list[PlanStep] = []
    validation: list[dict] | None = None
    usage_input = 0
    usage_output = 0
    provider_id = "policy"
    model_name = "capability-guard"
    task_type = "general"
    tier = "policy"
    routing_reason = ""
    demo = False

    try:
        conversation = await _get_or_create_conversation(db, user, payload)
        files = await _owned_files(db, user.id, payload.file_ids)
        has_images = any(bool(file.meta.get("is_image")) for file in files)
        limitation = check_request(payload.message)

        decision = classify(
            ClassificationInput(
                message=payload.message,
                mode=payload.mode,
                has_files=bool(files),
                has_images=has_images,
                voice=payload.voice,
                web_search=payload.web_search,
            )
        )
        task_type = decision.task_type
        tier = decision.tier
        candidates = registry.candidates(
            task_type=decision.task_type,
            tier=decision.tier,
            strategy=preferences.routing_strategy,
            require_vision=has_images,
        )
        route = candidates[0]
        provider_id = route.provider_id
        model_name = route.model
        routing_reason = route.reason
        demo = route.demo

        plan = plan_tasks(payload.message) if not payload.voice else []
        if limitation is not None:
            provider_id = "policy"
            model_name = "capability-guard"
            tier = "policy"
            task_type = "general"
            routing_reason = "Capability guard: request needs a real-world action"
            demo = False
            plan = []
            candidates = []
        if len(plan) >= 2 and payload.mode != "voice":
            for step in plan:
                db.add(
                    Task(
                        user_id=user.id,
                        conversation_id=conversation.id,
                        title=step.title,
                        description=f"Auto-planned from chat: {payload.message[:500]}",
                        priority=step.priority,
                        status="pending",
                    )
                )

        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=sanitize_text(payload.message, max_length=20000),
            meta={"file_ids": payload.file_ids, "web_search": payload.web_search},
        )
        db.add(user_message)
        conversation.message_count += 1
        conversation.last_message_at = datetime.now(UTC)
        if conversation.message_count <= 1 or conversation.title == "New conversation":
            conversation.title = title_from_message(payload.message)
        if payload.mode != "auto":
            conversation.mode = payload.mode
        await db.commit()
        await db.refresh(conversation)
        await db.refresh(user_message)

        yield (
            "meta",
            _meta_event(
                conversation_id=conversation.id,
                provider=provider_id,
                model=model_name,
                tier=tier,
                task_type=task_type,
                routing_reason=routing_reason,
                demo=demo,
                plan=plan,
                mode=payload.mode,
            ),
        )

        if limitation is not None:
            content = limitation_markdown(limitation)
            for chunk in _chunks(content):
                yield ("token", {"text": chunk})
            message = await _save_assistant(
                db,
                conversation,
                content=content,
                provider="policy",
                model="capability-guard",
                usage_input=0,
                usage_output=estimate_tokens(content),
                latency_ms=int((time.perf_counter() - started) * 1000),
                citations=[],
                meta={"limitation": limitation.code, "task_type": "general", "tier": "policy"},
            )
            yield (
                "done",
                {
                    "conversation_id": conversation.id,
                    "message_id": message.id,
                    "title": conversation.title,
                    "memory_queued": False,
                    "usage": {"input_tokens": 0, "output_tokens": estimate_tokens(content)},
                },
            )
            return

        use_web = (
            payload.web_search
            if payload.web_search is not None
            else (preferences.web_search_default or decision.task_type == "research")
        )
        sources: list[Source] = []
        if use_web:
            yield ("status", {"stage": "researching", "message": "Searching the web and reading sources…"})
            try:
                bundle = await search_service.search(payload.message, fetch_pages=True)
                if bundle.results:
                    citations = search_service.citations_from(bundle.results)
                    sources = [
                        Source(
                            index=result.index,
                            title=result.title,
                            url=result.url,
                            snippet=result.snippet,
                            content=result.content,
                        )
                        for result in bundle.results
                    ]
                    yield ("citations", {"sources": citations})
                else:
                    yield (
                        "status",
                        {
                            "stage": "research_empty",
                            "message": "Search returned no results; answering from the model's knowledge without citations.",
                        },
                    )
            except Exception as exc:
                logger.warning("Research failed: %s", exc)
                yield (
                    "status",
                    {"stage": "research_failed", "message": "Live search failed; answering without citations."},
                )

        if files:
            yield ("status", {"stage": "reading_files", "message": "Reading attached documents…"})
        excerpts = await file_service.file_excerpts(db, user.id, payload.file_ids, payload.message)
        memories = await memory_service.retrieve_memories(db, user.id, payload.message)
        memories_text = format_memories(memories)
        system_prompt = build_system_prompt(
            preferences=preferences,
            mode=task_type if task_type != "reasoning" else "general",
            user_name=user.name,
            memories_text=memories_text,
            web_enabled=bool(sources),
            plan=_sse_plan(plan),
        )

        history = list(
            await db.scalars(
                select(Message)
                .where(
                    Message.conversation_id == conversation.id,
                    Message.id != user_message.id,
                )
                .order_by(Message.created_at.desc())
                .limit(40)
            )
        )
        history.reverse()
        messages = build_messages(
            system_prompt=system_prompt,
            summary=conversation.summary,
            history=history,
            user_content=user_message.content,
            files=excerpts,
            sources=sources,
            budget=settings.context_token_budget,
        )
        if has_images and not demo:
            image_urls = []
            for record in files:
                if record.meta.get("is_image"):
                    data_url = await file_service.image_data_url(db, user.id, record.id)
                    if data_url:
                        image_urls.append(data_url)
            if image_urls:
                last = messages[-1]
                text_content = last.text()
                messages[-1] = ChatMessage(
                    role="user",
                    content=[
                        {"type": "text", "text": text_content},
                        *[
                            {"type": "image_url", "image_url": {"url": url}}
                            for url in image_urls[:3]
                        ],
                    ],
                )

        generation = GenerationConfig(
            temperature=settings.temperature,
            max_tokens=settings.max_output_tokens,
        )
        yield ("status", {"stage": "generating", "message": "Thinking…"})

        full_text = ""
        finish_reason = None
        if task_type == "coding":
            result, used = await complete_with_fallback(
                candidates, messages, generation
            )
            if used is not route:
                provider_id = used.provider_id
                model_name = used.model
                tier = used.tier
                demo = used.demo
                routing_reason = f"{used.reason} · automatic fallback"
                yield (
                    "meta",
                    _meta_event(
                        conversation_id=conversation.id,
                        provider=provider_id,
                        model=model_name,
                        tier=tier,
                        task_type=task_type,
                        routing_reason=routing_reason,
                        demo=demo,
                        plan=plan,
                        mode=payload.mode,
                    ),
                )
                yield (
                    "status",
                    {
                        "stage": "fallback",
                        "message": f"Switched to {used.provider_name} after a provider error.",
                    },
                )
            full_text = result.text
            usage_input, usage_output = result.usage.input_tokens, result.usage.output_tokens
            finish_reason = result.finish_reason
            reports = validate_text(full_text)
            if reports and not aggregate_ok(reports):
                if not demo:
                    yield ("status", {"stage": "repairing", "message": "Validation found issues. Repairing the code…"})
                    failing = [report for report in reports if not report["ok"]]
                    blocks = extract_code_blocks(full_text)
                    if blocks and failing:
                        try:
                            try:
                                start = candidates.index(used)
                            except ValueError:
                                start = 0
                            repair, _ = await complete_with_fallback(
                                candidates[start:],
                                [
                                    ChatMessage(
                                        role="system",
                                        content="You are a meticulous senior engineer. Fix code precisely. Do not introduce placeholders.",
                                    ),
                                    ChatMessage(
                                        role="user",
                                        content=code_repair_prompt(
                                            language=blocks[0].language,
                                            code=blocks[0].code,
                                            issues=failing[0].get("issues", []),
                                        ),
                                    ),
                                ],
                                GenerationConfig(temperature=0.15, max_tokens=settings.max_output_tokens),
                            )
                            repaired_text = repair.text
                            if extract_code_blocks(repaired_text):
                                repaired_reports = validate_text(repaired_text)
                                if aggregate_ok(repaired_reports) or len(repaired_reports) < len(reports):
                                    full_text = repaired_text
                                    reports = repaired_reports
                                    usage_input += repair.usage.input_tokens
                                    usage_output += repair.usage.output_tokens
                        except Exception as exc:
                            logger.warning("Code repair failed: %s", exc)
                validation = reports
            for chunk in _chunks(full_text):
                yield ("token", {"text": chunk})
                if is_disconnected and is_disconnected():
                    break
        else:
            streamed_parts: list[str] = []
            chunk_index = 0
            try:
                async for event in stream_with_fallback(
                    candidates, messages, generation
                ):
                    if event.fallback_from is not None:
                        selected = event.decision
                        provider_id = selected.provider_id
                        model_name = selected.model
                        tier = selected.tier
                        demo = selected.demo
                        routing_reason = f"{selected.reason} · automatic fallback"
                        usage_input = 0
                        usage_output = 0
                        yield (
                            "meta",
                            _meta_event(
                                conversation_id=conversation.id,
                                provider=provider_id,
                                model=model_name,
                                tier=tier,
                                task_type=task_type,
                                routing_reason=routing_reason,
                                demo=demo,
                                plan=plan,
                                mode=payload.mode,
                            ),
                        )
                        yield (
                            "status",
                            {
                                "stage": "fallback",
                                "message": f"Switched to {selected.provider_name} after a provider error.",
                            },
                        )
                        continue
                    chunk = event.chunk
                    if chunk is None:
                        continue
                    if chunk.text:
                        streamed_parts.append(chunk.text)
                        yield ("token", {"text": chunk.text})
                        chunk_index += 1
                        if chunk_index % 24 == 0 and is_disconnected and is_disconnected():
                            break
                    if chunk.usage:
                        usage_input = chunk.usage.input_tokens or usage_input
                        usage_output = chunk.usage.output_tokens or usage_output
                    if chunk.finish_reason:
                        finish_reason = chunk.finish_reason
            except Exception as exc:
                if not "".join(streamed_parts).strip():
                    raise
                logger.warning("Stream interrupted after a partial response: %s", exc)
                finish_reason = finish_reason or "interrupted"
                yield (
                    "status",
                    {
                        "stage": "interrupted",
                        "message": "The provider stopped mid-response; keeping the partial answer.",
                    },
                )
            full_text = "".join(streamed_parts)
            if not usage_output:
                usage_output = estimate_tokens(full_text)
            if not usage_input:
                usage_input = sum(estimate_tokens(message.text()) for message in messages)
            reports = validate_text(full_text)
            if reports:
                validation = reports

        if not full_text.strip():
            raise AppError("empty_response", "The model returned an empty response", 502)

        if validation:
            yield ("validation", {"blocks": validation})

        latency_ms = int((time.perf_counter() - started) * 1000)
        meta = {
            "task_type": task_type,
            "tier": tier,
            "routing_reason": routing_reason,
            "plan": _sse_plan(plan),
            "validation": validation,
            "demo": demo,
            "finish_reason": finish_reason,
            "web_search": bool(sources),
        }
        message = await _save_assistant(
            db,
            conversation,
            content=full_text,
            provider=provider_id,
            model=model_name,
            usage_input=usage_input,
            usage_output=usage_output,
            latency_ms=latency_ms,
            citations=citations,
            meta=meta,
        )
        log_usage(
            db,
            user_id=user.id,
            provider=provider_id,
            model=model_name,
            task_type=task_type,
            usage=Usage(input_tokens=usage_input, output_tokens=usage_output),
            latency_ms=latency_ms,
        )
        await db.commit()

        _schedule_post_turn(
            user_id=user.id,
            conversation_id=conversation.id,
            user_text=user_message.content,
            assistant_text=full_text,
            auto_memory=preferences.auto_memory,
            conversation_count=conversation.message_count,
        )
        yield ("usage", {"input_tokens": usage_input, "output_tokens": usage_output, "latency_ms": latency_ms})
        yield (
            "done",
            {
                "conversation_id": conversation.id,
                "message_id": message.id,
                "title": conversation.title,
                "memory_queued": preferences.auto_memory,
                "usage": {"input_tokens": usage_input, "output_tokens": usage_output},
            },
        )
    except AppError as exc:
        yield ("error", {"code": exc.code, "message": exc.message})
    except Exception:
        logger.exception("Chat stream failed")
        yield (
            "error",
            {
                "code": "chat_failed",
                "message": "I couldn't complete that response. Please try again.",
            },
        )
