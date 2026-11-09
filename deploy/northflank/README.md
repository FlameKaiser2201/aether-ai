# Northflank Sandbox — free FastAPI host

AETHER's API runs as a Docker service on **Northflank Sandbox**. The Sandbox is
free, requires no credit card, includes **2 services**, **2 jobs**, **1
database**, and up to **$20/month of compute**, and — unlike most free Python
hosts — does **not sleep** on idle.

> Hugging Face Docker Spaces now require a paid plan (PRO for personal
> accounts), and Koyeb no longer offers a free tier. Northflank Sandbox is the
> best remaining no-card, always-on option for the FastAPI container.

## 1. Create the service

1. Sign up at <https://app.northflank.com/signup> (GitHub sign-in is fine; no
   card).
2. Create a **project** in the region closest to your Supabase project.
3. **Create → Service → Combined service**.
4. Connect the `FlameKaiser2201/aether-ai` repository and select the `main`
   branch.
5. Build options:
   - **Build type:** Dockerfile
   - **Dockerfile path:** `apps/api/Dockerfile`
   - **Build context:** `apps/api`
6. Networking: add a **public HTTP port** on **8000** (name it `api`). The
   Dockerfile already exposes 8000.
7. Resources: keep the Sandbox default, or choose **0.5 vCPU / 1 GB**
   (`nf-compute-50`) if the plan allows it. The API fits in 512 MB, but Argon2
   logins are noticeably faster with 1 GB.
8. Health check: HTTP `GET /health`, port `8000`, initial delay 30s.
9. Create the service. The first Docker build takes a few minutes.

Copy the public DNS shown on the service's **Networking** page. It looks like:

```text
https://<service>-<project>.<region>.northflank.app
```

That is your `API_URL`. Use only the hostname (no `https://`, no path) for
`TRUSTED_HOSTS`.

## 2. Set environment variables

In **Service → Environment**, add these. Mark every secret as a **secret**, not
a plain variable.

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

Generate the secrets locally:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run it three times — one value each for `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `INTERNAL_API_SECRET`.

`APP_URL` and `CORS_ORIGINS` need the Cloudflare Worker URL. Deploy the API
first, then the Worker, then come back and update these two values.

Optional: add an AI provider key (`DEEPSEEK_API_KEY`, `OPENAI_API_KEY`,
`GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_ENABLED=true`) to leave demo
mode. Add `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY` for live
research, and `DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` for server-side voice.

## 3. Deploy and verify

Northflank builds and deploys automatically on every push to `main` once CI is
enabled. You can also click **Build now**.

```bash
curl https://<northflank-service-url>/health
# {"status":"ok","version":"1.0.0"}

curl https://<northflank-service-url>/api/v1/health/ready
```

The container command waits for Supabase, runs `alembic upgrade head`, and then
starts Uvicorn on `$PORT` (8000). If the build succeeds but the service crashes,
open the deployment logs — the usual cause is a malformed `DATABASE_URL` or a
missing secret.

## 4. Free-plan notes

- **Always on:** Sandbox services do not sleep, so voice and chat work without a
  cold start.
- **One instance:** the Sandbox does not support horizontal scaling. The API
  uses in-process rate limiting and caching when `REDIS_URL` is empty, which is
  correct for a single instance.
- **Ephemeral disk:** do not use `STORAGE_BACKEND=local`. Supabase Storage keeps
  uploads.
- **No SLA:** the Sandbox is intended for development and prototypes. Back up
  Supabase regularly (or export it) and expect occasional platform restarts.
- **Cost guard:** the Sandbox includes up to $20/month of resources. One small
  always-on service stays well inside that. Do not add replicas or large compute
  plans.
