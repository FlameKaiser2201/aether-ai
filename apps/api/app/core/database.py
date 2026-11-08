"""Async SQLAlchemy engine, session factory and FastAPI dependency."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _prepare_sqlite(url: str) -> dict:
    if url.startswith("sqlite"):
        raw = url.split("///", 1)[-1]
        if raw and raw != ":memory:":
            Path(raw).parent.mkdir(parents=True, exist_ok=True)
        return {"connect_args": {"check_same_thread": False}}
    return {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }


_is_sqlite = settings.database_url.startswith("sqlite")
_engine_kwargs = _prepare_sqlite(settings.database_url)
if settings.environment == "test" and not _is_sqlite:
    _engine_kwargs = {"poolclass": NullPool}

engine = create_async_engine(settings.database_url, echo=False, **_engine_kwargs)
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
