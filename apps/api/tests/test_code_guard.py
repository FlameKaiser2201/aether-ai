from __future__ import annotations

from app.ai.code_guard import (
    code_repair_prompt,
    detect_language,
    extract_code_blocks,
    validate_code,
    validate_text,
)


def test_detects_languages_from_fences():
    text = "```python\ndef add(a, b):\n    return a + b\n```\n\n```javascript\nconst add = (a, b) => a + b;\n```"
    blocks = extract_code_blocks(text)
    assert [block.language for block in blocks] == ["python", "javascript"]


def test_valid_python_passes():
    report = validate_code("python", "def add(a: int, b: int) -> int:\n    return a + b\n")
    assert report.ok is True
    assert report.language == "python"
    assert "Python AST" in report.checked


def test_invalid_python_fails_with_line_number():
    report = validate_code("python", "def broken(:\n    return 1\n")
    assert report.ok is False
    assert any(issue.rule == "syntax_error" for issue in report.issues)
    assert any(issue.line == 1 for issue in report.issues)


def test_security_rules_detect_unsafe_patterns():
    code = (
        "import subprocess\n"
        "API_KEY = 'sk-abcdefghijklmnop'\n"
        "subprocess.run(user_input, shell=True)\n"
    )
    report = validate_code("python", code)
    rules = {issue.rule for issue in report.issues}
    assert "hardcoded_secret" in rules
    assert "shell_execution" in rules
    assert report.ok is False


def test_placeholder_detection():
    report = validate_code("python", "def save():\n    # TODO: implement\n    pass\n")
    assert any(issue.rule == "placeholder" for issue in report.issues)


def test_sql_without_where_warns():
    report = validate_code("sql", "DELETE FROM users;")
    assert any(issue.rule == "unbounded_mutation" for issue in report.issues)


def test_json_validation():
    assert validate_code("json", '{"ok": true}').ok is True
    assert validate_code("json", '{"ok": ').ok is False


def test_detect_language_heuristics():
    assert detect_language("#include <iostream>\nint main() { return 0; }") == "cpp"
    assert detect_language("package main\nfunc main() {}") == "go"
    assert detect_language("SELECT id FROM users WHERE active = 1;") == "sql"


def test_validate_text_aggregates_blocks():
    reports = validate_text("```python\ndef add(a, b):\n    return a + b\n```")
    assert len(reports) == 1
    assert reports[0]["ok"] is True


def test_repair_prompt_contains_code_and_issues():
    prompt = code_repair_prompt(
        language="python",
        code="def add(a, b):\n    return a +",
        issues=[{"severity": "error", "line": 2, "rule": "syntax_error", "message": "invalid syntax"}],
    )
    assert "```python" in prompt
    assert "syntax_error" in prompt
    assert "Do not add placeholders" in prompt
