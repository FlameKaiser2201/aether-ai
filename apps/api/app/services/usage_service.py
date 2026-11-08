from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.types import Usage
from app.models import UsageLog


def log_usage(
    db: AsyncSession,
    *,
    user_id: str,
    provider: str,
    model: str,
    task_type: str,
    usage: Usage,
    latency_ms: int,
) -> None:
    db.add(
        UsageLog(
            user_id=user_id,
            provider=provider,
            model=model,
            task_type=task_type,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            latency_ms=latency_ms,
        )
    )
