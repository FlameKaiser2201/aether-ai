"""Detects requests that require real-world actions the product cannot perform.

The guard is intentionally conservative: it targets imperative, first-person
requests, not questions like "how do I send an email in Python?".
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(slots=True)
class Limitation:
    code: str
    title: str
    explanation: str
    alternatives: list[str]


_PATTERNS: list[tuple[str, str, str, list[str]]] = [
    (
        "send_message",
        "Send email or messages",
        "AETHER has no connection to your email, SMS, WhatsApp or social accounts, so it cannot send anything on your behalf.",
        ["Draft the exact message here for you to copy", "Write a script or integration plan for your own account", "Create a task reminding you to send it"],
    ),
    (
        "phone_call",
        "Place phone calls",
        "AETHER runs in the browser and cannot place calls or join meetings.",
        ["Prepare a call script and objection notes", "Summarize talking points", "Draft a follow-up message"],
    ),
    (
        "purchase",
        "Buy, book or pay for things",
        "AETHER cannot complete purchases, bookings or payments, and it never asks for card details.",
        ["Compare options and produce a decision table", "Draft the booking details for you to submit", "Create a checklist for the transaction"],
    ),
    (
        "private_account",
        "Access private accounts or devices",
        "AETHER has no OAuth connection to your bank, inbox, calendar, cloud drive or device, and cannot read them.",
        ["Analyze a file or text you paste/upload", "Explain how to export the data safely", "Draft an API integration you can run"],
    ),
    (
        "device_control",
        "Control your device or home",
        "AETHER is a web app, not an OS agent. It cannot control apps, files, alarms, lights, doors or your computer.",
        ["Generate the command or script for you to run", "Explain the steps with safety notes", "Create a task in AETHER"],
    ),
    (
        "execute_code",
        "Execute code on your machine",
        "Generated code is never executed by AETHER. Running untrusted code automatically would be a serious security risk.",
        ["Provide the code plus exact run instructions", "Generate a Docker sandbox setup", "Write tests you can run locally"],
    ),
    (
        "publish",
        "Publish or post content",
        "AETHER cannot log into social platforms or publish content for you.",
        ["Draft and format the post", "Suggest a publishing checklist", "Write an API integration plan"],
    ),
    (
        "delete_account_data",
        "Delete account data for you",
        "Account and data deletion is intentionally a user-controlled action in Settings, not something the assistant can trigger.",
        ["Open Settings → Privacy to export or delete data", "List exactly what will be deleted", "Delete individual memories in the Memory page"],
    ),
]

_IMPERATIVE = re.compile(
    r"(?i)(?:^|(?<=[.!?]\s))(?:(?:can|could|would|will)\s+you|please|i\s+(?:want|need)\s+you\s+to|"
    r"go\s+ahead\s+and|help\s+me)\s+"
)
_ACTIONS = [
    (re.compile(r"(?i)\b(?:send|fire\s+off|deliver)\s+(?:an?\s+)?(?:email|e-mail|text|sms|whatsapp|message|dm)\b"), "send_message"),
    (re.compile(r"(?i)\b(?:make|place|start|join)\s+(?:a\s+)?(?:phone\s+)?(?:call|meeting)\b"), "phone_call"),
    (re.compile(r"(?i)\b(?:book|reserve|order|buy|purchase|pay)\b.{0,80}\b(?:flight|hotel|ticket|food|grocer|product|stock|crypto|bill|subscription)\b"), "purchase"),
    (re.compile(r"(?i)\b(?:access|open|read|check|log\s*in\s*to|sign\s*in\s*to)\s+(?:my|the)\s+(?:bank|email|gmail|inbox|drive|calendar|phone|computer|account|files\s+on\s+my)\b"), "private_account"),
    (re.compile(r"(?i)\b(?:control|turn\s+(?:on|off)|unlock|lock|reboot|shut\s+down|set)\s+(?:my|the)\s+(?:phone|computer|laptop|home|lights?|door|car|alarm|reminder)\b"), "device_control"),
    (re.compile(r"(?i)\b(?:run|execute)\s+(?:this|the|my)?\s*(?:code|script|command|program)\s+(?:on|in)\s+my\b"), "execute_code"),
    (re.compile(r"(?i)\b(?:post|tweet|publish|upload)\b.{0,40}\b(?:on|to)\s+(?:my|instagram|twitter|x|linkedin|facebook|youtube)\b"), "publish"),
    (re.compile(r"(?i)\b(?:delete|wipe|close)\s+(?:my|all)\s+(?:account|files|emails|messages)\b"), "delete_account_data"),
    (re.compile(r"(?i)\b(?:transfer|send)\s+(?:money|funds|payment)\b"), "purchase"),
]

_SECRET_RE = re.compile(
    r"(?i)\b(?:show|reveal|print|repeat|tell\s+me|what\s+is)\b.{0,60}\b(?:system\s+prompt|hidden\s+prompt|api\s*key|secret|access\s+token|environment\s+variables?)\b"
)
_INJECTION_RE = re.compile(r"(?i)ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions")


def check_request(message: str) -> Limitation | None:
    text = message.strip()
    if not text:
        return None

    if _SECRET_RE.search(text):
        return Limitation(
            code="secret_extraction",
            title="Internal details stay private",
            explanation="I can't reveal system instructions, credentials or environment secrets. That protects you and the service.",
            alternatives=[
                "Ask me to explain how I work at a conceptual level",
                "Ask about the public API or architecture documentation",
            ],
        )

    if _INJECTION_RE.search(text):
        return Limitation(
            code="prompt_injection",
            title="Instructions inside content are treated as data",
            explanation="I follow the system's safety and honesty rules; I won't override them because a message asks me to.",
            alternatives=["Tell me the actual task you want to accomplish", "Ask me to analyze text as untrusted data"],
        )

    imperative = bool(_IMPERATIVE.search(text)) or bool(
        re.match(
            r"(?i)^(send|email|call|book|order|buy|purchase|place|make|start|join|access|open|read|control|turn|run|execute|post|publish|delete|transfer)\b",
            text,
        )
    )
    if not imperative:
        return None

    for pattern, code in _ACTIONS:
        if pattern.search(text):
            for item in _PATTERNS:
                if item[0] == code:
                    return Limitation(
                        code=item[0],
                        title=item[1],
                        explanation=item[2],
                        alternatives=item[3],
                    )
    return None


def limitation_markdown(limitation: Limitation) -> str:
    alternatives = "\n".join(f"{index + 1}. {item}" for index, item in enumerate(limitation.alternatives))
    return (
        f"I can't do that directly, and I won't pretend I did.\n\n"
        f"**{limitation.title}** — {limitation.explanation}\n\n"
        f"**What I can do instead:**\n{alternatives}\n\n"
        "If you tell me which alternative you want, I'll do that part now."
    )
