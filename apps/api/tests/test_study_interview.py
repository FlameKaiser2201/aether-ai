from __future__ import annotations

import pytest


@pytest.mark.parametrize("kind", ["notes", "summary", "questions", "quiz", "flashcards", "revision_plan"])
def test_demo_study_generation(client, auth_headers, kind):
    response = client.post(
        "/api/v1/study/generate",
        headers=auth_headers,
        json={"kind": kind, "topic": "cell biology", "level": "beginner", "count": 3},
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["kind"] == kind
    assert isinstance(payload["content"], dict)
    assert payload["content"]


def test_study_list_and_delete(client, auth_headers):
    created = client.post(
        "/api/v1/study/generate",
        headers=auth_headers,
        json={"kind": "notes", "topic": "linear algebra", "count": 3},
    )
    assert created.status_code == 201
    set_id = created.json()["id"]
    listing = client.get("/api/v1/study/sets", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1
    assert client.get(f"/api/v1/study/sets/{set_id}", headers=auth_headers).status_code == 200
    assert client.delete(f"/api/v1/study/sets/{set_id}", headers=auth_headers).status_code == 204


def test_interview_question_bank(client, auth_headers):
    response = client.get("/api/v1/interview/questions", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) > 0


def test_interview_session_flow(client, auth_headers):
    created = client.post(
        "/api/v1/interview/sessions",
        headers=auth_headers,
        json={
            "role": "Backend Engineer",
            "company": "Acme",
            "type": "technical",
            "difficulty": "medium",
            "question_count": 2,
        },
    )
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    assert len(created.json()["questions"]) == 2

    answer = client.post(
        f"/api/v1/interview/sessions/{session_id}/answer",
        headers=auth_headers,
        json={
            "question_index": 0,
            "answer": (
                "I would clarify the requirements, design the API contract, use PostgreSQL with "
                "indexes, add caching for hot reads, and test failure modes."
            ),
        },
    )
    assert answer.status_code == 200, answer.text
    assert 0 <= answer.json()["score"] <= 10

    report = client.post(
        f"/api/v1/interview/sessions/{session_id}/complete", headers=auth_headers
    )
    assert report.status_code == 200, report.text
    assert report.json()["overall"]
    assert report.json()["per_question"]


def test_code_endpoints(client, auth_headers):
    code = "def add(a, b):\n    return a + b\n"
    validated = client.post(
        "/api/v1/code/validate",
        headers=auth_headers,
        json={"language": "python", "code": code},
    )
    assert validated.status_code == 200
    assert validated.json()["ok"] is True
    reviewed = client.post(
        "/api/v1/code/review",
        headers=auth_headers,
        json={"language": "python", "code": code, "goal": "keep it simple"},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["result"]
    assert reviewed.json()["validation"]["ok"] is True


def test_file_upload_analysis_and_delete(client, auth_headers):
    uploaded = client.post(
        "/api/v1/files",
        headers=auth_headers,
        files={
            "file": (
                "notes.txt",
                b"Photosynthesis converts light into chemical energy. Chlorophyll absorbs light.",
                "text/plain",
            )
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["id"]
    assert client.get(f"/api/v1/files/{file_id}", headers=auth_headers).status_code == 200
    analysis = client.post(
        f"/api/v1/files/{file_id}/analyze",
        headers=auth_headers,
        json={"mode": "summarize"},
    )
    assert analysis.status_code == 200, analysis.text
    assert "photosynthesis" in analysis.json()["content"].lower()
    assert client.delete(f"/api/v1/files/{file_id}", headers=auth_headers).status_code == 204
