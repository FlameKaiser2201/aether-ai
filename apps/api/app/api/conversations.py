from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, or_, select

from app.core.dependencies import CurrentUser, DbSession, Pagination
from app.core.errors import AppError
from app.core.security import sanitize_filename
from app.models import Conversation, Message
from app.schemas.chat import (
    ConversationCreate,
    ConversationDetail,
    ConversationList,
    ConversationOut,
    ConversationUpdate,
    MessageOut,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=ConversationList)
async def list_conversations(
    user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    query: str | None = Query(default=None, max_length=120),
    archived: bool = False,
) -> ConversationList:
    limit, offset = pagination
    stmt = select(Conversation).where(
        Conversation.user_id == user.id, Conversation.archived.is_(archived)
    )
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(or_(Conversation.title.ilike(pattern), Conversation.summary.ilike(pattern)))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Conversation.pinned.desc(), Conversation.updated_at.desc()).offset(offset).limit(limit)
    items = list(await db.scalars(stmt))
    return ConversationList(
        items=[ConversationOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    payload: ConversationCreate, user: CurrentUser, db: DbSession
) -> ConversationOut:
    conversation = Conversation(
        user_id=user.id,
        title=payload.title or "New conversation",
        mode=payload.mode,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return ConversationOut.model_validate(conversation)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
    message_limit: int = Query(default=200, ge=1, le=500),
) -> ConversationDetail:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if conversation is None:
        raise AppError("not_found", "Conversation not found", 404)
    messages = list(
        await db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc())
            .limit(message_limit)
        )
    )
    messages.reverse()
    return ConversationDetail(
        **ConversationOut.model_validate(conversation).model_dump(),
        messages=[MessageOut.model_validate(message) for message in messages],
    )


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: str, payload: ConversationUpdate, user: CurrentUser, db: DbSession
) -> ConversationOut:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if conversation is None:
        raise AppError("not_found", "Conversation not found", 404)
    if payload.title is not None:
        conversation.title = payload.title.strip()
    if payload.pinned is not None:
        conversation.pinned = payload.pinned
    if payload.archived is not None:
        conversation.archived = payload.archived
    await db.commit()
    await db.refresh(conversation)
    return ConversationOut.model_validate(conversation)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, user: CurrentUser, db: DbSession) -> Response:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if conversation is None:
        raise AppError("not_found", "Conversation not found", 404)
    await db.delete(conversation)
    await db.commit()
    return Response(status_code=204)


@router.get("/{conversation_id}/export")
async def export_conversation(
    conversation_id: str,
    user: CurrentUser,
    db: DbSession,
    format: Literal["md", "json"] = "md",
) -> Response:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if conversation is None:
        raise AppError("not_found", "Conversation not found", 404)
    messages = list(
        await db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc())
        )
    )
    if format == "json":
        payload = {
            "id": conversation.id,
            "title": conversation.title,
            "mode": conversation.mode,
            "summary": conversation.summary,
            "created_at": conversation.created_at.isoformat(),
            "messages": [
                {
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at.isoformat(),
                    "citations": message.citations,
                }
                for message in messages
            ],
        }
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        media_type = "application/json"
        extension = "json"
    else:
        lines = [f"# {conversation.title}", "", f"_Exported from AETHER · {conversation.created_at.date()}_", ""]
        if conversation.summary:
            lines.extend(["## Summary", conversation.summary, ""])
        for message in messages:
            label = "You" if message.role == "user" else "AETHER"
            lines.extend([f"## {label}", message.content, ""])
            if message.citations:
                lines.append("Sources:")
                for citation in message.citations:
                    lines.append(f"- [{citation.get('index')}] {citation.get('title')} — {citation.get('url')}")
                lines.append("")
        content = "\n".join(lines)
        media_type = "text/markdown"
        extension = "md"
    filename = sanitize_filename(conversation.title, fallback="conversation") + f".{extension}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
