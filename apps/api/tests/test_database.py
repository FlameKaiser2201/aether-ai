"""Database URL normalization tests (no live PostgreSQL connection)."""

from __future__ import annotations

from sqlalchemy.engine import URL

from app.core.database import _prepare_engine


def test_supabase_sslmode_is_translated_to_asyncpg_ssl() -> None:
    url, kwargs = _prepare_engine(
        "postgresql+asyncpg://postgres.ref:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
        "?sslmode=require"
    )

    assert isinstance(url, URL)
    assert "sslmode" not in url.query
    assert kwargs["connect_args"] == {"ssl": "require"}
    assert url.password == "p@ss"
    assert url.host == "aws-0-us-east-1.pooler.supabase.com"


def test_boolean_ssl_query_is_normalized() -> None:
    url, kwargs = _prepare_engine(
        "postgresql+asyncpg://user:pass@db.example.com:5432/aether?ssl=true"
    )

    assert "ssl" not in url.query
    assert kwargs["connect_args"] == {"ssl": "require"}


def test_sqlite_keeps_check_same_thread() -> None:
    url, kwargs = _prepare_engine("sqlite+aiosqlite:///:memory:")

    assert url == "sqlite+aiosqlite:///:memory:"
    assert kwargs == {"connect_args": {"check_same_thread": False}}
