from __future__ import annotations

from fastapi import APIRouter, File, Form, Response, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.files import AnalyzeRequest, AnalyzeResponse, FileList, FileOut
from app.services import file_service

router = APIRouter(prefix="/files", tags=["files"])


@router.post("", response_model=FileOut, status_code=201)
async def upload(
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
) -> FileOut:
    record = await file_service.upload_file(
        db, user_id=user.id, upload=file, conversation_id=conversation_id
    )
    return FileOut.model_validate(record)


@router.get("", response_model=FileList)
async def list_files(
    user: CurrentUser, db: DbSession, conversation_id: str | None = None
) -> FileList:
    items = await file_service.list_files(db, user.id, conversation_id)
    return FileList(items=[FileOut.model_validate(item) for item in items], total=len(items))


@router.get("/{file_id}", response_model=FileOut)
async def get_file(file_id: str, user: CurrentUser, db: DbSession) -> FileOut:
    record = await file_service.get_file(db, user.id, file_id)
    return FileOut.model_validate(record)


@router.get("/{file_id}/download")
async def download(file_id: str, user: CurrentUser, db: DbSession) -> StreamingResponse:
    data, content_type, filename = await file_service.download_file(db, user.id, file_id)
    return StreamingResponse(
        iter([data]),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{file_id}/analyze", response_model=AnalyzeResponse)
async def analyze(
    file_id: str, payload: AnalyzeRequest, user: CurrentUser, db: DbSession
) -> AnalyzeResponse:
    return await file_service.analyze_file(
        db, user_id=user.id, file_id=file_id, payload=payload
    )


@router.delete("/{file_id}", status_code=204)
async def delete_file(file_id: str, user: CurrentUser, db: DbSession) -> Response:
    await file_service.delete_file(db, user.id, file_id)
    return Response(status_code=204)
