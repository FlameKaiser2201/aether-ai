from __future__ import annotations

from app.ai.demo import DemoProvider
from app.ai.prompts import build_system_prompt
from app.schemas.settings import UserPreferences


def _prompt(**preferences: str) -> str:
    return build_system_prompt(
        preferences=UserPreferences(**preferences),
        mode="general",
        user_name="Test",
        memories_text="",
        web_enabled=False,
    )


def test_system_prompt_is_execution_first():
    prompt = _prompt()
    assert "Do the task." in prompt
    assert "Never open with" in prompt
    assert "Do not create a plan unless the user asks" in prompt
    assert "Do not expose hidden chain-of-thought" in prompt


def test_system_prompt_respects_response_style():
    assert "fewest words" in _prompt(response_style="concise")
    assert "expand only where the task needs it" in _prompt(response_style="balanced")
    assert "Be thorough and specific" in _prompt(response_style="detailed")


def test_system_prompt_prioritises_natural_conversation_and_continuity():
    prompt = _prompt()
    assert "## Natural conversation" in prompt
    assert "Never use canned openers" in prompt
    assert "## Continuity and memory" in prompt
    assert "Do not repeat information you already gave" in prompt
    assert "Resolve references such as" in prompt
    assert "## Current information" in prompt
    assert "Never invent freshness or a source" in prompt


def test_demo_fallback_answers_without_a_plan():
    response = DemoProvider()._compose("What is the capital of France?")
    assert "structured first pass" not in response.lower()
    assert "**plan**" not in response.lower()
    assert "zero-key" not in response.lower()
    assert "live model provider" in response
    assert "OPENROUTER_API_KEY" in response


def test_demo_answers_operating_system_questions_directly():
    response = DemoProvider()._compose("Give me important questions for operating systems")
    assert "process and a thread" in response
    assert "deadlock" in response
    assert "Study starter" not in response


def test_demo_explains_common_topics():
    response = DemoProvider()._compose("Tell me about AI")
    assert "artificial intelligence" in response.lower()
    assert "machine learning" in response.lower()


def test_demo_generates_a_discord_bot():
    response = DemoProvider()._compose("Write a Discord bot.")
    assert "commands.Bot" in response
    assert "DISCORD_TOKEN" in response
    assert "**Plan**" not in response


def test_demo_study_tips_are_direct():
    response = DemoProvider()._compose("Give me three study tips")
    assert "Active recall" in response
    assert "Spaced repetition" in response
    assert "Interleaving" in response
