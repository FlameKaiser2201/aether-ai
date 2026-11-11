from __future__ import annotations

from app.ai.capability_guard import check_request, limitation_markdown
from app.ai.router import ClassificationInput, classify, needs_web_search
from app.services import chat_service
from app.services.search_service import ResearchBundle, WebResult


def test_capability_guard_blocks_email_and_allows_study():
    blocked = check_request("Send an email to my boss right now")
    assert blocked is not None
    assert "email" in limitation_markdown(blocked).lower()
    assert check_request("Explain photosynthesis for my biology exam") is None


def test_classifier_routes_common_tasks():
    assert classify(ClassificationInput(message="debug this Python traceback")).task_type == "coding"
    assert classify(ClassificationInput(message="make flashcards for cell biology")).task_type == "study"
    assert classify(ClassificationInput(message="mock interview for a backend role")).task_type == "interview"
    assert classify(ClassificationInput(message="latest news about AI regulation")).task_type == "research"
    assert classify(ClassificationInput(message="write a system design for a URL shortener")).task_type == "reasoning"
    assert classify(ClassificationInput(message="Tell me about AI")).tier == "balanced"
    assert classify(ClassificationInput(message="hello")).tier == "fast"


def test_current_information_detection():
    assert needs_web_search("What is the latest AI model release?")
    assert needs_web_search("What is the newest Python version?")
    assert needs_web_search("Who won the election?")
    assert needs_web_search("What is the current price of Bitcoin?")
    assert not needs_web_search("Explain photosynthesis for my biology exam")
    assert not needs_web_search("Update this function to handle empty input")
    assert not needs_web_search("Write a research plan for my essay")


def _fake_research(query: str, fetch_pages: bool = True) -> ResearchBundle:
    return ResearchBundle(
        query=query,
        provider="test",
        results=[
            WebResult(
                index=1,
                title="Live source",
                url="https://example.com/live",
                snippet="A current fact.",
                content="A current fact with detail.",
            )
        ],
    )


def test_chat_auto_searches_for_current_information(client, auth_headers, monkeypatch):
    calls: list[str] = []

    async def fake_search(query: str, fetch_pages: bool = True) -> ResearchBundle:
        calls.append(query)
        return _fake_research(query, fetch_pages)

    monkeypatch.setattr(chat_service.search_service, "search", fake_search)
    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={"message": "What is the latest AI news?"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert calls == ["What is the latest AI news?"]
    assert payload["citations"][0]["url"] == "https://example.com/live"


def test_chat_respects_explicit_search_opt_out(client, auth_headers, monkeypatch):
    calls: list[str] = []

    async def fake_search(query: str, fetch_pages: bool = True) -> ResearchBundle:
        calls.append(query)
        return _fake_research(query, fetch_pages)

    monkeypatch.setattr(chat_service.search_service, "search", fake_search)
    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={"message": "What is the latest AI news?", "web_search": False},
    )
    assert response.status_code == 200, response.text
    assert calls == []
    assert response.json()["citations"] == []


def test_chat_persists_conversation_and_returns_meta(client, auth_headers):
    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={"message": "Explain photosynthesis simply", "mode": "general", "web_search": False},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["conversation"]["message_count"] == 2
    assert payload["message"]["role"] == "assistant"
    assert payload["meta"]["demo"] is True
    assert payload["usage"]["output_tokens"] > 0

    conversation_id = payload["conversation"]["id"]
    detail = client.get(f"/api/v1/conversations/{conversation_id}", headers=auth_headers)
    assert detail.status_code == 200
    assert len(detail.json()["messages"]) == 2


def test_chat_stream_emits_sse_events(client, auth_headers):
    response = client.post(
        "/api/v1/chat/stream",
        headers=auth_headers,
        json={"message": "Give me three study tips", "web_search": False},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: meta" in body
    assert "event: token" in body
    assert "event: done" in body


def test_impossible_request_is_refused_honestly(client, auth_headers):
    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={"message": "Place a phone call to my doctor and book an appointment"},
    )
    assert response.status_code == 200
    content = response.json()["message"]["content"].lower()
    assert "cannot" in content or "can't" in content
    assert response.json()["meta"]["provider"] == "policy"


def test_conversation_memory_and_task_crud(client, auth_headers):
    conversation = client.post(
        "/api/v1/conversations",
        headers=auth_headers,
        json={"title": "CRUD test", "mode": "general"},
    )
    assert conversation.status_code == 201
    conversation_id = conversation.json()["id"]

    memory = client.post(
        "/api/v1/memories",
        headers=auth_headers,
        json={"category": "preference", "key": "explanation_style", "value": "use examples"},
    )
    assert memory.status_code == 201
    memory_id = memory.json()["id"]
    assert client.patch(
        f"/api/v1/memories/{memory_id}", headers=auth_headers, json={"value": "use diagrams"}
    ).status_code == 200
    assert client.delete(f"/api/v1/memories/{memory_id}", headers=auth_headers).status_code == 204

    task = client.post(
        "/api/v1/tasks", headers=auth_headers, json={"title": "Revise graphs", "priority": 4}
    )
    assert task.status_code == 201
    task_id = task.json()["id"]
    assert client.patch(
        f"/api/v1/tasks/{task_id}", headers=auth_headers, json={"status": "done"}
    ).status_code == 200
    assert client.delete(f"/api/v1/tasks/{task_id}", headers=auth_headers).status_code == 204
    assert client.delete(f"/api/v1/conversations/{conversation_id}", headers=auth_headers).status_code == 204
