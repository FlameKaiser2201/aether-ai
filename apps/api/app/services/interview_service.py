"""Mock interview sessions, answer scoring and final reports."""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.interview_bank import fallback_questions, filter_questions
from app.ai.prompts import (
    interview_evaluation_prompt,
    interview_questions_prompt,
    interview_report_prompt,
)
from app.ai.registry import registry
from app.ai.types import ChatMessage, GenerationConfig
from app.core.errors import AppError
from app.models import InterviewSession, InterviewTurn, User
from app.schemas.interview import AnswerRequest, EvaluationOut, ReportOut, SessionCreate
from app.services.usage_service import log_usage
from app.utils.json_utils import parse_json_object

logger = logging.getLogger("aether.interview")


def _clamp(value: Any, default: float = 0.0) -> float:
    try:
        return max(0.0, min(10.0, float(value)))
    except (TypeError, ValueError):
        return default


async def _generate_questions(payload: SessionCreate) -> list[dict[str, Any]]:
    fallback = fallback_questions(
        role=payload.role,
        company=payload.company,
        interview_type=payload.type,
        difficulty=payload.difficulty,
        count=payload.question_count,
    )
    decision = registry.route(task_type="interview", tier="reasoning")
    try:
        result = await decision.provider.complete(
            [
                ChatMessage(
                    role="system",
                    content="You are a senior interviewer. Return only valid JSON.",
                ),
                ChatMessage(
                    role="user",
                    content=interview_questions_prompt(
                        role=payload.role,
                        company=payload.company,
                        interview_type=payload.type,
                        difficulty=payload.difficulty,
                        count=payload.question_count,
                    ),
                ),
            ],
            decision.model,
            GenerationConfig(temperature=0.5, max_tokens=2500),
        )
        parsed = parse_json_object(result.text, {"questions": []})
        questions = parsed.get("questions")
        if isinstance(questions, list) and len(questions) >= 1:
            normalized: list[dict[str, Any]] = []
            for index, item in enumerate(questions[: payload.question_count]):
                if not isinstance(item, dict) or not item.get("question"):
                    continue
                normalized.append(
                    {
                        "index": index,
                        "question": str(item.get("question"))[:2000],
                        "category": str(item.get("category", payload.type))[:40],
                        "difficulty": str(item.get("difficulty", payload.difficulty))[:20],
                        "hint": str(item.get("hint", ""))[:500],
                        "answer_guide": str(item.get("answer_guide", ""))[:2000],
                    }
                )
            if normalized:
                return normalized
    except Exception as exc:
        logger.warning("LLM question generation failed: %s", exc)
    return fallback


def _fallback_evaluation(answer: str) -> dict[str, Any]:
    words = len(re.findall(r"\w+", answer))
    base = min(7.5, 2.0 + words / 45)
    if words < 25:
        base = min(base, 3.5)
    return {
        "score": round(base, 1),
        "rubric": {
            "correctness": round(base, 1),
            "depth": round(max(0, base - 1), 1),
            "clarity": round(min(10, base + 0.5), 1),
            "communication": round(min(10, base + 0.5), 1),
        },
        "strengths": ["You provided a direct answer."] if words >= 20 else ["You answered the question."],
        "improvements": [
            "Add a concrete example with a measurable result.",
            "State the trade-offs or edge cases you considered.",
        ],
        "model_answer": "Use a structured answer: context, decision, action, result, and reflection.",
    }


async def start_session(db: AsyncSession, user: User, payload: SessionCreate) -> InterviewSession:
    questions = await _generate_questions(payload)
    session = InterviewSession(
        user_id=user.id,
        role=payload.role,
        company=payload.company,
        type=payload.type,
        difficulty=payload.difficulty,
        questions=questions,
        status="active",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def _owned(db: AsyncSession, user_id: str, session_id: str) -> InterviewSession:
    session = await db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user_id
        )
    )
    if session is None:
        raise AppError("not_found", "Interview session not found", 404)
    return session


