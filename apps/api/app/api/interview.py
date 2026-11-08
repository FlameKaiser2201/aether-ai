from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.interview import (
    AnswerRequest,
    EvaluationOut,
    QuestionBankItem,
    ReportOut,
    SessionCreate,
    SessionList,
    SessionOut,
)
from app.services import interview_service

router = APIRouter(prefix="/interview", tags=["interview"])


@router.get("/questions", response_model=list[QuestionBankItem])
async def questions(
    user: CurrentUser,
    role: str | None = Query(default=None, max_length=120),
    company: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=32),
    difficulty: str | None = Query(default=None, pattern="^(easy|medium|hard)$"),
) -> list[QuestionBankItem]:
    items = interview_service.question_bank(
        role=role, company=company, category=category, difficulty=difficulty
    )
    return [
        QuestionBankItem(
            index=index,
            question=item["question"],
            category=item["category"],
            difficulty=item["difficulty"],
            hint=item["hint"],
            answer_guide=item["answer_guide"],
            role=item["role"],
            company=item["company"],
        )
        for index, item in enumerate(items)
    ]


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def start_session(payload: SessionCreate, user: CurrentUser, db: DbSession) -> SessionOut:
    session = await interview_service.start_session(db, user, payload)
    return SessionOut.model_validate(session)


@router.get("/sessions", response_model=SessionList)
async def list_sessions(user: CurrentUser, db: DbSession) -> SessionList:
    items = await interview_service.list_sessions(db, user.id)
    return SessionList(items=[SessionOut.model_validate(item) for item in items], total=len(items))


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, user: CurrentUser, db: DbSession) -> SessionOut:
    return SessionOut.model_validate(await interview_service.get_session(db, user.id, session_id))


@router.post("/sessions/{session_id}/answer", response_model=EvaluationOut)
async def answer(
    session_id: str, payload: AnswerRequest, user: CurrentUser, db: DbSession
) -> EvaluationOut:
    return await interview_service.answer(db, user, session_id, payload)


@router.post("/sessions/{session_id}/complete", response_model=ReportOut)
async def complete(session_id: str, user: CurrentUser, db: DbSession) -> ReportOut:
    return await interview_service.complete(db, user, session_id)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, user: CurrentUser, db: DbSession) -> Response:
    await interview_service.delete_session(db, user.id, session_id)
    return Response(status_code=204)
