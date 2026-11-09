"""Alembic environment for AETHER's async SQLAlchemy models."""

from __future__ import annotations

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import settings  # noqa: E402
from app.core.database import Base, _prepare_engine  # noqa: E402
from app.models import entities  # noqa: E402,F401  (register all models)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_url(url: str) -> str:
    return (
        url.replace("+aiosqlite", "")
        .replace("+asyncpg", "+psycopg")
        .replace("postgresql+psycopg", "postgresql")
    )


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_url(settings.database_url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_sync_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    url, engine_kwargs = _prepare_engine(settings.database_url)
    # Alembic uses NullPool, which does not accept the app's pool sizing
    # arguments. The SSL translation in _prepare_engine is still required:
    # asyncpg.connect() accepts ``ssl`` but not libpq's ``sslmode`` keyword.
    for key in ("pool_size", "max_overflow", "pool_pre_ping", "pool_recycle"):
        engine_kwargs.pop(key, None)
    connectable = create_async_engine(url, poolclass=pool.NullPool, **engine_kwargs)
    async with connectable.connect() as connection:
        await connection.run_sync(_run_sync_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
