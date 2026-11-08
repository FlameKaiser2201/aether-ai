"""Account, password and token lifecycle."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    needs_rehash,
    sanitize_text,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import OAuthLoginRequest, TokenPair, UserOut
from app.schemas.settings import UserPreferences


def default_preferences() -> dict[str, Any]:
    return UserPreferences().model_dump()


def get_preferences(user: User) -> UserPreferences:
    try:
        return UserPreferences(**{**default_preferences(), **(user.preferences or {})})
    except Exception:
        return UserPreferences()


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        auth_provider=user.auth_provider,
        email_verified=user.email_verified,
        role=user.role,
        preferences=get_preferences(user).model_dump(),
        created_at=user.created_at,
    )


async def _issue_pair(
    db: AsyncSession,
    user: User,
    *,
    user_agent: str | None,
    ip_address: str | None,
) -> TokenPair:
    access_token, expires_in = create_access_token(user.id, user.email, user.role)
    refresh_token, refresh_expires = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires,
            user_agent=(user_agent or "")[:512] or None,
            ip_address=(ip_address or "")[:64] or None,
        )
    )
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=user_out(user),
    )


async def register(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    name: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    normalized = email.strip().lower()
    existing = await db.scalar(select(User).where(User.email == normalized))
    if existing:
        raise AppError("email_in_use", "An account with this email already exists", 409)
    user = User(
        email=normalized,
        password_hash=hash_password(password),
        name=sanitize_text(name, max_length=80).strip(),
        auth_provider="local",
        preferences=default_preferences(),
    )
    db.add(user)
    await db.flush()
    pair = await _issue_pair(db, user, user_agent=user_agent, ip_address=ip_address)
    await db.commit()
    await db.refresh(user)
    pair.user = user_out(user)
    return pair


async def authenticate(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    normalized = email.strip().lower()
    user = await db.scalar(select(User).where(User.email == normalized))
    if user is None or not verify_password(password, user.password_hash):
        raise AppError("invalid_credentials", "Email or password is incorrect", 401)
    if not user.is_active:
        raise AppError("account_disabled", "This account is disabled", 403)
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = datetime.now(UTC)
    pair = await _issue_pair(db, user, user_agent=user_agent, ip_address=ip_address)
    await db.commit()
    await db.refresh(user)
    pair.user = user_out(user)
    return pair


async def oauth_login(
    db: AsyncSession,
    payload: OAuthLoginRequest,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    email = payload.email.strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            password_hash=None,
            name=sanitize_text(payload.name, max_length=80).strip() or "AETHER user",
            avatar_url=payload.avatar_url,
            auth_provider=payload.provider[:32],
            email_verified=True,
            preferences=default_preferences(),
        )
        db.add(user)
        await db.flush()
    else:
        if not user.is_active:
            raise AppError("account_disabled", "This account is disabled", 403)
        user.email_verified = True
        if payload.avatar_url and not user.avatar_url:
            user.avatar_url = payload.avatar_url
    user.last_login_at = datetime.now(UTC)
    pair = await _issue_pair(db, user, user_agent=user_agent, ip_address=ip_address)
    await db.commit()
    await db.refresh(user)
    pair.user = user_out(user)
    return pair


async def refresh_tokens(
    db: AsyncSession,
    raw_token: str,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    try:
        payload = decode_token(raw_token, "refresh")
    except TokenError as exc:
        raise AppError("invalid_refresh", "Session expired. Please sign in again.", 401) from exc

    token_hash = hash_token(raw_token)
    stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored is None or stored.user_id != payload.get("sub"):
        raise AppError("invalid_refresh", "Session is no longer valid", 401)

    now = datetime.now(UTC)
    expires_at = stored.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if stored.revoked_at is not None:
        # A rotated token was replayed. Revoke every session for the account.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.commit()
        raise AppError("token_reuse", "Session reuse detected. Please sign in again.", 401)
    if expires_at <= now:
        raise AppError("invalid_refresh", "Session expired. Please sign in again.", 401)

    user = await db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise AppError("invalid_refresh", "Account is not available", 401)

    pair = await _issue_pair(db, user, user_agent=user_agent, ip_address=ip_address)
    stored.revoked_at = now
    stored.replaced_by = hash_token(pair.refresh_token)
    await db.commit()
    return pair


async def logout(db: AsyncSession, raw_token: str) -> None:
    stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if stored and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        await db.commit()


async def revoke_all(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def change_password(
    db: AsyncSession, user: User, current_password: str, new_password: str
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AppError("invalid_credentials", "Current password is incorrect", 400)
    user.password_hash = hash_password(new_password)
    await revoke_all(db, user.id)
    await db.commit()


async def delete_account(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.commit()


async def cleanup_expired_tokens(db: AsyncSession) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=7)
    result = await db.execute(delete(RefreshToken).where(RefreshToken.expires_at < cutoff))
    await db.commit()
    return int(result.rowcount or 0)


async def seed_demo_user(db: AsyncSession) -> None:
    if not settings.seed_demo:
        return
    existing = await db.scalar(select(User).where(User.email == settings.demo_email.lower()))
    if existing:
        return
    db.add(
        User(
            email=settings.demo_email.lower(),
            password_hash=hash_password(settings.demo_password),
            name="AETHER Demo",
            email_verified=True,
            preferences=default_preferences(),
        )
    )
    await db.commit()
