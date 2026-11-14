# Cloudflare Workers + D1 edge API

This is the free-plan, Workers-native API for AETHER. It replaces the Render
FastAPI container for deployments that must stay entirely on Cloudflare.

```text
Browser
  │  HTTPS
  ▼
aether-web (Cloudflare Worker, Next.js + Auth.js)
  │  service binding `API` (no public subrequest)
  ▼
aether-api-edge (Cloudflare Worker)
  │
  └── D1 (SQLite) — users, sessions, conversations, messages, memories, tasks
        │
        └── OpenRouter / OpenAI / DeepSeek / Groq (provider APIs)
```

The web Worker calls the API Worker through a **service binding**, not a public
`workers.dev` URL. Cloudflare rejects Worker-to-Worker subrequests on the same
`workers.dev` zone with error **1042**, so the binding is required.

## What is implemented

- Email/password registration and login, JWT access tokens, rotating refresh
  tokens, logout, password change.
- Chat (JSON) and chat streaming (SSE), conversation history, titles, search,
  pin/archive/delete, JSON/Markdown export.
- Settings/preferences, memories CRUD, tasks CRUD, web search, voice status.
- Provider detection and the same quality chain as the Python API:
  Claude Sonnet via OpenRouter → GPT-4.1 → Gemini via OpenRouter → DeepSeek V4.1
  → Groq, with automatic cross-provider fallback. OpenRouter's free router is the
  final fallback when the key has a $0 spending limit.
- D1 read-your-writes consistency via `withSession("first-primary")`.
- One-time legacy login migration. If an email is not in D1, the edge API asks
  `LEGACY_API_URL` (the Render deployment) to verify the password, then creates a
  D1 account with a PBKDF2 hash of the same password. Later logins stay entirely
  on the edge. Conversations and memories are not imported by this step.

## What is not implemented on the edge yet

These endpoints return `501` and are documented as edge limitations:

- File upload, storage, analysis and deletion (`/files` mutations).
- Code validation/explanation endpoints (`/code/*`).
- Server-side speech-to-text and text-to-speech (`/voice/transcribe`,
  `/voice/synthesize`). The web UI uses the browser Web Speech API when
  available.
- Redis-backed rate limiting, background memory extraction, and automatic task
  planning.

Study material generation (`/study/generate`, `/study/sets`) and mock
interviews (`/interview/sessions`) are implemented on the edge and persist to
D1. They use the same provider failover chain as chat.

The edge deployment starts with a fresh D1 database. Existing Supabase/Render
accounts are **not migrated**; passwords use PBKDF2 here, while the Python API
uses Argon2id.

## Prerequisites

- Cloudflare account on the free plan.
- Wrangler authenticated (`npx wrangler login`) with D1 and Workers permissions.
- An AI provider key. `OPENROUTER_API_KEY` is enough; add the others to enable
  cross-provider fallback.
- Node.js 20+ (22 recommended).

## 1. Create and migrate D1

```bash
cd apps/edge-api
npx wrangler d1 create aether-edge
```

Copy the printed `database_id` into `apps/edge-api/wrangler.jsonc`, replacing
the placeholder. Then apply the schema:

```bash
npx wrangler d1 execute aether-edge --remote --file=migrations/0001_init.sql
```

The migration creates six tables: `users`, `refresh_tokens`, `conversations`,
`messages`, `memories`, `tasks`.

## 2. Set Worker secrets

Generate strong secrets and set them without committing them:

```bash
# bash
export PASSWORD_PEPPER="$(openssl rand -base64 48)"
export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
export JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

cd apps/edge-api
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put JWT_ACCESS_SECRET
npx wrangler secret put JWT_REFRESH_SECRET
```

PowerShell:

```powershell
$env:PASSWORD_PEPPER = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
# repeat for the two JWT secrets
```

