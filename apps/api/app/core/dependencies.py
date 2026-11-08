"""Reusable FastAPI dependencies."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import TokenError, decode_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)
DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError("unauthorized", "Authentication required", 401)
    try:
        payload = decode_token(credentials.credentials, "access")
    except TokenError as exc:
        raise AppError("unauthorized", str(exc), 401) from exc
    user = await db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise AppError("unauthorized", "Account is not available", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_internal_secret(x_internal_secret: Annotated[str | None, Header()] = None) -> None:
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, settings.internal_api_secret):
        raise AppError("forbidden", "Internal endpoint", 403)


def pagination(
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> tuple[int, int]:
    return limit, offset


Pagination = Annotated[tuple[int, int], Depends(pagination)]


def client_meta(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent", "")[:512] or None
    ip = request.client.host if request.client else None
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            ip = forwarded.split(",")[0].strip()[:64]
    return user_agent, ip
