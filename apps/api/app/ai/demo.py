"""Offline demo provider.

Keeps every screen usable with zero API keys while being explicit that this is
not a frontier model. It never fabricates actions or citations.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import AsyncIterator

from app.ai.base import ChatProvider
from app.ai.types import (
    ChatMessage,
    GenerationConfig,
    ProviderCapabilities,
    StreamChunk,
    Usage,
)
from app.core.config import settings
from app.utils.text import estimate_tokens


class DemoProvider(ChatProvider):
    id = "demo"
    label = "AETHER demo engine"
    demo = True
    models = {"fast": "demo-local", "balanced": "demo-local", "reasoning": "demo-local", "coding": "demo-local"}
    capabilities = ProviderCapabilities(streaming=True)

    async def stream(
        self,
        messages: list[ChatMessage],
        model: str,
        config: GenerationConfig,
    ) -> AsyncIterator[StreamChunk]:
        user_text = next(
            (m.text() for m in reversed(messages) if m.role == "user"), ""
        )
        system_text = next((m.text() for m in messages if m.role == "system"), "")
        response = self._compose(user_text, system_text)
        words = re.findall(r"\S+\s*", response)
        for word in words:
            yield StreamChunk(text=word)
            if settings.environment != "test":
                await asyncio.sleep(0.004)
        yield StreamChunk(
            text="",
            finish_reason="stop",
            usage=Usage(
                input_tokens=sum(estimate_tokens(m.text()) for m in messages),
                output_tokens=estimate_tokens(response),
            ),
        )

    def _compose(self, user_text: str, system_text: str) -> str:
        text = user_text.strip()
        lowered = text.lower()
        if not text:
            return "I'm listening. Ask me to explain a topic, debug code, plan revision, or practice an interview."
        if any(g in lowered for g in ("hello", "hi ", "hey", "namaste")) and len(text) < 40:
            return (
                "Hey — I'm AETHER. I can help you study, write and review code, prepare for interviews, "
                "analyze documents, and research topics with sources. This instance is in zero-key demo mode, "
                "so responses come from a small local engine; add a provider key in the environment to unlock "
                "the full models. What would you like to work on?"
            )
        if "demo mode" in system_text.lower() or "zero-key" in system_text.lower():
            notice = (
                "> Demo engine active. Add `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or enable Ollama "
                "for full model quality.\n\n"
            )
        else:
            notice = ""

        if "return only valid json" in lowered:
            return self._json_demo(text)

        if self._is_file_analysis_prompt(lowered, text):
            return self._file_analysis_demo(text)

        action = self._code_action(text)
        if action:
            return notice + self._code_action_demo(action, text)

        if any(word in lowered for word in ("code", "debug", "refactor", "python", "javascript", "typescript", "java", "sql", "react")):
            return notice + self._coding_chat_demo(text)
        if "interview" in lowered:
            return notice + (
                "Let's practice. A strong first answer uses **Situation → Action → Result** and ends with a measurable outcome.\n\n"
                "**Sample question:** Tell me about a time you had to learn a new technology under a deadline. "
                "What was the situation, what did you do, and what changed because of it?\n\n"
                "Answer in 4–6 sentences. In the full version I will score clarity, structure, depth, and communication."
            )
        if any(word in lowered for word in ("quiz", "flashcard", "notes", "exam", "revise", "study", "summary")):
            topic = re.sub(r"(?i)^(make|create|generate|give me|please).*?(notes|quiz|flashcards|summary).*?(on|about|for)?\s*", "", text).strip() or "your topic"
            return notice + (
                f"**Study starter — {topic[:120]}**\n\n"
                "**1. Core idea** — Write the topic in one sentence you could explain to a friend.\n"
                "**2. Why it matters** — List three real problems this concept solves.\n"
                "**3. Key parts** — Break it into 3–5 components and define each.\n"
                "**4. Worked example** — Solve one small example step by step.\n"
                "**5. Check yourself** — What changes if the main assumption is removed?\n\n"
                "In the full version I generate structured notes, quizzes with answer keys, spaced-repetition flashcards, and a dated revision plan."
            )
        if any(word in lowered for word in ("search", "latest", "news", "research", "source")):
            return notice + (
                "Research mode needs a live model plus a search key (Tavily, Brave, Serper, SearXNG) or the "
                "DuckDuckGo fallback. Once configured, I fetch pages safely, cite every claim with numbered "
                "sources, and clearly separate evidence from interpretation."
            )
        return notice + (
            "Here is a structured first pass.\n\n"
            f"**Your request:** {text[:400]}\n\n"
            "**Plan**\n"
            "1. Clarify the goal and success criteria.\n"
            "2. Break the work into the smallest useful steps.\n"
            "3. Produce the artifact — notes, code, a plan, or a draft.\n"
            "4. Check edge cases and verify the result.\n\n"
            "**What I need from you:** the context, constraints, and desired format. "
            "For full reasoning, memory, file analysis, and voice replies, configure an AI provider."
        )

    @staticmethod
    def _is_file_analysis_prompt(lowered: str, text: str) -> bool:
        return (
            "<untrusted source=" in text
            and "filename:" in lowered
            and any(
                marker in lowered
                for marker in ("summarize the document", "analyze the document", "extract the requested")
            )
        )

    @staticmethod
    def _code_action(text: str) -> str | None:
        markers = {
            "review": "review the code below",
            "refactor": "refactor the code for clarity",
            "debug": "diagnose the code and any error below",
            "explain": "explain the code to the requested audience",
        }
        lowered = text.lower()
        return next((action for action, marker in markers.items() if marker in lowered), None)

    @staticmethod
    def _extract_code(text: str) -> tuple[str, str]:
        match = re.search(r"```([A-Za-z0-9_+#.-]*)[ \t]*\r?\n(.*?)```", text, re.DOTALL)
        if not match:
            return "text", ""
        language = (match.group(1) or "text").lower()
        return language, match.group(2).rstrip()

    def _code_action_demo(self, action: str, prompt: str) -> str:
        language, code = self._extract_code(prompt)
        if not code:
            return (
                "I could not find a fenced code block in this request. Paste the code between triple "
                "backticks and include the language tag so the mechanical checks can run."
            )
        from app.ai.code_guard import validate_code

        report = validate_code(language, code)
        lines = code.splitlines()
        functions = re.findall(
            r"(?m)^\s*(?:async\s+)?(?:def|function|func|fn|fun)\s+([A-Za-z_]\w*)", code
        )
        classes = re.findall(r"(?m)^\s*(?:public\s+|private\s+)?class\s+([A-Za-z_]\w*)", code)
        imports = re.findall(r"(?m)^\s*(?:import|from|require|using)\b[^\n]*", code)

        header = (
            f"### Demo {action} pass\n\n"
            f"Language: **{report.language}** · {len(lines)} lines · "
            f"{len(functions)} function(s) · {len(classes)} class(es)\n\n"
        )
        if report.issues:
            issue_lines = [
                f"- **{issue.severity.upper()}** line {issue.line or '?'} "
                f"(`{issue.rule}`): {issue.message}"
                + (f" _{issue.suggestion}_" if issue.suggestion else "")
                for issue in report.issues[:12]
            ]
            findings = "#### Mechanical findings\n" + "\n".join(issue_lines) + "\n\n"
        else:
            findings = (
                "#### Mechanical findings\n"
                "No syntax, delimiter, placeholder or security-rule violations were detected. "
                "This is not a guarantee of semantic correctness.\n\n"
            )

        if action == "explain":
            flow = []
            if imports:
                flow.append("**Dependencies:** " + ", ".join(item.strip()[:80] for item in imports[:6]))
            if functions:
                flow.append("**Functions:** " + ", ".join(f"`{name}`" for name in functions[:12]))
            if classes:
                flow.append("**Classes:** " + ", ".join(f"`{name}`" for name in classes[:12]))
            if not flow:
                flow.append("**Structure:** top-level statements only; no named functions or classes detected.")
            return (
                header
                + findings
                + "#### Walkthrough\n"
                + "\n".join(f"- {item}" for item in flow)
                + "\n- Review each branch for empty input, malformed input, and error paths.\n\n"
                "The demo engine can describe structure mechanically. Add a provider key for a semantic, "
                "line-by-line explanation of intent and edge cases."
            )

        if action == "review":
            checklist = [
                "Input validation: reject empty, oversized, and malformed values at the boundary.",
                "Error handling: every external call needs a timeout and a defined failure path.",
                "Security: no string-built SQL, shell interpolation, hardcoded secrets, or unsafe HTML sinks.",
                "Tests: cover the happy path, boundary values, and at least one failure mode.",
            ]
            return (
                header
                + findings
                + "#### Review checklist\n"
                + "\n".join(f"- {item}" for item in checklist)
                + "\n\nAdd a provider key for a line-level review with a concrete patch."
            )

        if action == "refactor":
            cleaned = "\n".join(line.rstrip() for line in lines).strip() + "\n"
            return (
                header
                + findings
                + "#### Safe formatting pass\n"
                "```" + (language if language != "text" else "") + "\n" + cleaned + "```\n\n"
                "Only whitespace normalization was applied. The demo engine will not invent a semantic "
                "refactor without a model provider. Add a provider key for a behavior-preserving rewrite."
            )

        return (
            header
            + findings
            + "#### Debug next steps\n"
            "- Reproduce with the smallest input that fails.\n"
            "- Read the first traceback line and the deepest frame in your own code.\n"
            "- Add a regression test that fails before the fix and passes after it.\n\n"
            "Add a provider key for a root-cause diagnosis and a corrected full function."
        )

    def _coding_chat_demo(self, prompt: str) -> str:
        lowered = prompt.lower()
        snippets: dict[str, tuple[str, str]] = {
            "fibonacci": (
                "python",
                "def fibonacci(n: int) -> int:\n"
                "    if n < 0:\n"
                "        raise ValueError(\"n must be non-negative\")\n"
                "    a, b = 0, 1\n"
                "    for _ in range(n):\n"
                "        a, b = b, a + b\n"
                "    return a\n\n\n"
                "if __name__ == \"__main__\":\n"
                "    print(fibonacci(10))  # 55\n",
            ),
            "factorial": (
                "python",
                "def factorial(n: int) -> int:\n"
                "    if n < 0:\n"
                "        raise ValueError(\"n must be non-negative\")\n"
                "    result = 1\n"
                "    for value in range(2, n + 1):\n"
                "        result *= value\n"
                "    return result\n\n\n"
                "if __name__ == \"__main__\":\n"
                "    print(factorial(5))  # 120\n",
            ),
            "palindrome": (
                "python",
                "def is_palindrome(value: str) -> bool:\n"
                "    cleaned = [char.lower() for char in value if char.isalnum()]\n"
                "    return cleaned == cleaned[::-1]\n\n\n"
                "if __name__ == \"__main__\":\n"
                "    print(is_palindrome(\"A man, a plan, a canal: Panama\"))  # True\n",
            ),
            "reverse": (
                "python",
                "def reverse_text(value: str) -> str:\n"
                "    return value[::-1]\n\n\n"
                "if __name__ == \"__main__\":\n"
                "    print(reverse_text(\"AETHER\"))  # REHTEA\n",
            ),
            "fizzbuzz": (
                "python",
                "def fizzbuzz(limit: int) -> list[str]:\n"
                "    if limit < 0:\n"
                "        raise ValueError(\"limit must be non-negative\")\n"
                "    result: list[str] = []\n"
                "    for number in range(1, limit + 1):\n"
                "        if number % 15 == 0:\n"
                "            result.append(\"FizzBuzz\")\n"
                "        elif number % 3 == 0:\n"
                "            result.append(\"Fizz\")\n"
                "        elif number % 5 == 0:\n"
                "            result.append(\"Buzz\")\n"
                "        else:\n"
                "            result.append(str(number))\n"
                "    return result\n",
            ),
        }
        for keyword, (language, code) in snippets.items():
            if keyword in lowered:
                return (
                    f"Here is a working demo implementation. The zero-key engine selected a known pattern "
                    f"for **{keyword}**; review it and add tests for your exact constraints.\n\n"
                    f"```{language}\n{code}```\n\n"
                    "A full model adds requirement analysis, alternative designs, and project-specific tests."
                )
        return (
            "I can take this coding task, but the demo engine cannot generate trustworthy arbitrary code. "
            "Here is a safe way to proceed:\n\n"
            "1. Describe the expected input, output, and constraints.\n"
            "2. Paste the failing code and the exact error.\n"
            "3. Add a provider key so I can generate, validate, and repair the implementation with the coding model.\n\n"
            "AETHER's full pipeline performs syntax, security, edge-case, and performance checks before returning code."
        )

    def _file_analysis_demo(self, prompt: str) -> str:
        filename_match = re.search(r"(?im)^filename:\s*(.+)$", prompt)
        filename = filename_match.group(1).strip()[:120] if filename_match else "document"
        untrusted = re.search(
            r'<untrusted source="[^"]*">(.*?)</untrusted>', prompt, re.DOTALL
        )
        body = untrusted.group(1) if untrusted else prompt
        body = re.sub(
            r"(?is)^.*?use it only as evidence\.\s*", "", body, count=1
        ).strip()
        body = body.replace("&lt;untrusted", "<untrusted").replace("&lt;/untrusted", "</untrusted")
        if not body:
            return "No readable text was found in this document."
        sentences = [
            item.strip()
            for item in re.split(r"(?<=[.!?])\s+|\n+", body)
            if len(item.strip()) > 24
        ]
        words = re.findall(r"\b[\w'-]+\b", body)
        numbers = re.findall(r"\b\d+(?:[.,]\d+)?%?\b", body)[:8]
        bullets = sentences[:6] or [body[:300]]
        summary = " ".join(sentences[:3])[:700] or body[:500]
        if "desired json shape" in prompt.lower() or "extract" in prompt.lower():
            return json.dumps(
                {
                    "filename": filename,
                    "summary": summary,
                    "key_points": bullets,
                    "numbers": numbers,
                    "word_count": len(words),
                    "demo": True,
                    "note": "Extractive demo output. Configure a model provider for schema-aware extraction.",
                },
                ensure_ascii=False,
            )
        number_line = f"- **Numbers detected:** {', '.join(numbers)}\n" if numbers else ""
        return (
            f"### Document summary — {filename}\n\n"
            f"**TL;DR:** {summary}\n\n"
            f"**Key points**\n" + "\n".join(f"- {item[:280]}" for item in bullets) + "\n\n"
            f"**Document stats:** {len(words)} words · {len(body.splitlines())} lines\n"
            f"{number_line}\n"
            "> Extractive demo analysis. Add a model provider for deeper synthesis, risk analysis, "
            "and schema-aware extraction."
        )

    def _json_demo(self, prompt: str) -> str:
        topic_match = re.search(r'(?i)topic:\s*"([^"]+)"', prompt)
        topic = topic_match.group(1)[:120] if topic_match else "the requested topic"
        count_match = re.search(r"(?i)(?:item count|generate)\D{0,4}(\d+)", prompt)
        try:
            count = max(1, min(10, int(count_match.group(1)) if count_match else 5))
        except ValueError:
            count = 5

        if '"memories"' in prompt:
            return json.dumps({"memories": []})
        if '"daily_plan"' in prompt:
            days = [
                {
                    "day": day,
                    "focus": f"{topic}: core concept {day}",
                    "activities": [
                        "Read one focused section and write a 5-line summary",
                        "Do 10 active-recall questions",
                        "Review yesterday's mistakes",
                    ],
                    "checkpoint": "Explain the concept aloud without notes",
                }
                for day in range(1, min(count, 7) + 1)
            ]
            return json.dumps(
                {
                    "title": f"{topic} — revision plan",
                    "total_days": len(days),
                    "daily_plan": days,
                    "milestones": ["Complete a timed practice set", "Teach the topic to someone else"],
                    "demo": True,
                }
            )
        if '"cards"' in prompt:
            return json.dumps(
                {
                    "title": f"{topic} — flashcards",
                    "cards": [
                        {
                            "front": f"Core idea #{index + 1} of {topic}",
                            "back": "Write the definition, one example, and one common mistake. Add a provider key for a complete card.",
                            "tags": ["demo", topic[:30]],
                        }
                        for index in range(count)
                    ],
                    "demo": True,
                }
            )
        if '"correct_index"' in prompt:
            return json.dumps(
                {
                    "title": f"{topic} — practice quiz",
                    "questions": [
                        {
                            "question": f"Which option best describes an important aspect of {topic}?",
                            "options": [
                                "A core principle with a concrete example",
                                "An unrelated process",
                                "A common misconception",
                                "None of the above",
                            ],
                            "correct_index": 0,
                            "explanation": "Demo mode generates a template. Add a model provider for topic-specific questions.",
                            "difficulty": "medium",
                        }
                        for _ in range(count)
                    ],
                    "demo": True,
                }
            )
        if '"answer_guide"' in prompt:
            return json.dumps(
                {
                    "questions": [
                        {
                            "question": f"Walk me through how you would approach {topic}.",
                            "category": "technical",
                            "difficulty": "medium",
                            "hint": "State assumptions, approach, trade-offs, and verification.",
                            "answer_guide": "Requirements, design, edge cases, validation, and measurable outcome.",
                        }
                        for _ in range(count)
                    ],
                    "demo": True,
                }
            )
        if '"marks"' in prompt:
            return json.dumps(
                {
                    "questions": [
                        {
                            "question": f"Explain the main idea of {topic} and give one example.",
                            "difficulty": "medium",
                            "marks": 5,
                            "answer": "A correct answer defines the concept, gives a concrete example, and notes one limitation.",
                            "topic": topic,
                        }
                        for _ in range(count)
                    ],
                    "demo": True,
                }
            )
        if '"rubric"' in prompt:
            return json.dumps(
                {
                    "score": 6,
                    "rubric": {"correctness": 6, "depth": 5, "clarity": 7, "communication": 7},
                    "strengths": ["The answer addresses the question directly."],
                    "improvements": ["Add a specific example and measurable result."],
                    "model_answer": "Structure the answer with context, action, result, and reflection.",
                    "demo": True,
                }
            )
        if '"overall"' in prompt:
            return json.dumps(
                {
                    "overall": "You completed the demo interview. Configure a reasoning model for a detailed assessment.",
                    "strengths": ["Completed every question"],
                    "gaps": ["Specificity and measurable outcomes"],
                    "next_steps": ["Re-practice the weakest answer with STAR structure"],
                    "demo": True,
                }
            )
        if '"sections"' in prompt:
            return json.dumps(
                {
                    "title": topic,
                    "overview": f"A structured starting point for {topic}. Demo mode is active.",
                    "sections": [
                        {"heading": "Core idea", "content": f"Define {topic} in one sentence.", "key_points": ["Definition", "Purpose"]},
                        {"heading": "How it works", "content": "Break the mechanism into 3–5 ordered steps.", "key_points": ["Inputs", "Process", "Outputs"]},
                        {"heading": "Worked example", "content": "Apply the concept to a small concrete case.", "key_points": ["Assumptions", "Steps", "Result"]},
                    ],
                    "key_terms": [{"term": topic, "definition": "Add a model provider for a precise definition."}],
                    "common_mistakes": ["Memorizing without testing recall"],
                    "practice": ["Explain it aloud", "Solve one timed question"],
                    "demo": True,
                }
            )
        if '"tldr"' in prompt:
            return json.dumps(
                {
                    "tldr": f"A demo summary of {topic}. Add a model provider for source-specific analysis.",
                    "key_points": ["Define the concept", "Identify the mechanism", "Test with an example"],
                    "details": "Demo mode returns a structured template rather than a full synthesis.",
                    "check_yourself": ["Can you explain it without notes?"],
                    "demo": True,
                }
            )
        return json.dumps({"result": "Demo mode could not build this artifact. Configure a model provider.", "demo": True})
