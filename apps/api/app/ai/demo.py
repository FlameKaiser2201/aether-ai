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

GREETING_RE = re.compile(
    r"(?i)^(hi|hello|hey|yo|namaste|good (morning|afternoon|evening))[\s!.,]*$"
)

DEMO_KNOWLEDGE: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"(?i)\b(?:artificial intelligence|machine intelligence)\b|\bai\b"),
        "AI—artificial intelligence—is the field of building systems that perform tasks that normally "
        "require human intelligence: understanding language, recognizing patterns, reasoning, and making "
        "decisions. Modern AI is mostly machine learning, where models learn from data instead of following "
        "hand-written rules. The current wave is dominated by large neural networks, especially transformers "
        "for language and diffusion models for images. AI is strongest on pattern-heavy tasks and weakest on "
        "guaranteeing truth, so verification and human oversight matter.",
    ),
    (
        re.compile(r"(?i)\boperating systems?\b"),
        "An operating system is the software layer that manages a computer's hardware and provides services "
        "to applications. It schedules CPU time, allocates memory, manages files and devices, enforces "
        "permissions, and handles interrupts and I/O. The core is the kernel; user programs interact with it "
        "through system calls. Common designs include monolithic kernels such as Linux, microkernels, and "
        "hybrid kernels such as Windows and macOS. The main trade-offs are performance, isolation, and complexity.",
    ),
    (
        re.compile(r"(?i)\bmachine learning\b"),
        "Machine learning is a branch of AI where a system learns patterns from data instead of following "
        "explicit rules. Supervised learning maps labeled inputs to outputs, unsupervised learning finds "
        "structure in unlabeled data, and reinforcement learning improves through reward and penalty. "
        "Generalization to unseen data is the goal; overfitting, data quality, and distribution shift are the "
        "main failure modes.",
    ),
    (
        re.compile(r"(?i)\bpython\b"),
        "Python is a high-level, dynamically typed programming language known for readable syntax and a large "
        "standard library. It is widely used for web backends, data analysis, machine learning, automation, and "
        "scripting. CPython compiles to bytecode and runs on a virtual machine; performance-critical paths often "
        "move to native extensions or separate services. Its main trade-offs are execution speed and packaging "
        "complexity, not expressiveness.",
    ),
]


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
        response = self._compose(user_text)
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

    def _compose(self, user_text: str) -> str:
        text = user_text.strip()
        lowered = text.lower()
        if not text:
            return (
                "I'm listening. Ask me to explain a topic, debug code, generate study material, "
                "or practice an interview."
            )
        if GREETING_RE.match(text):
            return (
                "Hey — I'm AETHER. I can help you study, write and review code, prepare for interviews, "
                "analyze documents, and research topics. This instance is in zero-key demo mode, so I'm "
                "running a small local engine; add a provider key for full model quality. What are you working on?"
            )

        if "return only valid json" in lowered:
            return self._json_demo(text)

        if self._is_file_analysis_prompt(lowered, text):
            return self._file_analysis_demo(text)

        action = self._code_action(text)
        if action:
            return self._code_action_demo(action, text)

        knowledge = self._knowledge_answer(lowered)
        if knowledge and lowered.startswith(("tell me about", "what is", "what are", "introduce ")):
            return knowledge

        if any(
            word in lowered
            for word in (
                "code", "debug", "refactor", "python", "javascript", "typescript",
                "java", "sql", "react", "discord bot",
            )
        ):
            return self._coding_chat_demo(text)
        if "interview" in lowered:
            return (
                "**Practice question:** Tell me about a time you had to learn a new technology under a deadline. "
                "What was the situation, what did you do, and what changed because of it?\n\n"
                "Answer in 4–6 sentences using Situation → Action → Result. In the full version I score clarity, "
                "structure, depth, and communication."
            )

        if knowledge and not self._is_study_artifact(lowered):
            return knowledge
        if self._is_study_artifact(lowered):
            return self._study_demo(text)
        if knowledge:
            return knowledge

        if any(word in lowered for word in ("search", "latest", "news", "research", "source")):
            return (
                "Live research needs a search provider (Tavily, Brave, Serper, or SearXNG) and a model "
                "provider. Without them I can't verify current sources, so I won't invent citations. "
                "Add a search key and ask again; I'll fetch the pages and cite each material claim."
            )

        return (
            f"I can help with “{text[:160]}”, but this instance is running the zero-key demo engine, so I "
            "can't produce a reliable answer to arbitrary prompts yet. Add one provider key "
            "(DEEPSEEK_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY) and ask again. "
            "I can still generate study sets, review pasted code, analyze documents, manage tasks and "
            "memory, and handle browser voice right now."
        )

    @staticmethod
    def _is_study_artifact(lowered: str) -> bool:
        return any(
            marker in lowered
            for marker in (
                "quiz", "flashcard", "notes", "exam", "revise", "revision",
                "study", "important question", "practice question", "summary", "tips",
            )
        )

    @staticmethod
    def _knowledge_answer(lowered: str) -> str | None:
        return next(
            (answer for pattern, answer in DEMO_KNOWLEDGE if pattern.search(lowered)),
            None,
        )

    @staticmethod
    def _extract_topic(text: str) -> str:
        cleaned = re.sub(
            r"(?i)^(please\s+)?(?:make|create|generate|give me|write|prepare|explain|tell me about)\s+",
            "",
            text,
        )
        cleaned = re.sub(
            r"(?i)\b(?:important|practice|exam|study)\s+questions?|\bquestions?|\bquiz|"
            r"\bflashcards?|\bnotes?|\bsummary|\brevision plan|\bstudy plan|\btips?|\bexam\b",
            " ",
            cleaned,
        )
        cleaned = re.sub(r"(?i)\b(?:for|on|about|of|my|simply|please|briefly)\b", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,:;-")
        return cleaned[:120] or "the topic"

    def _study_demo(self, text: str) -> str:
        topic = self._extract_topic(text)
        lowered = text.lower()
        if "tip" in lowered:
            return (
                "**Three study techniques that work**\n\n"
                "1. **Active recall** — close the notes and retrieve the answer from memory. "
                "The effort of retrieval is what builds durable memory.\n"
                "2. **Spaced repetition** — review at increasing intervals (for example 1 day, 3 days, "
                "7 days, then 21 days) instead of rereading everything the night before.\n"
                "3. **Interleaving** — mix related problem types in one session so you learn to choose "
                "the right method, not just repeat the last one."
            )
        if "question" in lowered or "exam" in lowered or "quiz" in lowered:
            return self._study_questions(topic, lowered)
        if "flashcard" in lowered:
            return self._study_flashcards(topic)
        return self._study_notes(topic)

    @staticmethod
    def _study_questions(topic: str, lowered: str) -> str:
        if "operating system" in lowered or topic.lower() in {"operating systems", "os"}:
            title = "Important operating systems questions"
            questions = [
                "Explain the difference between a process and a thread.",
                "What is virtual memory, and how does a page fault work?",
                "Compare paging and segmentation.",
                "What are the four necessary conditions for deadlock, and how can each be prevented?",
                "Compare FCFS, SJF, and round-robin CPU scheduling with examples.",
                "What is thrashing? How can an operating system detect and reduce it?",
                "Explain inter-process communication. Compare pipes, message queues, and shared memory.",
                "What happens during a context switch, and why is it expensive?",
                "Compare monolithic, microkernel, and hybrid kernel architectures.",
                "How do mutexes, semaphores, and condition variables differ? Give a use case for each.",
            ]
        else:
            title = f"Important questions — {topic}"
            questions = [
                f"Define {topic} in one clear sentence.",
                f"Explain how {topic} works, step by step.",
                f"Give a concrete example of {topic} in practice.",
                f"Compare {topic} with the closest alternative or related concept.",
                f"What are the main components of {topic}, and what does each do?",
                f"What assumptions does {topic} rely on, and what happens when they fail?",
                f"Describe a common mistake people make with {topic} and how to avoid it.",
                f"How would you test or verify that {topic} is working correctly?",
                f"What is the cost of using {topic}, and how would you reduce it?",
                f"Apply {topic} to a small real-world scenario and explain the result.",
            ]
        numbered = "\n".join(f"{index}. {question}" for index, question in enumerate(questions, 1))
        return f"**{title}**\n\n{numbered}"

    @staticmethod
    def _study_flashcards(topic: str) -> str:
        cards = [
            (f"What is {topic}?", f"Define {topic} in one sentence, then name one thing it is not."),
            (f"Why does {topic} matter?", f"Name a real problem that {topic} solves."),
            (f"How does {topic} work?", "Describe the main steps or components in order."),
            (f"Give an example of {topic}.", "Use a small, concrete case and state the result."),
            (f"What is a common mistake with {topic}?", "Name the mistake and the correction."),
            (f"How would you verify {topic}?", "Describe one test or check that would catch a failure."),
        ]
        body = "\n\n".join(
            f"**{index}. {front}**\n{back}" for index, (front, back) in enumerate(cards, 1)
        )
        return f"**Flashcards — {topic}**\n\n{body}"

    @staticmethod
    def _study_notes(topic: str) -> str:
        return (
            f"**{topic} — notes**\n\n"
            f"**Definition:** Write {topic} in one sentence you could explain to a friend.\n\n"
            "**Why it matters:** Name three real problems it solves.\n\n"
            "**How it works:** Break it into three to five components and define each.\n\n"
            "**Worked example:** Solve one small case and state the result.\n\n"
            "**Common mistakes:** List two mistakes and the correction for each.\n\n"
            "**Check yourself:** Explain the topic aloud without notes, then test one edge case."
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
            "discord bot": (
                "python",
                "import os\n\n"
                "import discord\n"
                "from discord.ext import commands\n\n"
                "intents = discord.Intents.default()\n"
                "intents.message_content = True\n"
                "bot = commands.Bot(command_prefix=\"!\", intents=intents)\n\n"
                "@bot.event\n"
                "async def on_ready() -> None:\n"
                "    print(f\"Logged in as {bot.user}\")\n\n"
                "@bot.command()\n"
                "async def ping(ctx: commands.Context) -> None:\n"
                "    await ctx.reply(f\"Pong! {round(bot.latency * 1000)} ms\")\n\n"
                "def main() -> None:\n"
                "    token = os.environ.get(\"DISCORD_TOKEN\")\n"
                "    if not token:\n"
                "        raise SystemExit(\"Set DISCORD_TOKEN\")\n"
                "    bot.run(token)\n\n"
                "if __name__ == \"__main__\":\n"
                "    main()\n",
            ),
        }
        for keyword, (language, code) in snippets.items():
            if keyword in lowered:
                note = (
                    "Enable the **Message Content** intent in the Discord developer portal and set "
                    "`DISCORD_TOKEN` before running it.\n\n"
                    if keyword == "discord bot"
                    else ""
                )
                return (
                    f"Here's a working demo implementation for **{keyword}**. {note}"
                    f"```{language}\n{code}```\n\n"
                    "A full model adds requirement analysis, alternative designs, and project-specific tests."
                )
        return (
            "The zero-key demo engine can't generate reliable arbitrary code, so I won't fake it. "
            "Paste the failing code and the exact error, or add a provider key, and I'll produce the "
            "implementation, tests, and a root-cause fix. I can also generate known demo snippets for "
            "Fibonacci, factorial, palindrome, reverse, FizzBuzz, and a minimal Discord bot."
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
