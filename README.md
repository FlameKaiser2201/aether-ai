# AETHER

**Adaptive Engine for Thought, Help, Execution & Research** — a voice-first AI
workspace for studying, coding, interviews, research, documents, memory and
everyday execution.

[![CI](https://github.com/FlameKaiser2201/aether-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/FlameKaiser2201/aether-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-3776ab.svg)](https://www.python.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-000000.svg)](https://nextjs.org/)

AETHER is a production-oriented monorepo: a FastAPI API with an async
PostgreSQL data layer, a modular model-provider abstraction, and a Next.js 15
glassmorphism interface with streaming chat, live voice and six focused studio
workspaces.

It runs with **zero API keys** in a clearly labelled offline demo mode, and
switches to real providers as soon as credentials are configured.

---

## Highlights

### Voice and conversation
- Browser speech recognition and synthesis, with server-side Deepgram STT and
  ElevenLabs TTS fallbacks when configured.
- Continuous listening, barge-in interruption, sentence-streamed speech and a
  live transcript.
- Server-sent-event chat streaming with routing metadata, citations, code
  validation reports and usage counters.
- Short-term conversation context plus editable long-term memory, user
  preferences and automatic memory extraction.

### Six studio workspaces
| Studio | What it does |
| --- | --- |
| **Study** | Structured notes, summaries, important questions, interactive quizzes, flip flashcards and revision plans |
| **Interview** | HR, technical, DSA, system-design, behavioural and company-specific mock interviews with rubric scoring and a final report |
| **Code** | Generate, validate, review, refactor, debug and explain code in 15 languages |
| **Research** | Live web search, source snippets and citations, then a cited research brief in chat |
| **Files** | PDF, DOCX, XLSX, CSV, JSON, TXT, Markdown, HTML, XML and image analysis with summarize/extract modes |
| **Tasks** | Prioritised task capture, deadlines, statuses and overdue tracking |

### Intelligence layer
- Provider abstraction for **OpenAI-compatible**, **DeepSeek**, **Groq**,
  **OpenRouter**, custom gateways and **Ollama**.
- Intelligent routing by task: simple → fast model, coding → coding model,
  complex reasoning → reasoning model, vision → vision model.
- Capability guard that recognises impossible or unsupported requests and
  explains the limitation instead of hallucinating.
- Code guard that statically validates syntax, delimiters, placeholders,
  SQL/JSON structure, security smells and edge cases before returning generated
  code, with one automatic repair round.
- Honest demo provider so every feature remains explorable without keys.

### Security and operations
- Auth.js (NextAuth v5) JWT sessions on the web tier; FastAPI issues short-lived
  access tokens and rotating refresh tokens.
- Argon2id password hashing, login throttling, per-route rate limits, strict
  input validation, output sanitisation, CSP and security headers.
- Supabase Storage when configured, local volume otherwise.
- Redis when available, in-process fallback otherwise.
- Alembic migrations, health/readiness probes, Docker images, CI, and
  one-command deployment assets for the free Cloudflare + Render + Supabase
  stack.

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 15 / React 19 / Tailwind / ShadCN               │
│  Landing · Chat · Voice · Studio · History · Memory · Settings     │
│  Auth.js JWT session cookie (server-side only tokens)              │
└───────────────────────────────┬────────────────────────────────────┘
                                │ same-origin /api/proxy/*
┌───────────────────────────────▼────────────────────────────────────┐
│  FastAPI                                                           │
│  auth · chat SSE · conversations · memories · tasks · files        │
│  study · interview · code · search · settings · voice · health     │
│                                                                    │
│  Orchestration                                                     │
│  classifier → task plan → provider router → context builder        │
│  capability guard · code guard · memory extraction · citations     │
└───────┬──────────────┬──────────────┬──────────────┬───────────────┘
        │              │              │              │
  PostgreSQL       Redis (opt.)   AI providers   Search / Voice
  SQLAlchemy 2     rate limit     OpenAI-compat  Tavily · Brave
  Alembic          cache          DeepSeek       Serper · SearXNG
  SQLite fallback  in-process     Groq/OpenRouter Deepgram
                                  Ollama / Demo  ElevenLabs
        │
  Storage: Supabase Storage or local volume
```

The full design is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Model routing

| Task signal | Tier | Typical model |
| --- | --- | --- |
| Greeting, short factual answer, summarising a sentence | `fast` | lightweight model |
| Study notes, explanations, research synthesis | `balanced` | balanced model |
| System design, multi-step reasoning, interviews | `reasoning` | strongest model |
| Code generation, debugging, refactoring | `coding` | coding model |
| Image understanding | `vision` | vision model |

The router considers the user's `quality` / `cost` / `local` preference, provider
availability and the requested mode. Every chat response exposes the chosen
provider, model, tier and routing reason.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15.5, React 19, TypeScript, TailwindCSS 3.4, ShadCN/Radix UI |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2 async, Alembic |
| Database | PostgreSQL 16 in production, SQLite for local/tests |
| Cache / limits | Redis 7, in-process fallback |
| Auth | Auth.js / NextAuth v5, backend JWT access + rotating refresh tokens |
| Storage | Supabase Storage, local volume fallback |
| AI | OpenAI-compatible, DeepSeek, Groq, OpenRouter, custom gateways, Ollama, Demo |
| Search | Tavily, Brave, Serper, SearXNG |
| Voice | Browser Web Speech API, Deepgram STT, ElevenLabs TTS |
| Deployment | Docker, Compose, Cloudflare Workers (OpenNext), Render Free, Supabase Free |

---

## Repository layout

```text
aether/
├─ apps/
│  ├─ api/                 FastAPI service, AI layer, services, models, tests
│  │  ├─ app/ai/           providers, registry, router, guards, prompts
│  │  ├─ app/api/          HTTP routes
│  │  ├─ app/services/     orchestration and domain services
│  │  ├─ alembic/          migrations
│  │  └─ tests/            API, auth, chat, code, study, interview, files
│  └─ web/                 Next.js app, components, hooks, Auth.js proxy
├─ docs/                   architecture, API, deployment, security
├─ deploy/
│  ├─ cloudflare/          Cloudflare Workers (OpenNext) deployment guide
│  ├─ render/              free FastAPI Docker host guide
│  └─ supabase/            schema.sql + Free-tier setup guide
├─ infra/railway/          monorepo-root Dockerfile for Railway
├─ scripts/                production start helper
├─ .github/workflows/      CI (lint, tests, typecheck, build, images)
├─ docker-compose.yml
├─ railway.json
└─ .env.example
```

---

## Quickstart

### Option A — Docker Compose (PostgreSQL + Redis + API + web)

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. If `SEED_DEMO=true` (the template default), a demo
account is created:

```text
Email:    demo@aether.local
Password: AetherDemo!2026
```

You can also register a new account. The API is at <http://localhost:8000> and
its interactive docs at <http://localhost:8000/docs>.

> Change every secret in `.env` before exposing the stack. Production mode
> refuses weak JWT secrets, insecure cookies and `SEED_DEMO=true`.

### Option B — local development

Prerequisites: Python 3.12+, Node.js 20+, and optionally PostgreSQL/Redis.
For a zero-dependency demo, use SQLite and leave Redis empty.

```bash
# 1. Environment
cp .env.example .env
# edit .env:
#   DATABASE_URL=sqlite+aiosqlite:///./data/aether.db
#   REDIS_URL=
#   ENVIRONMENT=development
#   SEED_DEMO=true

# 2. API (Windows)
cd apps/api
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/alembic upgrade head
.venv/Scripts/uvicorn app.main:app --reload --port 8000

# 2. API (macOS/Linux)
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000

# 3. Web (new terminal)
cd apps/web
npm ci
npm run dev
```

The API reads `.env` from `apps/api` and falls back to the repository-root
`.env`, so a single root file is enough for both services.

### Demo mode

If no AI provider is configured, AETHER automatically enters demo mode and
labels every response. The demo provider can still demonstrate study sets, code
review/refactor/debug/explain, file analysis, interview scoring and chat
streaming. Research explains that live search is unavailable rather than
inventing sources. Set any provider key (or `OLLAMA_ENABLED=true`) to switch to
real inference.

---

## Configuration

Every setting is documented in [`.env.example`](.env.example). The most
important groups are:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://…` or `sqlite+aiosqlite:///…` |
| `REDIS_URL` | Optional; empty uses in-process fallback |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_SECRET` | Backend signing secrets |
| `AUTH_SECRET` | Auth.js session encryption secret |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | AI providers |
| `OLLAMA_ENABLED`, `OLLAMA_BASE_URL` | Self-hosted local models |
| `ROUTING_STRATEGY` | `quality`, `cost` or `local` |
| `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, `SERPER_API_KEY`, `SEARXNG_URL` | Web research |
| `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` | Server voice fallbacks |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Durable file storage |
| `SEED_DEMO`, `DEMO_EMAIL`, `DEMO_PASSWORD` | Local demo account |
| `ENVIRONMENT=production` | Enables strict production guardrails |

Provider model names are configurable per tier, so new models can be adopted
without code changes.

---

## Testing

```bash
# Backend
cd apps/api
.venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/ruff check app tests
.venv/Scripts/pytest -q

# Frontend
cd apps/web
npm run lint
npm run typecheck
npm run build
```

The backend suite covers health, registration/login, refresh-token rotation,
chat SSE, capability guards, routing classification, conversation/memory/task
CRUD, code validation, study generation, interview flow and file upload/analysis.

---

## Deployment

The recommended deployment is **100% free**:

| Layer | Service | Configuration |
| --- | --- | --- |
| Frontend | Cloudflare Workers (OpenNext) | [`apps/web/wrangler.jsonc`](apps/web/wrangler.jsonc), [`apps/web/open-next.config.ts`](apps/web/open-next.config.ts) |
| API | Render Free (Docker) | [`apps/api/Dockerfile`](apps/api/Dockerfile), [`deploy/render/README.md`](deploy/render/README.md) |
| Database + storage | Supabase Free | [`deploy/supabase/schema.sql`](deploy/supabase/schema.sql), [`deploy/supabase/README.md`](deploy/supabase/README.md) |

Quick start:

1. Run [`deploy/supabase/schema.sql`](deploy/supabase/schema.sql) in a new
   Supabase project and copy the session-pooler URL, project URL, and
   service-role key.
2. Create a Render **Web Service** from this repository (Docker, root
   directory `apps/api`, Dockerfile `Dockerfile`, health check `/health`,
   Free instance) and set the API environment variables.
3. Set the Worker secrets (`AUTH_SECRET`, `API_URL`, `AUTH_URL`,
   `NEXTAUTH_URL`) and run `npm run deploy:cloudflare` in `apps/web`.
4. Update the API's `APP_URL` and `CORS_ORIGINS` to the Worker URL and redeploy.

Full instructions, environment reference, migrations, and troubleshooting are
in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Render-specific steps, including
the manual service setup and free-plan sleep behaviour, are in
[`deploy/render/README.md`](deploy/render/README.md).

Optional targets: Docker Compose, Railway, Vercel (web only), Fly.io/ECS/VPS.
The Render Blueprint was removed in favour of a manually configured service;
Cloudflare Pages is not used because its Next.js adapter does not support
Next.js 15.5.29.

---

## API and security

- API reference: [`docs/API.md`](docs/API.md)
- Security model: [`docs/SECURITY.md`](docs/SECURITY.md)
- Interactive OpenAPI docs: `/docs` when `ENABLE_API_DOCS=true`

Security defaults include Argon2id hashing, access/refresh token rotation,
login throttling, per-user and per-IP rate limits, upload type and magic-byte
validation, filename sanitisation, HTML sanitisation, CSP, `X-Frame-Options`,
`nosniff`, strict CORS and production configuration guardrails.

---

## License

MIT — see [`LICENSE`](LICENSE).
