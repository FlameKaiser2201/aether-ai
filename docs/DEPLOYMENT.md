# Deployment guide

AETHER deploys on a **100% free** stack:

| Layer | Service | Free plan |
| --- | --- | --- |
| Frontend | **Cloudflare Workers** (Next.js 15 via OpenNext) | 100,000 requests/day, 10 ms CPU/request |
| API | **Render Free** (FastAPI Docker container) | 750 instance hours/month, 512 MB RAM, 0.1 CPU, no card, sleeps after 15 min idle |
| API (edge option) | **Cloudflare Workers + D1** (`apps/edge-api`) | 100,000 requests/day, 10 ms CPU/request, 5 GB D1 |
| Database | **Supabase Free** PostgreSQL | 500 MB database, 5 GB egress |
| File storage | **Supabase Free** Storage | 1 GB, private bucket |

> **Fully on Cloudflare:** [`EDGE_DEPLOYMENT.md`](EDGE_DEPLOYMENT.md) covers the
> Workers-native API in `apps/edge-api`. It keeps auth, chat, conversations,
> settings, memories, tasks and search on the free plan using D1, with a service
> binding from the web Worker. File, study/interview and server-voice mutations
> are not ported yet; use the Render API if you need them.

```text
Browser
  │  HTTPS
  ▼
Cloudflare Worker  ── server-side fetch ──►  Render Free
(Next.js + Auth.js)                          (FastAPI + SQLAlchemy)
  │                                                  │
  └── same-origin /api/proxy/*                      ├── Supabase Postgres (session pooler, TLS)
                                                    └── Supabase Storage (private bucket)
```

The browser never receives backend tokens or the Supabase service-role key. The
Worker proxies API calls through `/api/proxy/*`, and Auth.js keeps the backend
access/refresh tokens inside its encrypted session cookie.

---

## Why this stack

### Cloudflare Pages is not used

`@cloudflare/next-on-pages@1.13.16` supports Next.js `>=14.3.0 && <=15.5.2`.
This project runs **Next.js 15.5.29**, so the Pages adapter cannot build it.
Cloudflare now recommends **Workers + OpenNext** for Next.js SSR; Pages only
supports statically exported Next.js apps. AETHER cannot be static because
Auth.js and the API proxy run on the server.

The frontend still runs on Cloudflare's free plan — just as a Worker instead of
a Pages project.

### The FastAPI backend is not on Cloudflare Workers

Workers Free enforces **10 ms CPU per request**. Argon2id password hashing alone
exceeds that on login/register, and FastAPI + Pydantic + SQLAlchemy requests
regularly exceed it too. The API would fail with `Error 1102` (CPU limit).
Cloudflare Containers and Workers Paid would work but are not free.

A separate **Workers-native JavaScript API** is included in `apps/edge-api`. It
uses PBKDF2 (25,000 iterations + a server pepper) and D1 instead of Argon2id and
Postgres, and covers the core workspace: auth, chat/streaming, conversations,
settings, memories, tasks and search. See
[`EDGE_DEPLOYMENT.md`](EDGE_DEPLOYMENT.md) for the deployment steps and the
feature limits. The FastAPI container remains the full-featured option for file
uploads, study/interview generation and server-side voice.

### Northflank is not used

Northflank's pricing page advertises a free Sandbox with "No card needed", but
its service creation form now requires a card even for the free plan
("Creating this service requires a card"). AETHER does not ask you to add one.

### Railway is not used

Railway Free includes only **$1/month** of usage credit. An always-on 0.5 GB
service costs roughly **$5/month** in RAM alone (before CPU), so the service is
suspended after a few days. The $5 trial credit is a one-time 30-day grant, not
a recurring allowance.

### Render Free is used

Render Free requires **no card**, includes **750 instance hours/month**, 512 MB
RAM, Docker support, and health checks. The trade-off is that free services
**spin down after 15 minutes idle**; the first request takes about 50 seconds to
wake the container. Supabase stores the database and files, so Render needs no
persistent disk.

