# AETHER API reference

Base path: `/api/v1` (for example `http://localhost:8000/api/v1`).
Interactive OpenAPI documentation is served at `/docs` when
`ENABLE_API_DOCS=true`.

All endpoints except registration, login, refresh and health require a bearer
access token:

```http
Authorization: Bearer <access_token>
```

The Next.js web tier calls the API through the same-origin `/api/proxy/*`
route, which attaches the token server-side. Browser JavaScript never receives
the backend access or refresh token.

---

## Authentication

### Flow

1. `POST /auth/register` or `POST /auth/login` returns an access token
   (15 minutes by default), a rotating refresh token (30 days) and the user.
2. Auth.js stores the pair in its encrypted, HTTP-only session cookie.
3. When the access token is close to expiry, Auth.js calls `/auth/refresh`.
4. Refresh tokens are single-use. Reusing an old token revokes the family.
5. `POST /auth/logout` revokes the refresh token and the web tier clears the
   session cookie.

OAuth-style providers can be bridged with `POST /auth/oauth`, which requires the
server-to-server header `X-Internal-Secret: <INTERNAL_API_SECRET>`.

### Endpoints

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{email, password, name}` | `201 TokenPair` |
| `POST` | `/auth/login` | `{email, password}` | `TokenPair` |
| `POST` | `/auth/refresh` | `{refresh_token}` | rotated `TokenPair` |
| `POST` | `/auth/logout` | `{refresh_token}` | `204` |
| `POST` | `/auth/oauth` | `{email, name, avatar_url, provider, provider_account_id}` | `TokenPair` |
| `GET` | `/auth/me` | — | `UserOut` |
| `PATCH` | `/auth/me` | `{name?, avatar_url?}` | `UserOut` |
| `POST` | `/auth/change-password` | `{current_password, new_password}` | `204` |
| `DELETE` | `/auth/me` | — | `204` (cascades all user data) |

Password rules: 10–128 characters, at least one lowercase, uppercase and digit,
and not a common password. Login failures are throttled per email + IP.

`TokenPair`:

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": "usr_…",
    "email": "you@example.com",
    "name": "Your Name",
    "avatar_url": null,
    "auth_provider": "credentials",
    "email_verified": false,
    "role": "user",
    "preferences": {},
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

## Chat

### `POST /chat/stream` — server-sent events

Request:

```json
{
  "message": "Explain database normalization with examples",
  "conversation_id": null,
  "mode": "auto",
  "file_ids": [],
  "web_search": null,
  "voice": false,
  "language": null
}
```

`mode` is one of `auto`, `general`, `study`, `coding`, `interview`, `research`,
`voice`. `file_ids` accepts up to 8 uploaded file IDs.

`web_search` controls research explicitly:

- `null` or omitted: uses the user's preference and automatically searches when
  the request needs current information (news, releases, prices, versions).
- `true`: always searches before answering.
- `false`: never searches for this turn.

Response: `text/event-stream`. Each event has a named type and JSON `data`.
A comment line `: ping` is sent every 15 seconds as a keepalive.

| Event | Data |
| --- | --- |
| `meta` | `{conversation_id, provider, model, tier, task_type, routing_reason, demo, plan, mode}` |
| `status` | `{stage, message}` — `researching`, `reading_files`, `generating`, `repairing` |
| `token` | `{text}` — incremental answer text |
| `citations` | `{sources: [{index, title, url, snippet}]}` |
| `validation` | `{blocks: [ValidationReport]}` — code validation for generated code |
| `usage` | `{input_tokens, output_tokens, latency_ms}` |
| `done` | `{conversation_id, message_id, title, memory_queued, usage}` |
| `error` | `{code, message}` — the stream ends after this event |

### `POST /chat` — non-streaming

Same request body. Returns `ChatResponse` with the persisted conversation,
message, citations, usage, task plan, validation blocks and routing metadata.
Useful for integrations that cannot consume SSE.

### `GET /conversations`

Query: `limit` (1–100, default 20), `offset` (default 0), `query` (title or
summary search), `archived` (`false` default).

Returns `{items, total, limit, offset}` ordered by pinned first, then most
recently updated.

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `POST` | `/conversations` | `{title?, mode}` | `201 Conversation` |
| `GET` | `/conversations/{id}` | `message_limit` (1–500) | `ConversationDetail` with messages |
| `PATCH` | `/conversations/{id}` | `{title?, pinned?, archived?}` | `Conversation` |
| `DELETE` | `/conversations/{id}` | — | `204` |
| `GET` | `/conversations/{id}/export` | `format=md\|json` | file download |

---

## Memory

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `GET` | `/memories` | `category?`, `q?` | `{items, total, categories}` |
| `POST` | `/memories` | `{category, key, value, confidence?}` | `201 Memory` |
| `PATCH` | `/memories/{id}` | any of `{category, key, value, confidence}` | `Memory` |
| `DELETE` | `/memories/{id}` | — | `204` |
| `DELETE` | `/memories` | — | `{deleted: n}` (wipe all) |

Categories: `identity`, `preference`, `goal`, `project`, `skill`,
`relationship`, `schedule`, `fact`. Memory retrieval is used automatically in
chat when the user's `auto_memory` preference is enabled.

---

## Tasks

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `GET` | `/tasks` | `status?` (`pending`, `in_progress`, `done`, `cancelled`) | `Task[]` |
| `POST` | `/tasks` | `{title, description?, priority?, due_at?, conversation_id?}` | `201 Task` |
| `PATCH` | `/tasks/{id}` | any of `{title, description, priority, status, due_at}` | `Task` |
| `DELETE` | `/tasks/{id}` | — | `204` |

`priority` is 1 (highest) to 5 (lowest). Tasks are returned by status, priority
and creation date.

---

## Files

Upload is `multipart/form-data`:

```bash
curl -X POST http://localhost:8000/api/v1/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@notes.pdf" \
  -F "conversation_id=optional-conversation-id"
