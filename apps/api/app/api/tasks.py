from __future__ import annotations

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.errors import AppError
from app.models import Conversation, Task
from app.schemas.chat import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    user: CurrentUser,
    db: DbSession,
    status: str | None = Query(default=None, pattern="^(pending|in_progress|done|cancelled)$"),
) -> list[TaskOut]:
    stmt = select(Task).where(Task.user_id == user.id)
    if status:
        stmt = stmt.where(Task.status == status)
    stmt = stmt.order_by(Task.status.asc(), Task.priority.asc(), Task.created_at.desc()).limit(300)
    return [TaskOut.model_validate(item) for item in await db.scalars(stmt)]


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(payload: TaskCreate, user: CurrentUser, db: DbSession) -> TaskOut:
    if payload.conversation_id:
        exists = await db.scalar(
            select(Conversation.id).where(
                Conversation.id == payload.conversation_id, Conversation.user_id == user.id
            )
        )
        if not exists:
            raise AppError("not_found", "Conversation not found", 404)
    task = Task(
        user_id=user.id,
        conversation_id=payload.conversation_id,
        title=payload.title.strip(),
        description=payload.description,
        priority=payload.priority,
        due_at=payload.due_at,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, payload: TaskUpdate, user: CurrentUser, db: DbSession) -> TaskOut:
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if task is None:
        raise AppError("not_found", "Task not found", 404)
    for field in ("title", "description", "priority", "status", "due_at"):
        value = getattr(payload, field)
        if value is not None:
            setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, user: CurrentUser, db: DbSession) -> Response:
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if task is None:
        raise AppError("not_found", "Task not found", 404)
    await db.delete(task)
    await db.commit()
    return Response(status_code=204)