---

## Prerequisites

- GitHub account with the repository (public:
  <https://github.com/FlameKaiser2201/aether-ai>).
- [Cloudflare](https://dash.cloudflare.com/sign-up) account (free).
- [Render](https://dashboard.render.com/register) account (free Hobby plan, no
  card).
- [Supabase](https://supabase.com/dashboard) account (free).
- Node.js 20+ (22 recommended) and Python 3.12+ for local builds.
- Optional: an AI provider key (OpenRouter, OpenAI, DeepSeek, or Groq) and
  search / voice keys. With a valid key the API uses the strongest available
  model automatically; without one it runs in clearly labelled local fallback
  mode.

Generate the secrets now — you will paste them into Render and Cloudflare:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_ACCESS_SECRET
python -c "import secrets; print(secrets.token_urlsafe(48))"   # JWT_REFRESH_SECRET
python -c "import secrets; print(secrets.token_urlsafe(48))"   # INTERNAL_API_SECRET
python -c "import secrets; print(secrets.token_urlsafe(48))"   # AUTH_SECRET
```

On Windows PowerShell, the same commands work with `python`; keep the four
values separate.

Production guardrails reject:

- JWT/internal secrets shorter than 32 characters or containing `change-me`
- `CORS_ORIGINS=*`
- `COOKIE_SECURE=false`
- `SEED_DEMO=true`

`ENVIRONMENT=production` activates these checks.

---

## 1. Supabase Free — database and storage

Full walkthrough: [`deploy/supabase/README.md`](../deploy/supabase/README.md).

1. Create a project at <https://supabase.com/dashboard>. Save the database
   password.
2. Open **SQL Editor → New query**, paste
   [`deploy/supabase/schema.sql`](../deploy/supabase/schema.sql), and click
   **Run**. This creates the tables, indexes, private `aether-files` bucket, and
   enables row-level security. It also stamps Alembic revision
   `40481f84bf69`.
3. Open **Project Settings → Database → Connection string → URI**, choose
   **Session pooler** (port `5432`), and copy the URI. Append
   `?sslmode=require` and URL-encode special characters in the password:

```text
postgresql+asyncpg://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

4. Open **Project Settings → API** and copy:
   - `SUPABASE_URL` — `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` secret (server-only)
5. Confirm the **Storage** page shows a private `aether-files` bucket. If not,
   create it manually (**Storage → New bucket → `aether-files`, Public off**).

> Use the **session pooler**, not the direct connection and not the transaction
> pooler on port 6543. Session mode is compatible with asyncpg's prepared
> statements. The API translates `sslmode=require` into asyncpg's `ssl` connect
> argument automatically.

Free plan limits: 500 MB database, 1 GB file storage, 5 GB egress, 2 active
projects. Free projects **pause after 1 week of inactivity** — open the
dashboard weekly or run a query to keep it awake.

---

## 2. Render Free — FastAPI API

Full walkthrough: [`deploy/render/README.md`](../deploy/render/README.md).

1. Sign up at <https://dashboard.render.com/register> with GitHub. The Hobby
   plan is free and does not ask for a card.
2. **New → Web Service** and select `FlameKaiser2201/aether-ai`, branch `main`.
3. Name the service (for example `aether-api-2201`). Render names are unique;
   the public URL is `https://<service-name>.onrender.com`.
4. Language **Docker**, region **Virginia (US East)** or the closest free
   region.
5. **Root Directory:** `apps/api`. **Dockerfile Path:** `Dockerfile`.
6. Compute: **Free** (`$0/month`, `0.1 CPU`, `512 MB RAM`).
7. **Advanced → Health Check Path:** `/health`.
8. Add the environment variables below with **Add from .env**. Mark secrets as
   secret values.

```text
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
ENABLE_API_DOCS=false
AUTO_CREATE_TABLES=false
COOKIE_SECURE=true
SEED_DEMO=false
TRUST_PROXY_HEADERS=true

APP_URL=https://<cloudflare-worker-url>
API_URL=https://<render-service-url>
CORS_ORIGINS=https://<cloudflare-worker-url>
TRUSTED_HOSTS=*

DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5

JWT_ACCESS_SECRET=<48-byte-random>
JWT_REFRESH_SECRET=<48-byte-random>
INTERNAL_API_SECRET=<48-byte-random>

REDIS_URL=
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_BUCKET=aether-files
```

`TRUSTED_HOSTS=*` disables Starlette's Host allow-list because Render's health
checker can use an internal `Host` header. The API is still protected by CORS
and the Worker proxy. If you prefer a strict list, use
`TRUSTED_HOSTS=*.onrender.com,localhost,127.0.0.1` and confirm the health check
still passes after the deploy.

`APP_URL` and `CORS_ORIGINS` need the Cloudflare Worker URL. Deploy the API
first, then the Worker, then update these two values and redeploy the API.

9. Click **Deploy web service**. The container waits for Supabase, runs
   `alembic upgrade head`, then starts Uvicorn on `$PORT` (8000). The Alembic
   path reuses the API's `_prepare_engine` helper, so `?sslmode=require` is
   translated into the `ssl` argument that `asyncpg` accepts.
10. Copy the public URL and verify:

```bash
curl https://<render-service-url>/health
# {"status":"ok","version":"1.0.0"}

curl https://<render-service-url>/api/v1/health/ready
```

The first request after 15 minutes of inactivity can take about 50 seconds while
the free instance wakes. Open `/health` once before a demo to warm it up.

Optional: add `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or
`GROQ_API_KEY` to enable live inference. The default quality chain is Claude
Sonnet via OpenRouter → GPT-4.1 → Gemini via OpenRouter → DeepSeek V4.1 →
Groq, with automatic cross-provider fallback. Confirm the detected provider:

```bash
curl https://<render-service-url>/api/v1/health/providers
```

A valid key reports `"demo_mode": false` and a non-empty `selected` map. Add
`TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY` for dedicated live
research, and `DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` for server-side voice
fallbacks.

---

## 3. Cloudflare Workers — Next.js frontend

Full walkthrough: [`deploy/cloudflare/README.md`](../deploy/cloudflare/README.md).

The configuration is already in the repository:

- `apps/web/wrangler.jsonc` — Worker name, OpenNext entrypoint, static assets,
  `nodejs_compat` flags.
- `apps/web/open-next.config.ts` — OpenNext config.
- `apps/web/package.json` — `build:cloudflare`, `preview`, `deploy:cloudflare`.

### 3.1 Authenticate Wrangler

```bash
cd apps/web
npx wrangler login
```

Or use an API token with **Workers Scripts: Edit**:

```bash
# bash
export CLOUDFLARE_API_TOKEN=...

# PowerShell
$env:CLOUDFLARE_API_TOKEN="..."
```

### 3.2 Set secrets

```bash
cd apps/web

npx wrangler secret put AUTH_SECRET
npx wrangler secret put API_URL
npx wrangler secret put AUTH_URL
npx wrangler secret put NEXTAUTH_URL
```

Values:

```text
AUTH_SECRET=<the 48-byte random value>
API_URL=https://<render-service-url>
AUTH_URL=https://aether-web.<your-subdomain>.workers.dev
NEXTAUTH_URL=https://aether-web.<your-subdomain>.workers.dev
```

`AUTH_URL` and `NEXTAUTH_URL` must match the Worker's public origin. If you do
not know the subdomain yet, deploy once with a placeholder, copy the printed
URL, then update both secrets and redeploy.

If you deploy the Workers-native edge API from `apps/edge-api`, the web Worker
calls it through the `API` service binding declared in `apps/web/wrangler.jsonc`.
The binding takes precedence over `API_URL`, which then only serves as a local
fallback. See [`EDGE_DEPLOYMENT.md`](EDGE_DEPLOYMENT.md).

### 3.3 Build and deploy

```bash
cd apps/web
npm ci
npm run deploy:cloudflare
```

On Windows, the OpenNext deploy wrapper can fail with `spawn UNKNOWN`. Bypass it
and call Wrangler directly:

```powershell
$env:OPEN_NEXT_DEPLOY = "true"
npx wrangler deploy
```

The first deploy prints the Worker URL:

```text
https://aether-web.<your-subdomain>.workers.dev
```

Open it, register an account, and test chat. If the Worker name `aether-web` is
taken in your account, change `name` in `apps/web/wrangler.jsonc` and redeploy.

If local Wrangler auth is inconvenient, run the manual **Deploy web to
Cloudflare** GitHub Actions workflow instead. Add the six repository secrets
listed in [`deploy/cloudflare/README.md`](../deploy/cloudflare/README.md), then
run it from **Actions → Deploy web to Cloudflare → Run workflow**.

### 3.4 Wire the API back to the Worker

Update the Render API environment:

```text
APP_URL=https://aether-web.<your-subdomain>.workers.dev
CORS_ORIGINS=https://aether-web.<your-subdomain>.workers.dev
```

Redeploy the API service. `API_URL` on the API stays its own Render URL.

### 3.5 Custom domain (optional)

1. Cloudflare Dashboard → **Workers & Pages → aether-web → Settings → Domains &
   Routes → Add → Custom domain**.
2. Enter the hostname and let Cloudflare create the DNS record.
3. Update `AUTH_URL` and `NEXTAUTH_URL` on the Worker, and `APP_URL` /
   `CORS_ORIGINS` on the API, to the custom domain.
4. Redeploy both.

---

## 4. Verify the full stack

Run these in order:

```bash
# API health and database readiness
curl https://<render-service-url>/health
curl https://<render-service-url>/api/v1/health/ready

# Web tier
curl -I https://<worker-url>
```

Then in the browser:

1. Open the Worker URL and register a new account.
2. Send a chat message. With a valid AI key you should see streamed tokens from
   the selected real model; otherwise you get a clearly labelled local fallback
   response.
3. Open **Files** and upload a PDF/text file. Confirm the row in
   `files` and the object in the Supabase `aether-files` bucket.
4. Create a conversation, memory, and task; reload the page to confirm they
   persist.
5. Use **Voice** in Chrome/Edge and allow microphone access. Browser speech
   works without any server key.
6. Check the Render logs for `Database tables verified` / migration output and
   no repeated connection errors.

---

## 5. Environment reference

### API (Render)

| Variable | Required | Value |
| --- | --- | --- |
| `ENVIRONMENT` | yes | `production` |
| `DATABASE_URL` | yes | Supabase session-pooler URL with `?sslmode=require` |
| `JWT_ACCESS_SECRET` | yes | unique 48-byte random |
| `JWT_REFRESH_SECRET` | yes | unique 48-byte random |
| `INTERNAL_API_SECRET` | yes | unique 48-byte random |
| `APP_URL` | yes | Cloudflare Worker origin |
| `API_URL` | yes | Render public origin |
| `CORS_ORIGINS` | yes | Cloudflare Worker origin |
| `TRUSTED_HOSTS` | yes | `*` (or `*.onrender.com` after testing the health check) |
| `COOKIE_SECURE` | yes | `true` |
| `AUTO_CREATE_TABLES` | yes | `false` (Alembic owns the schema) |
| `ENABLE_API_DOCS` | recommended | `false` |
| `SEED_DEMO` | yes | `false` |
| `TRUST_PROXY_HEADERS` | yes | `true` on Render |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | recommended | `5` / `5` on the free tier |
| `STORAGE_BACKEND` | yes | `supabase` |
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | service-role secret (server-only) |
| `SUPABASE_BUCKET` | yes | `aether-files` |
| `REDIS_URL` | optional | empty uses the in-process limiter/cache |
| Provider/search/voice keys | optional | enables real AI, research, and server voice |

### Web (Cloudflare Worker)

| Variable | Required | Value |
| --- | --- | --- |
| `AUTH_SECRET` | yes | unique 48-byte random |
| `API_URL` | yes | Render public origin |
| `AUTH_URL` | yes | Worker public origin |
| `NEXTAUTH_URL` | yes | Worker public origin |

Set these with `npx wrangler secret put <NAME>`. Do not put real secrets in
`wrangler.jsonc`, and do not prefix them with `NEXT_PUBLIC_`.

---

## 6. Database migrations

Alembic owns the schema.

```bash
cd apps/api
alembic upgrade head
alembic current
alembic history
```

The Render Docker command runs `alembic upgrade head` with retries before
starting Uvicorn. The Supabase `schema.sql` already stamps the initial revision,
so the first boot is a no-op.

After changing models:

```bash
cd apps/api
alembic revision --autogenerate -m "describe the change"
# review the generated file before committing
alembic upgrade head
```

Production rules:

- Keep `AUTO_CREATE_TABLES=false`.
- Run migrations during release, or rely on the container's startup command.
- Back up Supabase before destructive migrations.
- Never edit an applied migration; add a new one.
- If you add a migration, the container applies it automatically on the next
  deploy. Do not re-run `schema.sql` as a migration tool; it only bootstraps the
  initial revision.

SQLite remains supported for local development and tests only.

---

## 7. Local Docker Compose (optional)

The full stack still runs locally with PostgreSQL, Redis, the API, and the web
tier:

```bash
cp .env.example .env
# edit secrets and provider keys
docker compose up --build -d
docker compose logs -f api
```

Open <http://localhost:3000>. The API is at <http://localhost:8000> and its docs
at <http://localhost:8000/docs> when `ENABLE_API_DOCS=true`.

With `SEED_DEMO=true`, the demo account is:

```text
Email:    demo@aether.local
Password: AetherDemo!2026
```

Useful commands:

```bash
docker compose ps
docker compose logs -f web
docker compose exec api alembic current
docker compose exec api alembic upgrade head
docker compose down            # keep data
docker compose down -v         # delete volumes (destructive)
```

---

## 8. Optional deployment targets

These are not part of the free stack but remain in the repository:

| Target | Configuration | Notes |
| --- | --- | --- |
| Docker Compose | `docker-compose.yml` | Full local/production-like stack |
| Railway | `railway.json`, `infra/railway/Dockerfile`, `apps/web/railway.json` | Paid after trial credits |
| Vercel (web only) | `apps/web/vercel.json` | Hobby plan; API must be hosted elsewhere |
| Fly.io / ECS / VPS | `apps/api/Dockerfile`, `apps/web/Dockerfile` | Use any container host |

Render Free is the recommended API target and is configured manually; the old
`render.yaml` Blueprint was removed.

---

## 9. Production checklist

- [ ] All secrets are unique, 32+ characters, stored as platform secrets, and
      rotated on a schedule.
- [ ] `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `ENABLE_API_DOCS=false`,
      `SEED_DEMO=false`, `AUTO_CREATE_TABLES=false`.
- [ ] `AUTH_URL` and `NEXTAUTH_URL` match the Worker's public HTTPS origin.
- [ ] `CORS_ORIGINS` lists exact origins (no `*`).
- [ ] `TRUSTED_HOSTS` is `*` or a tested `*.onrender.com` allow-list.
- [ ] `TRUST_PROXY_HEADERS=true` because Render terminates TLS.
- [ ] Supabase `schema.sql` has been run; RLS is enabled on all AETHER tables.
- [ ] The `aether-files` bucket is **private**.
- [ ] `STORAGE_BACKEND=supabase`; no uploads rely on local disk.
- [ ] Supabase project is opened at least weekly so the free project does not
      pause.
- [ ] `/health` and `/api/v1/health/ready` are monitored.
- [ ] Provider keys are scoped and spend-limited.
- [ ] Account deletion, file deletion, and memory wipe have been tested.
- [ ] Rate limits fit expected traffic.
- [ ] Dependencies are updated and `npm audit` / `pip-audit` are reviewed.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `400 Invalid host header` | `TRUSTED_HOSTS` missing the public hostname | Use `*` or add the Render hostname only (no scheme/path) |
| `database migration failed after 30 attempts` | Wrong `DATABASE_URL`, Supabase paused, or TLS issue | Check the session-pooler host, URL-encoded password, and `?sslmode=require` |
| `asyncpg` rejects `sslmode` | URL was passed to a driver that does not translate it | Use this repo's `database.py`, which moves `sslmode` into `connect_args` |
| `401` loop in the web app | `AUTH_SECRET` differs between deploys, or `API_URL` is wrong | Keep `AUTH_SECRET` stable and check the Worker secrets |
| `UntrustedHost` from Auth.js | `AUTH_URL`/`NEXTAUTH_URL` do not match the request origin | Set both to the Worker's public HTTPS URL and redeploy |
| Worker returns `Error 1102` | 10 ms CPU limit exceeded on Workers Free | Reduce SSR work, cache pages, or move the web tier to Vercel Hobby |
| Browser CORS error | Direct cross-origin call and origin not listed | Use `/api/proxy` or add the exact Worker origin to `CORS_ORIGINS` |
| Uploads fail | No persistent disk or Supabase not configured | Set `STORAGE_BACKEND=supabase` and the three `SUPABASE_*` values |
| Supabase storage upload `403` | Wrong key or public/private bucket mismatch | Use the service-role key and a private bucket |
| Answers use the local fallback | No valid AI provider configured | Add `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GROQ_API_KEY`, then check `/api/v1/health/providers` |
| Research returns no sources | No search provider configured | Add Tavily/Brave/Serper/SearXNG |
| `429` responses | Rate limit reached | Wait for `Retry-After` or raise limits |
| Render build fails | Wrong Dockerfile path/root directory | Use root directory `apps/api` and Dockerfile `Dockerfile` |
| Render returns `502` on first request | Free instance is waking after 15 minutes idle | Wait ~50 seconds and retry; open `/health` before a demo |
| Supabase project paused | Free plan inactivity | Open the dashboard and restore the project |

---

## 11. Free-tier limits and cost

| Service | Free allowance | What it means for AETHER |
| --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day, 10 ms CPU/request, 128 MB | Fine for a demo/small deployment; heavy SSR can hit the CPU cap |
| Render Free | 750 instance hours/month, 512 MB RAM, 0.1 CPU | One API service fits; it sleeps after 15 min idle and wakes in ~50 s |
| Supabase Free | 500 MB DB, 1 GB storage, 5 GB egress, 2 projects | Enough for conversations, files, and memories; pauses after 1 week idle |
| AI providers | Pay-per-use (optional) | AETHER runs in labelled local fallback mode with no valid key; add one key for real inference |

Total monthly cost for the stack: **$0** (excluding optional AI/search/voice
provider usage).

---

## 12. Deployment matrix

| Platform | API | Web | Database | Notes |
| --- | --- | --- | --- | --- |
| **Cloudflare + Render + Supabase** | ✅ | ✅ | Supabase Free | **Recommended free stack** |
| Docker Compose | ✅ | ✅ | PostgreSQL container | Full local/production-like stack |
| Railway | ✅ | ✅ | Railway PostgreSQL | Paid after trial credits |
| Vercel | external | ✅ | external | Web only; use Supabase + a free API host |
| Fly.io / ECS / VPS | ✅ | ✅ | managed/self-hosted | Use the Docker images |
| Render | ✅ | ❌ | Supabase Free | Manual Docker web service; the Blueprint was removed |
