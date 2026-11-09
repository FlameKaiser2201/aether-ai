"""Async SQLAlchemy engine, session factory and FastAPI dependency."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _prepare_engine(url: str) -> tuple[str | URL, dict]:
    """Build engine arguments, translating libpq SSL query parameters.

    Managed Postgres providers (Supabase, Neon, etc.) publish URLs such as
    ``postgresql://...?sslmode=require``. asyncpg accepts ``ssl=`` as a connect
    argument but not the libpq ``sslmode=`` keyword, so move it into
    ``connect_args`` and strip it from the URL.
    """
    if url.startswith("sqlite"):
        raw = url.split("///", 1)[-1]
        if raw and raw != ":memory:":
            Path(raw).parent.mkdir(parents=True, exist_ok=True)
        return url, {"connect_args": {"check_same_thread": False}}

    parsed = make_url(url)
    query = dict(parsed.query)
    connect_args: dict[str, object] = {}

    sslmode = query.pop("sslmode", None)
    if sslmode is not None:
        connect_args["ssl"] = sslmode
    ssl_value = query.pop("ssl", None)
    if ssl_value is not None:
        normalized = ssl_value.lower()
        if normalized in {"1", "true", "yes", "on"}:
            connect_args["ssl"] = "require"
        elif normalized in {"0", "false", "no", "off"}:
            connect_args["ssl"] = "disable"
        else:
            connect_args["ssl"] = ssl_value

    if query != dict(parsed.query):
        parsed = parsed.set(query=query)

    kwargs: dict = {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }
    if connect_args:
        kwargs["connect_args"] = connect_args
    return parsed, kwargs


_is_sqlite = settings.database_url.startswith("sqlite")
_engine_url, _engine_kwargs = _prepare_engine(settings.database_url)
if settings.environment == "test" and not _is_sqlite:
    _test_connect_args = _engine_kwargs.get("connect_args")
    _engine_kwargs = {"poolclass": NullPool}
    if _test_connect_args:
        _engine_kwargs["connect_args"] = _test_connect_args

engine = create_async_engine(_engine_url, echo=False, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


if _is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    from app.models import entities  # noqa: F401  (register metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_database() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def close_db() -> None:
    await engine.dispose()
