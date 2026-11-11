# Render Free — free FastAPI host

AETHER's API runs as a Docker web service on **Render Free**. Render's Hobby
workspace requires **no credit card** and includes **750 free instance hours per
month** across the workspace. One API service fits inside that allowance.

Free web services **spin down after 15 minutes of inactivity**. The next request
takes about **50 seconds** to wake the container. The Cloudflare Worker proxies
API calls, so the first request after a quiet period can be slow. Open
`https://<service-name>.onrender.com/health` once before a demo to warm it up.

> Northflank's pricing page says "No card needed", but its service creation form
> now requires a card even for the free Sandbox plan. Railway Free includes only
> `$1/month` of usage credit; an always-on 0.5 GB service costs roughly
> `$5/month` in RAM alone. Render Free is the practical no-card option.

## 1. Create the service

1. Sign up at <https://dashboard.render.com/register> with GitHub. The Hobby
   plan is free and does not ask for a card.
2. Click **New → Web Service**.
3. Select the public repository `FlameKaiser2201/aether-ai` and the `main`
   branch.
4. **Name:** `aether-api-2201` (Render names are unique; your public URL will
   be `https://<name>.onrender.com`).
5. **Language:** Docker. **Region:** Virginia (US East) or the closest free
   region.
6. **Root Directory:** `apps/api`.
7. **Dockerfile Path:** `Dockerfile`.
8. **Compute:** select the **Free** plan — `$0/month`, `0.1 CPU`, `512 MB RAM`.
9. Open **Advanced → Health Check Path** and enter `/health`.
10. Add the environment variables from section 2.
11. Click **Deploy web service**. The first Docker build takes about 5 minutes.

The public URL is:

```text
https://<service-name>.onrender.com
```

That value is the API's `API_URL`.

## 2. Environment variables

In **Environment**, use **Add from .env** and paste the block below. Replace the
placeholders. Mark every secret as a secret value; never commit real values.

```text
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
APP_URL=https://<cloudflare-worker-url>
API_URL=https://<render-service-url>
CORS_ORIGINS=https://<cloudflare-worker-url>
TRUSTED_HOSTS=*
ENABLE_API_DOCS=false
TRUST_PROXY_HEADERS=true

DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
AUTO_CREATE_TABLES=false

JWT_ACCESS_SECRET=<48-byte-random>
JWT_REFRESH_SECRET=<48-byte-random>
INTERNAL_API_SECRET=<48-byte-random>

COOKIE_SECURE=true
SEED_DEMO=false
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_BUCKET=aether-files
```

`TRUSTED_HOSTS=*` disables Starlette's Host allow-list. Render's health checker
can use an internal `Host` header, and the API is still protected by CORS and the
Worker proxy. If you prefer a strict list, use
`TRUSTED_HOSTS=*.onrender.com,localhost,127.0.0.1` and confirm the health check
still passes after the deploy.

Generate the three API secrets locally:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run it three times — one value each for `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `INTERNAL_API_SECRET`.

`APP_URL` and `CORS_ORIGINS` need the Cloudflare Worker URL. Deploy the API
first, then the Worker, then update these two values if the Worker URL differs
from the placeholder. `API_URL` is the API's own Render URL.

Optional keys:

- AI: add at least one of `OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
  `DEEPSEEK_API_KEY`, or `GROQ_API_KEY`. The default quality chain is Claude
  Sonnet via OpenRouter → GPT-4.1 → Gemini via OpenRouter → DeepSeek V4.1 →
  Groq. Every configured provider remains available as a fallback, and a
  failure moves to the next candidate automatically. Override provider order
  with `PROVIDER_PRIORITY`; override model IDs with the per-provider
  `*_FAST_MODEL`, `*_BALANCED_MODEL`, `*_REASONING_MODEL` and `*_CODING_MODEL`
  variables.
- Research: `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, or `SERPER_API_KEY`.
  DuckDuckGo HTML search works without a key.
- Server voice fallbacks: `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`.

Add the key in **Environment**, save, and let Render redeploy. No other switch
is needed: startup detects and validates the key, selects the strongest
available model, and disables the local fallback automatically. Invalid or
placeholder keys are skipped with a warning. `DEMO_MODE=true` never overrides a
valid provider key.

Without a valid AI key the API starts in clearly labelled local fallback mode;
chat streaming, memory, tasks, files, and browser voice still work.

## 3. Deploy and verify

Render builds automatically on every push to `main`. You can also click
**Manual Deploy → Deploy latest commit**.

```bash
curl https://<render-service-url>/health
# {"status":"ok","name":"AETHER","version":"1.0.0","demo_mode":false}

curl https://<render-service-url>/api/v1/health/ready

# Confirm the detected provider and selected models. Never returns key values.
curl https://<render-service-url>/api/v1/health/providers
```

With a valid key, `/api/v1/health/providers` should report `"demo_mode": false`,
a non-empty `priority`, a `selected` map, and no validation issues. Startup logs
also list each detected provider and its model IDs.

The container command waits for Supabase, runs `alembic upgrade head`, and then
starts Uvicorn on `$PORT` (8000). The migration path reuses the API's
`_prepare_engine` helper, which translates `?sslmode=require` into the `ssl`
connect argument that `asyncpg` accepts.

If the build succeeds but the service crashes, open **Logs**. The usual causes
are a malformed `DATABASE_URL`, a missing secret, or a Supabase project that is
paused.

## 4. Free-plan notes

- **750 instance hours/month** are shared by every free service in the
  workspace. One always-on service uses about 744 hours in a 31-day month, so
  avoid running a second free service continuously.
- **Spin-down:** free services sleep after 15 minutes without traffic. The first
  request can take about 50 seconds. Warm the API before a demo, or add an
  external keep-warm ping if cold starts are unacceptable.
- **512 MB RAM / 0.1 CPU:** enough for the API. Argon2 logins are slower than on
  a paid instance but remain within request timeouts.
- **No persistent disk, shell, SSH, or horizontal scaling** on the free plan.
  Uploads must use Supabase Storage (`STORAGE_BACKEND=supabase`).
- **500 pipeline minutes/month:** the Docker build uses a few minutes per
  deploy. Keep the root directory narrow (`apps/api`) so unrelated commits do
  not rebuild the API.
- **No card:** the Hobby workspace shows `No card on file` and `$0.00` projected
  spend.