```

Supported types: PDF, DOCX, XLSX/XLSM, CSV, JSON, TXT, Markdown, LOG, YAML,
HTML, XML, PNG, JPG/JPEG, WEBP, GIF, BMP. Limit: 25 MB by default. Magic bytes
are validated for PDFs, Office files and images.

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `POST` | `/files` | multipart `file`, optional `conversation_id` | `201 File` |
| `GET` | `/files` | `conversation_id?` | `{items, total}` |
| `GET` | `/files/{id}` | — | `File` |
| `GET` | `/files/{id}/download` | — | original bytes |
| `POST` | `/files/{id}/analyze` | `{mode, instruction?, schema_hint?}` | `AnalyzeResponse` |
| `DELETE` | `/files/{id}` | — | `204` |

`mode` is `analyze`, `summarize` or `extract`. `extract` can use `schema_hint`
to request a JSON shape. Analysis uses only the extracted document text (or
vision for images when a vision provider is configured) and does not invent
missing facts.

`AnalyzeResponse`:

```json
{
  "file_id": "…",
  "mode": "analyze",
  "content": "Markdown analysis…",
  "data": null,
  "provider": "openai",
  "model": "gpt-4.1-mini"
}
```

---

## Study

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `POST` | `/study/generate` | `{kind, topic, level?, count?, context?, language?}` | `201 StudySet` |
| `GET` | `/study/sets` | `kind?` | `{items, total}` |
| `GET` | `/study/sets/{id}` | — | `StudySet` |
| `DELETE` | `/study/sets/{id}` | — | `204` |

`kind`: `notes`, `summary`, `questions`, `quiz`, `flashcards`, `revision_plan`.
`level`: `beginner`, `intermediate`, `advanced`, `exam`. `count` is 1–50.
`context` (up to 20,000 chars) is treated as the primary source material.

Each kind returns a different `content` object: sections and key terms for
notes, a TL;DR and key points for summaries, question/answer pairs, quiz
options with `correct_index`, flashcards with front/back, or a daily revision
plan with checkpoints.

---

## Interview

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| `GET` | `/interview/questions` | `role?`, `company?`, `category?`, `difficulty?` | `QuestionBankItem[]` |
| `POST` | `/interview/sessions` | `{role, company?, type?, difficulty?, question_count?}` | `201 Session` |
| `GET` | `/interview/sessions` | — | `{items, total}` |
| `GET` | `/interview/sessions/{id}` | — | `Session` |
| `POST` | `/interview/sessions/{id}/answer` | `{question_index, answer}` | `Evaluation` |
| `POST` | `/interview/sessions/{id}/complete` | — | `Report` |
| `DELETE` | `/interview/sessions/{id}` | — | `204` |

`type`: `hr`, `technical`, `dsa`, `system_design`, `behavioral`, `mixed`.
`difficulty`: `easy`, `medium`, `hard`. `question_count`: 1–20.

Answer evaluation returns a 0–10 score, a rubric (`correctness`, `depth`,
`clarity`, `communication`), strengths, improvements, a model answer and the
next unanswered question. Completing a session returns an overall score,
strengths, gaps, next steps and a per-question breakdown.

---

## Code

All code endpoints accept:

```json
{
  "code": "def add(a, b):\n    return a + b",
  "language": "python",
  "goal": "optional context, error traceback or constraints"
}
```

`language` may be omitted for auto-detection. Maximum code size: 100,000
characters.

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/code/validate` | `ValidationReport` (static checks only) |
| `POST` | `/code/review` | `CodeActionResponse` |
| `POST` | `/code/refactor` | `CodeActionResponse` |
| `POST` | `/code/debug` | `CodeActionResponse` |
| `POST` | `/code/explain` | `CodeActionResponse` |

