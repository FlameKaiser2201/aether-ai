# Deployment guide

AETHER deploys on a **100% free** stack:

| Layer | Service | Free plan |
| --- | --- | --- |
| Frontend | **Cloudflare Workers** (Next.js 15 via OpenNext) | 100,000 requests/day, 10 ms CPU/request |
| API | **Northflank Sandbox** (FastAPI Docker container) | 2 services, always on, no card, up to $20/month of compute |
| Database | **Supabase Free** PostgreSQL | 500 MB database, 5 GB egress |
| File storage | **Supabase Free** Storage | 1 GB, private bucket |

```text
Browser
  │  HTTPS
  ▼
Cloudflare Worker  ── server-side fetch ──►  Northflank Sandbox
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

### Hugging Face Spaces is not used

Hugging Face now requires a paid plan (PRO for personal accounts) to create
Docker Spaces. Northflank Sandbox is free, requires no card, includes two
services, and **does not sleep** — which matters for chat streaming and voice.

### Render is not used

The old `render.yaml` Blueprint has been removed. It created two Starter web
services (about $14/month) and a free Postgres that expired after 30 days. The
new stack is $0 and the database does not expire.

---

## Prerequisites

- GitHub account with the repository (public:
  <https://github.com/FlameKaiser2201/aether-ai>).
- [Cloudflare](https://dash.cloudflare.com/sign-up) account (free).
- [Northflank](https://app.northflank.com/signup) account (free Sandbox, no
  card).
- [Supabase](https://supabase.com/dashboard) account (free).
- Node.js 20+ (22 recommended) and Python 3.12+ for local builds.
- Optional: an AI provider key (DeepSeek, OpenAI, Groq, OpenRouter) and search
  / voice keys. Without them the app runs in clearly labelled demo mode.

Generate the secrets now — you will paste them into Northflank and Cloudflare:

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

## 2. Northflank Sandbox — FastAPI API

Full walkthrough: [`deploy/northflank/README.md`](../deploy/northflank/README.md).

1. Sign up at <https://app.northflank.com/signup> with GitHub. Choose the
   **Sandbox** plan (free, no card).
2. Create a project in the region closest to Supabase.
3. **Create → Service → Combined service**.
4. Connect `FlameKaiser2201/aether-ai`, branch `main`.
5. Build options:
   - **Build type:** Dockerfile
   - **Dockerfile path:** `apps/api/Dockerfile`
   - **Build context:** `apps/api`
6. Add a **public HTTP port** on `8000`, name it `api`.
7. Resources: keep the Sandbox default, or choose **0.5 vCPU / 1 GB** if
   available. The API fits in 512 MB; 1 GB makes Argon2 logins faster.
8. Health check: `GET /health`, port `8000`, initial delay 30s.
9. Add the environment variables below in **Service → Environment**. Mark
   secrets as **secret**, not plain variables.

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
API_URL=https://<northflank-service-url>
CORS_ORIGINS=https://<cloudflare-worker-url>
TRUSTED_HOSTS=<northflank-service-host>

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

`TRUSTED_HOSTS` is a hostname only: no `https://`, no path, no port. It is the
host from the Northflank public DNS.

`APP_URL` and `CORS_ORIGINS` need the Cloudflare Worker URL. Deploy the API
first, then the Worker, then update these two values and redeploy the API.

10. Click **Create service** / **Build now**. The container waits for Supabase,
    runs `alembic upgrade head`, then starts Uvicorn on port 8000.
11. Copy the public DNS from **Networking**. Verify:

```bash
curl https://<northflank-service-url>/health
# {"status":"ok","version":"1.0.0"}

curl https://<northflank-service-url>/api/v1/health/ready
```

Optional: add `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, or
`OPENROUTER_API_KEY` to leave demo mode. Add `TAVILY_API_KEY` /
`BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY` for live research, and
`DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` for server-side voice fallbacks.

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
API_URL=https://<northflank-service-url>
AUTH_URL=https://aether-web.<your-subdomain>.workers.dev
NEXTAUTH_URL=https://aether-web.<your-subdomain>.workers.dev
```

`AUTH_URL` and `NEXTAUTH_URL` must match the Worker's public origin. If you do
not know the subdomain yet, deploy once with a placeholder, copy the printed
URL, then update both secrets and redeploy.

### 3.3 Build and deploy

```bash
cd apps/web
npm ci
npm run deploy:cloudflare
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

Update the Northflank API environment:

```text
APP_URL=https://aether-web.<your-subdomain>.workers.dev
CORS_ORIGINS=https://aether-web.<your-subdomain>.workers.dev
```

Redeploy the API service. `API_URL` on the API stays its own Northflank URL.

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
curl https://<northflank-service-url>/health
curl https://<northflank-service-url>/api/v1/health/ready

# Web tier
curl -I https://<worker-url>
```

Then in the browser:

1. Open the Worker URL and register a new account.
2. Send a chat message. You should see streamed tokens (or a clearly labelled
   demo response if no AI key is configured).
3. Open **Files** and upload a PDF/text file. Confirm the row in
   `files` and the object in the Supabase `aether-files` bucket.
4. Create a conversation, memory, and task; reload the page to confirm they
   persist.
5. Use **Voice** in Chrome/Edge and allow microphone access. Browser speech
   works without any server key.
