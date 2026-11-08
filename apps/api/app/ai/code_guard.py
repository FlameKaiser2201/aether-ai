"""Mechanical code validation: syntax, placeholders, security, structure.

Tree-sitter parsers are used when the optional language pack is installed; the
delimiter/string scanner and security rules always run. Reports are explicit
about what was actually checked.
"""

from __future__ import annotations

import ast
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import sqlparse

from app.schemas.code import ValidationIssue, ValidationReport

logger = logging.getLogger("aether.code_guard")

try:  # optional, installed in the Docker image for full multi-language parsing
    from tree_sitter_language_pack import get_parser as _get_parser  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    _get_parser = None

ALIASES = {
    "py": "python", "python3": "python",
    "js": "javascript", "node": "javascript", "nodejs": "javascript", "mjs": "javascript",
    "ts": "typescript", "tsx": "typescript",
    "c++": "cpp", "cxx": "cpp", "cc": "cpp",
    "c#": "csharp", "cs": "csharp", "dotnet": "csharp",
    "golang": "go", "rs": "rust",
    "rb": "ruby", "kt": "kotlin",
    "postgres": "sql", "postgresql": "sql", "mysql": "sql", "sqlite": "sql",
    "sh": "bash", "shell": "bash",
    "yml": "yaml",
}

LANGUAGE_LABELS = {
    "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
    "java": "Java", "c": "C", "cpp": "C++", "csharp": "C#", "go": "Go",
    "rust": "Rust", "php": "PHP", "sql": "SQL", "dart": "Dart",
    "kotlin": "Kotlin", "swift": "Swift", "ruby": "Ruby", "json": "JSON",
    "bash": "Bash", "yaml": "YAML", "html": "HTML", "css": "CSS", "text": "Text",
}

TS_LANGUAGES = {
    "python": ["python"], "javascript": ["javascript"], "typescript": ["typescript", "tsx"],
    "java": ["java"], "c": ["c"], "cpp": ["cpp"], "csharp": ["c_sharp", "csharp"],
    "go": ["go"], "rust": ["rust"], "php": ["php"], "sql": ["sql"], "dart": ["dart"],
    "kotlin": ["kotlin"], "swift": ["swift"], "ruby": ["ruby"], "json": ["json"],
    "bash": ["bash"], "yaml": ["yaml"], "html": ["html"], "css": ["css"],
}

SUPPORTED = set(LANGUAGE_LABELS)

FENCE_RE = re.compile(r"```([A-Za-z0-9_+#.-]*)[^\n]*\n(.*?)```", re.DOTALL)


@dataclass(slots=True)
class CodeBlock:
    language: str
    code: str
    index: int