`CodeActionResponse`:

```json
{
  "result": "Markdown explanation or review…",
  "code": "improved code, when applicable",
  "validation": {
    "language": "python",
    "ok": true,
    "issues": [],
    "stats": {"lines": 12},
    "checked": ["syntax", "delimiters", "security", "placeholders"]
  },
  "provider": "deepseek",
  "model": "deepseek-flash"
}
```

Supported languages include Python, Java, C++, C, C#, JavaScript, TypeScript,
Go, Rust, PHP, SQL, Dart, Kotlin, Swift and Ruby. Generated code is validated
once and repaired automatically when blocking issues are found.

---

## Search and research

### `POST /search`

```json
{ "query": "PostgreSQL vs SQLite for production AI apps", "max_results": 6 }
```

Returns `{query, provider, results, cached}`. Each result has `index`, `title`,
`url` and `snippet`. `max_results` is 1–10. When no search provider is
configured, the API returns an empty result set and research mode explains the
limitation instead of fabricating sources.

Use chat with `mode: "research"` (or `web_search: true`) to fetch sources,
compare evidence and produce a cited answer.

---

## Voice

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/voice/status` | — | `{stt, tts, stt_provider, tts_provider, browser_fallback}` |
| `POST` | `/voice/transcribe` | multipart `audio`, query `language?` | `{text, language, duration, provider}` |
| `POST` | `/voice/synthesize` | `{text, voice?, format?}` | audio bytes |

`format` is `mp3`, `wav` or `opus`. Text is limited to 4,000 characters.
Browser speech recognition/synthesis is always available; these endpoints are
optional server fallbacks and return `503` with a clear message when the
provider is not configured.

---

## Settings and capabilities

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/settings` | — | preferences, capabilities, model catalog, limits |
| `PATCH` | `/settings` | partial `UserPreferences` | `{preferences}` |
| `GET` | `/models` | — | routing strategy, `demo_mode` (true only when no valid provider), models, providers |

Preferences include language (`auto`, `en`, `hi`, `hinglish`), response style,
routing strategy, voice name/rate/pitch, auto-speak, continuous listening,
auto-memory, web-search default, study level, interview defaults, timezone,
preferred code language and whether to show routing metadata.

---

## Health

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/health` (root) | `{status, version}` — liveness |
| `GET` | `/api/v1/health` | `{status, name, version, demo_mode}` |
| `GET` | `/api/v1/health/providers` | detected providers, selected model per tier, priority and validation issues; never includes API keys |
| `GET` | `/api/v1/health/ready` | database, Redis, storage and provider readiness; `503` if the database is unreachable |

`/health/providers` is the deployment verification endpoint after adding a key:

```json
{
  "demo_mode": false,
  "priority": ["openrouter", "openai"],
  "providers": {
    "openrouter": {
      "label": "OpenRouter",
      "base_url": "https://openrouter.ai/api/v1",
      "models": {
        "fast": "google/gemini-3.8-flash",
        "balanced": "anthropic/claude-sonnet-5.5"
      }
    }
  },
  "selected": {
    "balanced": "openrouter/anthropic/claude-sonnet-5.5",
    "coding": "openrouter/anthropic/claude-sonnet-5.5"
  },
  "validation_issues": []
}
```

`demo_mode` is `false` whenever at least one structurally valid provider is
registered. A placeholder key does not count as valid.

---

## Errors and rate limits

Error envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "request_id": "req_…",
    "details": [
      {"loc": ["body", "message"], "msg": "Field required", "type": "missing"}
    ]
  }
}
```

Common codes: `validation_error` (422), `unauthorized` (401), `not_found` (404),
`rate_limited` (429), `file_too_large` (413), `unsupported_file` (415),
`capability_unavailable` (422), `session_completed` (409), `chat_failed` (502).

Rate-limit headers are returned on API responses:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
Retry-After          # on 429
```

Buckets: auth (10/min), chat (30/min), upload (60/hour), general API
(120/min). Limits are configurable in `.env`.