6. Check the Northflank logs for `Database tables verified` / migration output
   and no repeated connection errors.

---

## 5. Environment reference

### API (Northflank)

| Variable | Required | Value |
| --- | --- | --- |
| `ENVIRONMENT` | yes | `production` |
| `DATABASE_URL` | yes | Supabase session-pooler URL with `?sslmode=require` |
| `JWT_ACCESS_SECRET` | yes | unique 48-byte random |
| `JWT_REFRESH_SECRET` | yes | unique 48-byte random |
| `INTERNAL_API_SECRET` | yes | unique 48-byte random |
| `APP_URL` | yes | Cloudflare Worker origin |
| `API_URL` | yes | Northflank public origin |
| `CORS_ORIGINS` | yes | Cloudflare Worker origin |
| `TRUSTED_HOSTS` | yes | Northflank hostname only |
| `COOKIE_SECURE` | yes | `true` |
| `AUTO_CREATE_TABLES` | yes | `false` (Alembic owns the schema) |
| `ENABLE_API_DOCS` | recommended | `false` |
| `SEED_DEMO` | yes | `false` |
| `TRUST_PROXY_HEADERS` | yes | `true` on Northflank |
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
| `API_URL` | yes | Northflank public origin |
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

The Northflank Docker command runs `alembic upgrade head` with retries before
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

Render is **not** a supported target. The old `render.yaml` was removed.

---

## 9. Production checklist

- [ ] All secrets are unique, 32+ characters, stored as platform secrets, and
      rotated on a schedule.
- [ ] `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `ENABLE_API_DOCS=false`,
      `SEED_DEMO=false`, `AUTO_CREATE_TABLES=false`.
- [ ] `AUTH_URL` and `NEXTAUTH_URL` match the Worker's public HTTPS origin.
- [ ] `CORS_ORIGINS` lists exact origins (no `*`).
- [ ] `TRUSTED_HOSTS` lists the Northflank hostname only.
- [ ] `TRUST_PROXY_HEADERS=true` because Northflank terminates TLS.
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
| `400 Invalid host header` | `TRUSTED_HOSTS` missing the public hostname | Add the Northflank hostname only (no scheme/path) |
| `database migration failed after 30 attempts` | Wrong `DATABASE_URL`, Supabase paused, or TLS issue | Check the session-pooler host, URL-encoded password, and `?sslmode=require` |
| `asyncpg` rejects `sslmode` | URL was passed to a driver that does not translate it | Use this repo's `database.py`, which moves `sslmode` into `connect_args` |
| `401` loop in the web app | `AUTH_SECRET` differs between deploys, or `API_URL` is wrong | Keep `AUTH_SECRET` stable and check the Worker secrets |
| `UntrustedHost` from Auth.js | `AUTH_URL`/`NEXTAUTH_URL` do not match the request origin | Set both to the Worker's public HTTPS URL and redeploy |
| Worker returns `Error 1102` | 10 ms CPU limit exceeded on Workers Free | Reduce SSR work, cache pages, or move the web tier to Vercel Hobby |
| Browser CORS error | Direct cross-origin call and origin not listed | Use `/api/proxy` or add the exact Worker origin to `CORS_ORIGINS` |
| Uploads fail | No persistent disk or Supabase not configured | Set `STORAGE_BACKEND=supabase` and the three `SUPABASE_*` values |
| Supabase storage upload `403` | Wrong key or public/private bucket mismatch | Use the service-role key and a private bucket |
| Answers say "demo mode" | No AI provider configured | Add `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / etc. |
| Research returns no sources | No search provider configured | Add Tavily/Brave/Serper/SearXNG |
| `429` responses | Rate limit reached | Wait for `Retry-After` or raise limits |
| Northflank build fails | Wrong Dockerfile path/context | Use `apps/api/Dockerfile` and context `apps/api` |
| Supabase project paused | Free plan inactivity | Open the dashboard and restore the project |

---

## 11. Free-tier limits and cost

| Service | Free allowance | What it means for AETHER |
| --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day, 10 ms CPU/request, 128 MB | Fine for a demo/small deployment; heavy SSR can hit the CPU cap |
| Northflank Sandbox | 2 services, 2 jobs, 1 database, up to $20/month compute | One always-on API service fits comfortably; no horizontal scaling |
| Supabase Free | 500 MB DB, 1 GB storage, 5 GB egress, 2 projects | Enough for conversations, files, and memories; pauses after 1 week idle |
| AI providers | Pay-per-use (optional) | AETHER runs in demo mode with no keys; add a key for real inference |

Total monthly cost for the stack: **$0** (excluding optional AI/search/voice
provider usage).

---

## 12. Deployment matrix

| Platform | API | Web | Database | Notes |
| --- | --- | --- | --- | --- |
| **Cloudflare + Northflank + Supabase** | ✅ | ✅ | Supabase Free | **Recommended free stack** |
| Docker Compose | ✅ | ✅ | PostgreSQL container | Full local/production-like stack |
| Railway | ✅ | ✅ | Railway PostgreSQL | Paid after trial credits |
| Vercel | external | ✅ | external | Web only; use Supabase + a free API host |
| Fly.io / ECS / VPS | ✅ | ✅ | managed/self-hosted | Use the Docker images |
| Render | ❌ | ❌ | ❌ | Blueprint removed; not part of this stack |