async def answer(
    db: AsyncSession, user: User, session_id: str, payload: AnswerRequest
) -> EvaluationOut:
    session = await _owned(db, user.id, session_id)
    if session.status == "completed":
        raise AppError("session_completed", "This interview is already complete", 409)
    questions = session.questions or []
    if payload.question_index >= len(questions):
        raise AppError("invalid_question", "Question index is out of range", 422)
    question = questions[payload.question_index]

    decision = registry.route(task_type="interview", tier="reasoning")
    evaluation: dict[str, Any]
    try:
        result = await decision.provider.complete(
            [
                ChatMessage(role="system", content="You are a rigorous interview evaluator. Return strict JSON."),
                ChatMessage(
                    role="user",
                    content=interview_evaluation_prompt(
                        question=str(question.get("question", "")),
                        answer=payload.answer,
                        role=session.role,
                        company=session.company,
                        difficulty=session.difficulty,
                    ),
                ),
            ],
            decision.model,
            GenerationConfig(temperature=0.2, max_tokens=1800),
        )
        evaluation = parse_json_object(result.text, {})
        if "score" not in evaluation:
            evaluation = _fallback_evaluation(payload.answer)
        log_usage(
            db,
            user_id=user.id,
            provider=decision.provider_id,
            model=decision.model,
            task_type="interview_answer",
            usage=result.usage,
            latency_ms=0,
        )
    except Exception as exc:
        logger.warning("Interview evaluation failed: %s", exc)
        evaluation = _fallback_evaluation(payload.answer)

    score = _clamp(evaluation.get("score"))
    rubric = evaluation.get("rubric") or {}
    rubric = {key: _clamp(value) for key, value in rubric.items() if isinstance(key, str)}
    strengths = [str(item)[:500] for item in (evaluation.get("strengths") or [])][:5]
    improvements = [str(item)[:500] for item in (evaluation.get("improvements") or [])][:5]
    model_answer = str(evaluation.get("model_answer", ""))[:4000]

    existing = await db.scalar(
        select(InterviewTurn).where(
            InterviewTurn.session_id == session.id,
            InterviewTurn.question_index == payload.question_index,
        )
    )
    if existing:
        existing.answer = payload.answer
        existing.evaluation = evaluation
        existing.score = score
    else:
        db.add(
            InterviewTurn(
                session_id=session.id,
                user_id=user.id,
                question_index=payload.question_index,
                question=str(question.get("question", "")),
                answer=payload.answer,
                evaluation=evaluation,
                score=score,
            )
        )
    await db.flush()
    turns = list(
        await db.scalars(select(InterviewTurn).where(InterviewTurn.session_id == session.id))
    )
    if turns:
        session.score = round(sum(turn.score for turn in turns) / len(turns), 2)
    await db.commit()

    answered = {turn.question_index for turn in turns}
    next_question = next(
        (q for index, q in enumerate(questions) if index not in answered),
        None,
    )
    return EvaluationOut(
        question_index=payload.question_index,
        score=score,
        rubric=rubric,
        strengths=strengths,
        improvements=improvements,
        model_answer=model_answer,
        next_question=next_question,
    )


async def complete(db: AsyncSession, user: User, session_id: str) -> ReportOut:
    session = await _owned(db, user.id, session_id)
    turns = list(
        await db.scalars(
            select(InterviewTurn)
            .where(InterviewTurn.session_id == session.id)
            .order_by(InterviewTurn.question_index)
        )
    )
    if not turns:
        raise AppError("no_answers", "Answer at least one question before finishing", 422)
    average = round(sum(turn.score for turn in turns) / len(turns), 2)
    feedback: dict[str, Any]
    decision = registry.route(task_type="interview", tier="reasoning")
    try:
        result = await decision.provider.complete(
            [
                ChatMessage(role="system", content="You write specific, actionable interview reports. Return strict JSON."),
                ChatMessage(
                    role="user",
                    content=interview_report_prompt(
                        role=session.role,
                        company=session.company,
                        turns=[
                            {
                                "question": turn.question,
                                "answer": turn.answer,
                                "score": turn.score,
                            }
                            for turn in turns
                        ],
                    ),
                ),
            ],
            decision.model,
            GenerationConfig(temperature=0.3, max_tokens=1600),
        )
        feedback = parse_json_object(result.text, {})
        log_usage(
            db,
            user_id=user.id,
            provider=decision.provider_id,
            model=decision.model,
            task_type="interview_report",
            usage=result.usage,
            latency_ms=0,
        )
    except Exception as exc:
        logger.warning("Interview report generation failed: %s", exc)
        feedback = {}
    overall = str(
        feedback.get("overall")
        or (
            f"You completed {len(turns)} questions with an average score of {average}/10. "
            "Strong structure matters as much as raw knowledge."
        )
    )[:4000]
    strengths = [str(item)[:500] for item in (feedback.get("strengths") or [])][:8]
    gaps = [str(item)[:500] for item in (feedback.get("gaps") or [])][:8]
    next_steps = [str(item)[:500] for item in (feedback.get("next_steps") or [])][:8]
    if not strengths:
        strengths = ["You completed the session and produced answers under time pressure."]
    if not gaps:
        gaps = ["Add more concrete metrics and trade-offs to each answer."]
    if not next_steps:
        next_steps = ["Re-practice the lowest-scoring question and record yourself answering it."]

    session.score = average
    session.status = "completed"
    session.completed_at = datetime.now(UTC)
    session.feedback = {
        "overall": overall,
        "strengths": strengths,
        "gaps": gaps,
        "next_steps": next_steps,
    }
    await db.commit()
    return ReportOut(
        session_id=session.id,
        score=average,
        overall=overall,
        strengths=strengths,
        gaps=gaps,
        next_steps=next_steps,
        per_question=[
            {
                "index": turn.question_index,
                "question": turn.question,
                "score": turn.score,
                "feedback": turn.evaluation,
            }
            for turn in turns
        ],
    )


async def list_sessions(db: AsyncSession, user_id: str) -> list[InterviewSession]:
    return list(
        await db.scalars(
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.created_at.desc())
            .limit(100)
        )
    )


async def get_session(db: AsyncSession, user_id: str, session_id: str) -> InterviewSession:
    return await _owned(db, user_id, session_id)


async def delete_session(db: AsyncSession, user_id: str, session_id: str) -> None:
    session = await _owned(db, user_id, session_id)
    await db.delete(session)
    await db.commit()


def question_bank(
    *, role: str | None, company: str | None, category: str | None, difficulty: str | None
) -> list[dict[str, Any]]:
    return filter_questions(
        role=role, company=company, category=category, difficulty=difficulty, limit=50
    )
