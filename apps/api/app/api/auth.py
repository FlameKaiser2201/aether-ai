from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.dependencies import CurrentUser, DbSession, client_meta, require_internal_secret
from app.core.errors import AppError
from app.core.redis_client import cache
from app.core.security import sanitize_text
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    OAuthLoginRequest,
    PasswordChange,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
    UserUpdate,
)
from app.services import auth_service

logger = logging.getLogger("aether.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


async def _check_login_throttle(email: str, ip: str | None) -> None:
    key = f"aether:loginfail:{email.lower()}:{ip or 'unknown'}"
    count = await cache.incr_window(key, 60 * 15)
    if count > 8:
        raise AppError(
            "login_throttled",
            "Too many failed sign-in attempts. Try again in a few minutes.",
            429,
            headers={"Retry-After": "900"},
        )


async def _clear_login_throttle(email: str, ip: str | None) -> None:
    await cache.delete(f"aether:loginfail:{email.lower()}:{ip or 'unknown'}")


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, db: DbSession) -> TokenPair:
    user_agent, ip = client_meta(request)
    return await auth_service.register(
        db,
        email=str(payload.email),
        password=payload.password,
        name=payload.name,
        user_agent=user_agent,
        ip_address=ip,
    )


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenPair:
    user_agent, ip = client_meta(request)
    await _check_login_throttle(str(payload.email), ip)
    try:
        pair = await auth_service.authenticate(
            db,
            email=str(payload.email),
            password=payload.password,
            user_agent=user_agent,
            ip_address=ip,
        )
    except AppError:
        logger.info("Failed login attempt")
        raise
    await _clear_login_throttle(str(payload.email), ip)
    return pair


@router.post("/oauth", response_model=TokenPair, dependencies=[Depends(require_internal_secret)])
async def oauth(payload: OAuthLoginRequest, request: Request, db: DbSession) -> TokenPair:
    user_agent, ip = client_meta(request)
    return await auth_service.oauth_login(db, payload, user_agent=user_agent, ip_address=ip)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, request: Request, db: DbSession) -> TokenPair:
    user_agent, ip = client_meta(request)
    return await auth_service.refresh_tokens(
        db, payload.refresh_token, user_agent=user_agent, ip_address=ip
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: DbSession) -> Response:
    await auth_service.logout(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return auth_service.user_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UserUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    if payload.name is not None:
        name = sanitize_text(payload.name, max_length=80).strip()
        if not name:
            raise AppError("validation_error", "Name cannot be blank", 422)
        user.name = name
    if payload.avatar_url is not None:
        if payload.avatar_url and not payload.avatar_url.startswith(("https://", "http://")):
            raise AppError("validation_error", "Avatar URL must be HTTP(S)", 422)
        user.avatar_url = payload.avatar_url
    await db.commit()
    await db.refresh(user)
    return auth_service.user_out(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> Response:
    await auth_service.change_password(db, user, payload.current_password, payload.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, db: DbSession) -> Response:
    await auth_service.delete_account(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
