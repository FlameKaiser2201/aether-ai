from __future__ import annotations

from app.ai.router import plan_tasks


def test_simple_multiline_request_is_not_planned():
    assert plan_tasks("Write a poem.\nMake it short.") == []


def test_explicit_numbered_tasks_are_planned():
    plan = plan_tasks("1. Fix the login bug\n2. Add a regression test")
    assert len(plan) == 2
    assert plan[0].title == "Fix the login bug"
    assert plan[1].title == "Add a regression test"
