from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.study import StudyGenerateRequest, StudySetList, StudySetOut
from app.services import study_service

router = APIRouter(prefix="/study", tags=["study"])


@router.post("/generate", response_model=StudySetOut, status_code=201)
async def generate(payload: StudyGenerateRequest, user: CurrentUser, db: DbSession) -> StudySetOut:
    study_set = await study_service.generate(db, user, payload)
    return StudySetOut.model_validate(study_set)


@router.get("/sets", response_model=StudySetList)
async def list_sets(
    user: CurrentUser,
    db: DbSession,
    kind: str | None = Query(default=None, max_length=32),
) -> StudySetList:
    items = await study_service.list_sets(db, user.id, kind)
    return StudySetList(items=[StudySetOut.model_validate(item) for item in items], total=len(items))


@router.get("/sets/{set_id}", response_model=StudySetOut)
async def get_set(set_id: str, user: CurrentUser, db: DbSession) -> StudySetOut:
    return StudySetOut.model_validate(await study_service.get_set(db, user.id, set_id))


@router.delete("/sets/{set_id}", status_code=204)
async def delete_set(set_id: str, user: CurrentUser, db: DbSession) -> Response:
    await study_service.delete_set(db, user.id, set_id)
    return Response(status_code=204)
