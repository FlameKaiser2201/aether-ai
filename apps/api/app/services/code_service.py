"""Code validation, review, refactor, debugging and explanation."""

from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.code_guard import (
    aggregate_ok,
    code_repair_prompt,
    detect_language,
    extract_code_blocks,
    validate_code,
    validate_text,
)
from app.ai.prompts import code_action_prompt
from app.ai.registry import registry
from app.ai.types import ChatMessage, GenerationConfig
from app.models import User
from app.schemas.code import CodeActionResponse, CodeRequest, ValidationReport
from app.services.usage_service import log_usage

logger = logging.getLogger("aether.code")

CodeAction = Literal["review", "refactor", "debug", "explain"]


def validate(payload: CodeRequest) -> ValidationReport:
    return validate_code(payload.language, payload.code)


async def action(
    db: AsyncSession, user: User, action_name: CodeAction, payload: CodeRequest
) -> CodeActionResponse:
    language = detect_language(payload.code, payload.language)
    decision = registry.route(task_type="coding", tier="coding")
    input_report = validate_code(language, payload.code)
    validation_context = (
        "Mechanical validation of the input:\n"
        + "\n".join(
            f"- [{issue.severity}] line {issue.line}: {issue.message}"
            for issue in input_report.issues[:15]
        )
    )
    prompt = code_action_prompt(
        action=action_name, language=language, code=payload.code, goal=payload.goal
    )
    result = await decision.provider.complete(
        [
            ChatMessage(
                role="system",
                content=(
                    "You are AETHER's principal engineer. Be precise and security-minded. "
                    "Return complete, runnable code with no placeholders. Never invent APIs."
                ),
            ),
            ChatMessage(role="user", content=f"{prompt}\n\n{validation_context}"),
        ],
        decision.model,
        GenerationConfig(temperature=0.2, max_tokens=4000),
    )
    text = result.text
    output_code = None
    blocks = extract_code_blocks(text)
    if blocks:
        output_code = blocks[0].code
        report = validate_code(blocks[0].language, output_code)
        if not report.ok and not decision.demo:
            try:
                repair = await decision.provider.complete(
                    [
                        ChatMessage(
                            role="system",
                            content="Fix the code exactly. Return complete code with no placeholders.",
                        ),
                        ChatMessage(
                            role="user",
                            content=code_repair_prompt(
                                language=blocks[0].language,
                                code=output_code,
                                issues=[issue.model_dump() for issue in report.issues],
                            ),
                        ),
                    ],
                    decision.model,
                    GenerationConfig(temperature=0.1, max_tokens=4000),
                )
                repaired_blocks = extract_code_blocks(repair.text)
                if repaired_blocks:
                    repaired_report = validate_code(
                        repaired_blocks[0].language, repaired_blocks[0].code
                    )
                    if aggregate_ok(validate_text(repair.text)) or len(
                        repaired_report.issues
                    ) < len(report.issues):
                        text = repair.text
                        output_code = repaired_blocks[0].code
                        report = repaired_report
            except Exception as exc:
                logger.warning("Code action repair failed: %s", exc)
    else:
        report = input_report

    log_usage(
        db,
        user_id=user.id,
        provider=decision.provider_id,
        model=decision.model,
        task_type=f"code_{action_name}",
        usage=result.usage,
        latency_ms=0,
    )
    await db.commit()
    return CodeActionResponse(
        result=text,
        code=output_code,
        validation=report,
        provider=decision.provider_id,
        model=decision.model,
    )
