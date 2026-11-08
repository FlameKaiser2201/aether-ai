from fastapi import APIRouter

from app.api import (
    auth,
    chat,
    code,
    conversations,
    files,
    health,
    interview,
    memories,
    search,
    settings,
    study,
    tasks,
    voice,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(conversations.router)
api_router.include_router(memories.router)
api_router.include_router(tasks.router)
api_router.include_router(files.router)
api_router.include_router(study.router)
api_router.include_router(interview.router)
api_router.include_router(code.router)
api_router.include_router(search.router)
api_router.include_router(settings.router)
api_router.include_router(voice.router)