Optional provider secrets: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`,
`GROQ_API_KEY`.

`PASSWORD_PEPPER` is mixed into every PBKDF2 hash. Keep it stable; changing it
invalidates every existing password.

## 3. Deploy the edge API

```bash
cd apps/edge-api
npx wrangler deploy
```

The Worker is published at:

```text
https://aether-api-edge.<your-subdomain>.workers.dev
```

Verify:

```bash
curl https://aether-api-edge.<your-subdomain>.workers.dev/api/v1/health
curl https://aether-api-edge.<your-subdomain>.workers.dev/api/v1/health/ready
```

Expected: `"runtime":"cloudflare-workers"`, `"storage":"d1"`,
`"database":true`, `"demo_mode":false`, and `"providers":1` (or more).

## 4. Wire the web Worker with a service binding

`apps/web/wrangler.jsonc` already declares the binding:

```jsonc
"services": [
  {
    "binding": "API",
    "service": "aether-api-edge"
  }
]
```

`apps/web/lib/backend.ts` resolves the binding with
`getCloudflareContext()` and falls back to `API_URL` for local development and
`next build`. Auth, registration, logout and the `/api/proxy/*` route all use it.

Build and deploy the web Worker:

```bash
cd apps/web
npm ci
npm run build:cloudflare

# Windows: the OpenNext deploy wrapper can fail with `spawn UNKNOWN`.
# Bypass it and call Wrangler directly.
$env:OPEN_NEXT_DEPLOY = "true"
npx wrangler deploy
```

On Linux/macOS, `npm run deploy:cloudflare` is equivalent.

`API_URL` is now optional in production because the service binding takes
precedence. Keep it set to the edge URL as a fallback for local previews, or
remove it. `AUTH_SECRET`, `AUTH_URL` and `NEXTAUTH_URL` are still required.

## 5. Verify end to end

```bash
BASE=https://aether-api-edge.<your-subdomain>.workers.dev/api/v1

curl -s "$BASE/health"
curl -s "$BASE/health/ready"

curl -s -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Edge Check","email":"edge@example.com","password":"Aether-Edge-2201!"}'

TOKEN=... # access_token from the response
curl -s -X POST "$BASE/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Reply with exactly: EDGE OK","mode":"general","web_search":false}'

curl -sN -X POST "$BASE/chat/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"What did I just ask?","mode":"general","web_search":false}'
```

Then open the web Worker, sign in, send a message, and confirm the assistant
badge shows `openrouter` / `openrouter/free` (or your paid model) with no demo
banner.

## 6. Free-plan trade-offs

- **10 ms CPU per request.** Password hashing uses PBKDF2-SHA256 with 25,000
  iterations plus a server pepper. This is lighter than Argon2id but still
  intentionally above a plain hash. Do not lower it without measuring the CPU
  budget.
- **D1 limits.** Free D1 includes 5 million rows read/day, 100,000 rows
  written/day, and 5 GB storage. The schema is intentionally small.
- **No Redis.** Rate limiting and background jobs are not ported yet.
- **No file storage.** File endpoints are disabled; use the Render/Supabase
  deployment if document upload is required.
- **No server voice.** Browser speech works; server STT/TTS needs the Python
  backend or a separate provider integration.

## 7. OpenRouter spending limit

A key with a **$0.00 total limit** returns HTTP `403 Key limit exceeded` for
paid models. AETHER automatically falls back to `openrouter/free`, which still
produces a real model response. To use Claude Sonnet, raise the key's spending
limit and add credits in the OpenRouter dashboard. Hosting is unaffected.

## 8. Roll back to Render

The Render deployment remains available as a fallback. To use it:

1. Remove the `services` block from `apps/web/wrangler.jsonc` (or point it at a
   different Worker).
2. Set the web Worker's `API_URL` secret to the Render URL.
3. Rebuild and redeploy the web Worker.
4. Keep the edge API deployed for testing, or delete it with
   `npx wrangler delete aether-api-edge`.