def normalize_language(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().lower().lstrip(".")
    cleaned = ALIASES.get(cleaned, cleaned)
    return cleaned if cleaned in SUPPORTED else None


def detect_language(code: str, hint: str | None = None) -> str:
    hinted = normalize_language(hint)
    if hinted:
        return hinted
    text = code.strip()
    lowered = text.lower()
    if lowered.startswith("{") or lowered.startswith("["):
        try:
            json.loads(text)
            return "json"
        except json.JSONDecodeError:
            pass
    if re.search(r"(?m)^\s*(?:def|class)\s+\w+|^\s*(?:from\s+\w+\s+)?import\s+\w+", text):
        return "python"
    if re.search(r"(?i)\bselect\b.+\bfrom\b", text) and ";" in text:
        return "sql"
    if "<?php" in lowered:
        return "php"
    if re.search(r"(?m)^\s*package\s+main\b|^\s*func\s+\w+\(", text):
        return "go"
    if re.search(r"(?m)^\s*(?:pub\s+)?fn\s+\w+\s*\(", text):
        return "rust"
    if re.search(r"(?i)\busing\s+system\b|namespace\s+\w+\s*\{", text):
        return "csharp"
    if re.search(r"(?m)^\s*public\s+(?:static\s+)?(?:void|class|interface)\b", text):
        return "java"
    if re.search(r"#include\s*<", text):
        return "cpp" if re.search(r"#include\s*<(?:iostream|vector|string|algorithm|memory)>", text) else "c"
    if re.search(r"(?m)^\s*fun\s+\w+\s*\(", text):
        return "kotlin"
    if re.search(r"(?i)\bimport\s+SwiftUI\b|^\s*func\s+\w+", text, re.MULTILINE):
        return "swift"
    if re.search(r"(?m)^\s*def\s+\w+.*\n(?:.*\n)*?\s*end\s*$", text) or "require '" in text:
        return "ruby"
    if re.search(r"(?i)\b(?:const|let|var)\s+\w+\s*=|=>|console\.log", text):
        if re.search(r"(?i)\binterface\s+\w+|:\s*(?:string|number|boolean|void)\b", text):
            return "typescript"
        return "javascript"
    if re.search(r"(?i)\b(?:void|int|char|float|double)\s+main\s*\(", text):
        return "c"
    if re.search(r"(?i)\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b", text):
        return "sql"
    return "text"


def extract_code_blocks(text: str) -> list[CodeBlock]:
    blocks: list[CodeBlock] = []
    for index, match in enumerate(FENCE_RE.finditer(text)):
        raw_language = match.group(1) or ""
        code = match.group(2).rstrip()
        if not code.strip():
            continue
        blocks.append(
            CodeBlock(
                language=detect_language(code, raw_language),
                code=code,
                index=index,
            )
        )
    return blocks


def _line_of(code: str, position: int) -> int:
    return code.count("\n", 0, position) + 1


def _issue(
    severity: str, rule: str, message: str, *, line: int | None = None, suggestion: str = ""
) -> ValidationIssue:
    return ValidationIssue(
        severity=severity,  # type: ignore[arg-type]
        rule=rule,
        message=message,
        line=line,
        suggestion=suggestion,
    )


def _tree_sitter_issues(language: str, code: str) -> tuple[list[ValidationIssue], bool]:
    if _get_parser is None:
        return [], False
    for candidate in TS_LANGUAGES.get(language, []):
        try:
            parser = _get_parser(candidate)
            tree = parser.parse(code.encode("utf-8"))
        except Exception as exc:
            logger.debug("Tree-sitter parser %s unavailable: %s", candidate, exc)
            continue
        if not tree.root_node.has_error:
            return [], True
        issues: list[ValidationIssue] = []
        stack = [tree.root_node]
        while stack and len(issues) < 10:
            node = stack.pop()
            if node.is_error or node.is_missing:
                issues.append(
                    _issue(
                        "error",
                        "syntax_error",
                        f"Parser found a syntax error near '{node.type}'",
                        line=node.start_point[0] + 1,
                        suggestion="Check the surrounding expression for a missing token or bracket.",
                    )
                )
            elif node.has_error:
                stack.extend(reversed(node.children))
        return issues, True
    return [], False


def _scan_structure(language: str, code: str) -> tuple[list[ValidationIssue], int]:
    line_comments = {
        "python": ["#"], "ruby": ["#"], "bash": ["#"], "php": ["//", "#"],
        "javascript": ["//"], "typescript": ["//"], "java": ["//"], "c": ["//"],
        "cpp": ["//"], "csharp": ["//"], "go": ["//"], "rust": ["//"], "dart": ["//"],
        "kotlin": ["//"], "swift": ["//"], "sql": ["--"], "json": [],
    }.get(language, ["//"])
    block_comments = (
        [("/*", "*/")]
        if language not in {"python", "ruby", "bash", "sql", "json"}
        else ([("/*", "*/")] if language == "sql" else [])
    )
    quote_chars = {"'", '"'} | ({"`"} if language in {"javascript", "typescript", "go", "sql"} else set())
    triple = language == "python"

    issues: list[ValidationIssue] = []
    stack: list[tuple[str, int]] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    opens = set(pairs.values())
    max_depth = 0
    i = 0
    line = 1
    length = len(code)
    while i < length:
        char = code[i]
        if char == "\n":
            line += 1
            i += 1
            continue
        matched_comment = next((token for token in line_comments if code.startswith(token, i)), None)
        if matched_comment:
            newline = code.find("\n", i)
            i = length if newline == -1 else newline
            continue
        matched_block = next(((start, end) for start, end in block_comments if code.startswith(start, i)), None)
        if matched_block:
            start, end = matched_block
            close = code.find(end, i + len(start))
            if close == -1:
                issues.append(_issue("error", "unterminated_comment", "Block comment is not closed", line=line))
                return issues, max_depth
            line += code.count("\n", i, close)
            i = close + len(end)
            continue
        if triple and code.startswith(('"""', "'''"), i):
            token = code[i : i + 3]
            close = code.find(token, i + 3)
            if close == -1:
                issues.append(_issue("error", "unterminated_string", "Triple-quoted string is not closed", line=line))
                return issues, max_depth
            line += code.count("\n", i, close)
            i = close + 3
            continue
        if char in quote_chars:
            quote = char
            i += 1
            while i < length:
                if code[i] == "\\":
                    i += 2
                    continue
                if code[i] == quote:
                    i += 1
                    break
                if code[i] == "\n":
                    line += 1
                    if language not in {"javascript", "typescript", "go", "sql"}:
                        issues.append(_issue("error", "unterminated_string", "String is not closed before end of line", line=line))
                        break
                i += 1
            continue
        if char in opens:
            stack.append((char, line))
            max_depth = max(max_depth, len(stack))
        elif char in pairs:
            if not stack:
                issues.append(_issue("error", "unmatched_bracket", f"Unexpected '{char}'", line=line))
            elif stack[-1][0] != pairs[char]:
                expected = stack[-1][0]
                issues.append(
                    _issue(
                        "error", "mismatched_bracket",
                        f"'{char}' closes '{expected}' from line {stack[-1][1]}",
                        line=line,
                    )
                )
                stack.pop()
            else:
                stack.pop()
        i += 1
    for opener, opener_line in stack:
        issues.append(
            _issue("error", "unclosed_bracket", f"'{opener}' opened on line {opener_line} is never closed", line=opener_line)
        )
    return issues, max_depth


SECURITY_RULES: list[dict[str, Any]] = [
    {
        "rule": "hardcoded_secret", "severity": "error", "languages": None,
        "pattern": r"(?i)\b(api[_-]?key|secret|access[_-]?token|password)\b\s*[:=]\s*['\"][A-Za-z0-9_\-]{10,}['\"]",
        "message": "Possible hardcoded credential.",
        "suggestion": "Load secrets from environment variables or a secret manager.",
    },
    {
        "rule": "dynamic_execution", "severity": "error", "languages": {"python", "javascript", "typescript", "php", "ruby"},
        "pattern": r"\b(?:eval|exec)\s*\(",
        "message": "Dynamic code execution is dangerous with untrusted input.",
        "suggestion": "Use a parser or an allowlisted dispatch table instead.",
    },
    {
        "rule": "shell_execution", "severity": "error", "languages": {"python"},
        "pattern": r"(?:subprocess\.[a-z_]+\([^)]*shell\s*=\s*True|os\.system\s*\()",
        "message": "Shell execution with interpolated input can lead to command injection.",
        "suggestion": "Use an argument list with subprocess.run(..., shell=False) and validate input.",
    },
    {
        "rule": "unsafe_deserialization", "severity": "error", "languages": {"python"},
        "pattern": r"(?:pickle\.loads?\s*\(|yaml\.load\s*\((?![^)]*Loader))",
        "message": "Unsafe deserialization can execute arbitrary code.",
        "suggestion": "Use json, or yaml.safe_load, or a signed format.",
    },
    {
        "rule": "tls_verification_disabled", "severity": "error", "languages": {"python"},
        "pattern": r"verify\s*=\s*False",
        "message": "TLS certificate verification is disabled.",
        "suggestion": "Keep verification enabled and configure a trusted CA bundle.",
    },
    {
        "rule": "sql_string_building", "severity": "error", "languages": {"python", "javascript", "typescript", "java", "csharp", "php"},
        "pattern": r"(?i)(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]{0,200}(?:\+\s*\w|f['\"]|\$\{|\+\s*['\"]|\.format\s*\()",
        "message": "SQL appears to be built with string interpolation.",
        "suggestion": "Use parameterized queries or an ORM.",
    },
    {
        "rule": "unsafe_dom", "severity": "error", "languages": {"javascript", "typescript"},
        "pattern": r"(?:dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\()",
        "message": "Unsafe HTML sink can introduce XSS.",
        "suggestion": "Render text nodes or sanitize with a vetted library.",
    },
    {
        "rule": "unsafe_c_buffer", "severity": "warning", "languages": {"c", "cpp"},
        "pattern": r"\b(?:gets|strcpy|strcat|sprintf)\s*\(",
        "message": "Unbounded C string function.",
        "suggestion": "Use fgets, strlcpy, snprintf, or a bounded container.",
    },
    {
        "rule": "runtime_exec", "severity": "warning", "languages": {"java"},
        "pattern": r"(?:Runtime\.getRuntime\(\)\.exec|ObjectInputStream)",
        "message": "Risky process/deserialization API.",
        "suggestion": "Use ProcessBuilder with an allowlist and avoid native deserialization.",
    },
    {
        "rule": "php_dangerous_function", "severity": "error", "languages": {"php"},
        "pattern": r"\b(?:system|exec|shell_exec|passthru|unserialize)\s*\(",
        "message": "Dangerous PHP function.",
        "suggestion": "Use escapeshellarg + a fixed command, or safe JSON deserialization.",
    },
    {
        "rule": "weak_crypto", "severity": "warning", "languages": None,
        "pattern": r"(?i)\b(?:md5|sha1)\s*\(",
        "message": "MD5/SHA-1 are not suitable for security-sensitive hashing.",
        "suggestion": "Use SHA-256+, Argon2id or bcrypt for passwords.",
    },
    {
        "rule": "permissive_cors", "severity": "warning", "languages": None,
        "pattern": r"(?i)(?:allow_origins\s*=\s*\[\s*['\"]\*['\"]|Access-Control-Allow-Origin['\"]?\s*[:,]\s*['\"]\*)",
        "message": "Permissive CORS policy.",
        "suggestion": "Allow only trusted origins and avoid credentials with wildcards.",
    },
    {
        "rule": "debug_enabled", "severity": "info", "languages": {"python"},
        "pattern": r"\bdebug\s*=\s*True\b",
        "message": "Debug mode may expose sensitive information.",
        "suggestion": "Disable debug in production.",
    },
    {
        "rule": "unsafe_rust", "severity": "info", "languages": {"rust"},
        "pattern": r"\bunsafe\s*\{",
        "message": "Unsafe block requires justification.",
        "suggestion": "Document invariants and isolate the unsafe boundary.",
    },
]

PLACEHOLDER_RULES: list[tuple[str, str, str]] = [
    (r"\bTODO\b|\bFIXME\b|\bXXX\b", "warning", "Placeholder marker found; production code should not ship TODO/FIXME."),
    (r"(?i)your[_-]?(?:api[_-]?)?key|changeme|replace[_-]?me", "error", "Placeholder credential found."),
    (r"<YOUR_[A-Z_]+>", "error", "Template placeholder found."),
    (r"(?i)\b(?:lorem ipsum|implementation here|not implemented)\b", "warning", "Placeholder implementation text found."),
    (r"raise\s+NotImplementedError", "warning", "Function raises NotImplementedError."),
]


def _line_issues(code: str, patterns: list[tuple[str, str, str]]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for pattern, severity, message in patterns:
        for match in re.finditer(pattern, code, re.MULTILINE):
            issues.append(
                _issue(severity, "placeholder" if "placeholder" in message.lower() or "Placeholder" in message else "quality",
                       message, line=_line_of(code, match.start()))
            )
    return issues


def _security_issues(language: str, code: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for rule in SECURITY_RULES:
        languages = rule["languages"]
        if languages is not None and language not in languages:
            continue
        for match in re.finditer(rule["pattern"], code):
            issues.append(
                _issue(
                    rule["severity"],
                    rule["rule"],
                    rule["message"],
                    line=_line_of(code, match.start()),
                    suggestion=rule["suggestion"],
                )
            )
    return issues


def _logic_issues(language: str, code: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    checks = [
        ("bare_except", r"(?m)^\s*except\s*:", "warning", "Bare except hides failures.", "Catch specific exceptions."),
        ("mutable_default", r"def\s+\w+\([^)]*=\s*(?:\[|\{)", "warning", "Mutable default argument is shared between calls.", "Use None and create the value inside the function."),
        ("requests_without_timeout", r"requests\.(?:get|post|put|delete|patch)\s*\((?![^)]*timeout)", "warning", "HTTP call has no timeout.", "Set connect and read timeouts."),
        ("open_without_context", r"(?m)^\s*\w+\s*=\s*open\s*\(", "warning", "File opened without a context manager.", "Use 'with open(...) as f:'."),
        ("loose_equality", r"(?<![=!<>])==(?!=)", "info", "Loose equality may coerce types.", "Prefer === in JavaScript/TypeScript."),
        ("parse_without_guard", r"JSON\.parse\s*\(", "info", "JSON.parse throws on malformed input.", "Wrap in try/catch and validate the shape."),
        ("no_error_handling", r"\b(?:try|catch|except|Result<|if\s+err|rescue)\b", "info", "No visible error handling.", "Handle expected failure modes explicitly."),
    ]
    for rule, pattern, severity, message, suggestion in checks:
        if rule in {"bare_except", "mutable_default", "requests_without_timeout", "open_without_context"} and language != "python":
            continue
        if rule in {"loose_equality", "parse_without_guard"} and language not in {"javascript", "typescript"}:
            continue
        matches = list(re.finditer(pattern, code))
        if rule == "no_error_handling":
            if len(code.splitlines()) > 25 and not matches:
                issues.append(_issue("info", rule, message, suggestion=suggestion))
            continue
        for match in matches[:3]:
            issues.append(_issue(severity, rule, message, line=_line_of(code, match.start()), suggestion=suggestion))
    return issues


def _stats(language: str, code: str, max_depth: int) -> dict[str, Any]:
    lines = code.splitlines()
    return {
        "language": language,
        "lines": len(lines),
        "non_empty_lines": sum(1 for line in lines if line.strip()),
        "max_nesting_depth": max_depth,
        "functions": len(re.findall(r"(?m)^\s*(?:async\s+)?(?:def|function|func|fn|fun)\s+\w+|=>\s*\{", code)),
        "classes": len(re.findall(r"(?m)^\s*(?:public\s+|private\s+|abstract\s+)?class\s+\w+", code)),
    }


def validate_code(language: str | None, code: str) -> ValidationReport:
    language = detect_language(code, language)
    issues: list[ValidationIssue] = []
    checked: list[str] = ["security scan", "placeholder scan", "structure scan"]
    parsed = False

    if language in {"python", "json", "sql"}:
        if language == "python":
            try:
                ast.parse(code)
                checked.append("Python AST")
            except SyntaxError as exc:
                issues.append(
                    _issue(
                        "error", "syntax_error", exc.msg or "Invalid Python syntax",
                        line=exc.lineno, suggestion="Fix the syntax near the reported line.",
                    )
                )
        elif language == "json":
            try:
                json.loads(code)
                checked.append("JSON parser")
            except json.JSONDecodeError as exc:
                issues.append(
                    _issue("error", "syntax_error", exc.msg, line=exc.lineno, suggestion="Validate the JSON document.")
                )
        else:
            statements = [s for s in sqlparse.parse(code) if str(s).strip()]
            if not statements:
                issues.append(_issue("error", "empty_sql", "No SQL statement found"))
            checked.append("SQL statement splitter")
            if re.search(r"(?i)\b(?:DELETE|UPDATE)\b(?![^;]*\bWHERE\b)", code):
                issues.append(
                    _issue(
                        "warning", "unbounded_mutation",
                        "UPDATE/DELETE without WHERE may affect every row.",
                        suggestion="Add a WHERE clause or an explicit safeguard.",
                    )
                )

    ts_issues, ts_ok = _tree_sitter_issues(language, code)
    if ts_ok:
        parsed = True
        issues.extend(ts_issues)
        checked.append(f"tree-sitter parser ({language})")

    structural_issues, max_depth = _scan_structure(language, code)
    if not parsed:
        issues.extend(structural_issues)
        checked.append("delimiter and string balance")
    elif structural_issues:
        checked.append("delimiter balance (advisory)")

    issues.extend(_security_issues(language, code))
    issues.extend(_line_issues(code, PLACEHOLDER_RULES))
    issues.extend(_logic_issues(language, code))

    stats = _stats(language, code, max_depth)
    if max_depth > 5:
        issues.append(
            _issue(
                "warning", "deep_nesting",
                f"Nesting depth is {max_depth}; this is hard to test and maintain.",
                suggestion="Extract helpers or use early returns.",
            )
        )
    if stats["lines"] > 500:
        issues.append(
            _issue("info", "large_file", "File is very large.", suggestion="Split by responsibility.")
        )

    seen: set[tuple[str, int | None, str]] = set()
    unique: list[ValidationIssue] = []
    for issue in issues:
        key = (issue.rule, issue.line, issue.message)
        if key not in seen:
            seen.add(key)
            unique.append(issue)
    unique.sort(key=lambda item: (0 if item.severity == "error" else 1 if item.severity == "warning" else 2, item.line or 0))
    ok = not any(issue.severity == "error" for issue in unique)
    return ValidationReport(
        language=language,
        ok=ok,
        issues=unique[:60],
        stats=stats,
        checked=checked,
    )


def validate_text(text: str, hint: str | None = None) -> list[dict[str, Any]]:
    reports: list[dict[str, Any]] = []
    for block in extract_code_blocks(text):
        language = block.language if block.language != "text" else (normalize_language(hint) or "text")
        report = validate_code(language, block.code)
        reports.append(
            {
                "block": block.index,
                "language": report.language,
                "ok": report.ok,
                "issues": [issue.model_dump() for issue in report.issues],
                "stats": report.stats,
                "checked": report.checked,
                "code_preview": block.code[:160],
            }
        )
    return reports


def aggregate_ok(reports: list[dict[str, Any]]) -> bool:
    return all(report.get("ok", True) for report in reports)


def format_report_for_prompt(report: ValidationReport) -> str:
    if report.ok and not report.issues:
        return f"Mechanical validation passed ({report.language}). Checked: {', '.join(report.checked)}."
    lines = [
        f"Mechanical validation for {report.language}: {'PASS' if report.ok else 'FAIL'}.",
        f"Checked: {', '.join(report.checked)}.",
    ]
    for issue in report.issues[:15]:
        lines.append(
            f"- [{issue.severity}] line {issue.line or '?'} ({issue.rule}): {issue.message} {issue.suggestion}"
        )
    return "\n".join(lines)


def code_repair_prompt(
    *, language: str, code: str, issues: list[dict[str, Any]]
) -> str:
    """Build a focused repair request for a single failing code block."""
    label = LANGUAGE_LABELS.get(language, language or "text")
    rendered: list[str] = []
    for issue in issues[:20]:
        if isinstance(issue, dict):
            severity = issue.get("severity", "error")
            line = issue.get("line") or "?"
            rule = issue.get("rule", "issue")
            message = issue.get("message", "")
            suggestion = issue.get("suggestion") or ""
        else:  # pydantic model or object with attributes
            severity = getattr(issue, "severity", "error")
            line = getattr(issue, "line", None) or "?"
            rule = getattr(issue, "rule", "issue")
            message = getattr(issue, "message", "")
            suggestion = getattr(issue, "suggestion", "") or ""
        rendered.append(f"- line {line} [{severity}] {rule}: {message} {suggestion}".rstrip())
    problem_list = "\n".join(rendered) if rendered else "- General validation failure."
    return (
        f"Repair the following {label} code. It failed mechanical validation.\n\n"
        f"Issues found:\n{problem_list}\n\n"
        "Return the complete corrected code in a single fenced code block tagged with the "
        "language name. Keep the original intent and public API. Do not add placeholders, "
        "TODO comments, or truncated sections. After the code block, add a short bullet list "
        "of what you fixed.\n\n"
        f"Code:\n```{language}\n{code}\n```"
    )
