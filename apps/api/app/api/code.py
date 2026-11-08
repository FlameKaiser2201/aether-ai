from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.code import CodeActionResponse, CodeRequest, ValidationReport
from app.services import code_service

router = APIRouter(prefix="/code", tags=["code"])


@router.post("/validate", response_model=ValidationReport)
async def validate(payload: CodeRequest, user: CurrentUser) -> ValidationReport:
    return code_service.validate(payload)


@router.post("/review", response_model=CodeActionResponse)
async def review(payload: CodeRequest, user: CurrentUser, db: DbSession) -> CodeActionResponse:
    return await code_service.action(db, user, "review", payload)


@router.post("/refactor", response_model=CodeActionResponse)
async def refactor(payload: CodeRequest, user: CurrentUser, db: DbSession) -> CodeActionResponse:
    return await code_service.action(db, user, "refactor", payload)


@router.post("/debug", response_model=CodeActionResponse)
async def debug(payload: CodeRequest, user: CurrentUser, db: DbSession) -> CodeActionResponse:
    return await code_service.action(db, user, "debug", payload)


@router.post("/explain", response_model=CodeActionResponse)
async def explain(payload: CodeRequest, user: CurrentUser, db: DbSession) -> CodeActionResponse:
    return await code_service.action(db, user, "explain", payload)
