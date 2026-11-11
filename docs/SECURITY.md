# Security

AETHER handles conversations, personal memory, uploaded documents and API keys.
This document describes the controls in the repository, the threat model, and
the operational checks required before exposing an instance publicly.

---

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** advisory flow on
[`FlameKaiser2201/aether-ai`](https://github.com/FlameKaiser2201/aether-ai).
Do not open a public issue for an unpatched vulnerability. Include a minimal
reproduction, affected version/commit and impact assessment.

Supported version: the `main` branch and the latest tagged release.

---

## Threat model

| Asset | Threat | Primary controls |
| --- | --- | --- |
| User accounts | Credential stuffing, brute force | Argon2id, login throttling, generic errors, rate limits |
| Sessions | Token theft or replay | Short-lived access JWT, rotating refresh tokens, HTTP-only encrypted Auth.js cookie |
| User data | Cross-tenant access | Every query is scoped by `user_id`; ownership checks on files, conversations, sessions and tasks |
| API keys | Leakage to the browser | Server-only env vars, proxy routes, no `NEXT_PUBLIC_*` secrets, secret scanning |
| Uploaded files | Malicious content, path traversal | Extension + magic-byte validation, size caps, filename sanitisation, private storage keys |
| Web research | SSRF, prompt injection, secret leakage | Public-URL validation, response size caps, content treated as untrusted evidence |
| Generated code | Unsafe or broken output | Static validation, security scans, one repair round, no execution |
| Abuse | Cost exhaustion, scraping | Per-IP/per-user rate limits, provider timeouts, output caps, optional Redis |

AETHER does **not** execute user code, shell commands or model-generated code.
It does not grant the model direct database, filesystem or network tools beyond
the explicitly implemented search, file and voice services.

---

## Authentication

- Passwords are hashed with Argon2id (`time_cost=3`, `memory_cost=65536`,
  `parallelism=4`) and transparently rehashed when parameters change.
- Passwords require 10–128 characters with lowercase, uppercase and a digit.
- Login failures are throttled per email + IP. Repeated failures return `429`
  with `Retry-After`.
- Access tokens are HS256 JWTs valid for 15 minutes by default and include
  `sub`, `type`, `iat`, `exp` and `jti`.
- Refresh tokens are stored only as SHA-256 hashes in the database. Rotation is
  single-use; reuse of an old token revokes the token family.
- The web tier uses Auth.js (NextAuth v5) with a JWT session strategy. The
  backend token pair is stored inside the encrypted, HTTP-only session cookie.
  Browser JavaScript never receives the backend tokens.
- `POST /auth/oauth` is an internal bridge protected by `X-Internal-Secret`;
  it is not intended for browser use.
- Account deletion cascades conversations, messages, memories, tasks, files,
  study sets, interview sessions, refresh tokens and usage records.

### Cookie and CSRF posture

- Auth.js sets `HttpOnly`, `SameSite=Lax` cookies and uses its own CSRF token
  for sign-in/sign-out.
- The web app calls the API through a same-origin route (`/api/proxy/*`), so no
  cross-origin credentials are required.
- FastAPI CORS uses explicit origins and `allow_credentials=False`.
- Set `COOKIE_SECURE=true` and serve over HTTPS in production.
- Do not add wildcard origins or disable CSRF protections.

---

## Authorization and tenant isolation

Every protected route resolves the current user from a verified access token.
Reads and writes include `user_id` in the query, and mutations verify ownership
before changing or deleting a record. File downloads, conversation exports,
interview sessions, memory records, tasks and study sets all enforce ownership.

Storage keys are namespaced as `<user_id>/<file_id><extension>`. The storage
service only accepts sanitised components and never joins user-controlled paths
without validation.

---

## Input validation and output handling

- Pydantic v2 validates every request body, query parameter and path value.
  Lengths, enums, numeric ranges and email formats are bounded.
- Unknown fields are rejected or ignored according to the schema; details are
  returned in a stable error envelope with a request ID.
- Control characters are stripped from text. Filenames are normalised, stripped
  of path components and restricted to a safe character set.
- Markdown is rendered by `react-markdown` without raw HTML. Raw HTML is not
  enabled, so model or user content cannot inject markup through the renderer.
- React escapes text by default. The CSP blocks inline script execution except
  the nonce-less inline styles/scripts required by Next.js in this configuration;
  tighten it further with a nonce-based policy if your deployment requires it.
- The API never reflects secrets, stack traces or provider payloads to clients.
  Unhandled exceptions return a generic message plus a request ID.

### Security headers

`apps/web/next.config.ts` sets:

- `Content-Security-Policy` with `default-src 'self'`, explicit font/image/media
  sources, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` allowing microphone only for the app origin

`X-Frame-Options` and CSP together prevent clickjacking. Add HSTS at the TLS
terminator or reverse proxy.

---

## Rate limiting and abuse prevention

The ASGI middleware applies buckets before routing:

| Bucket | Default |
| --- | --- |
| Auth (`/auth/login`, `/auth/register`, `/auth/refresh`) | 10/min |
| Chat (`/chat*`) | 30/min |
| Upload (`POST /files`) | 60/hour |
| General API | 120/min |

Identity is the authenticated user when a valid access token is present,
otherwise the client IP. Responses include `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Retry-After` on `429`.

Redis provides a shared counter across replicas. Without Redis, the fallback is
in-process: correct for a single instance, but not globally consistent across
replicas. Use Redis for horizontal scaling.

Provider calls have a configurable timeout (`PROVIDER_TIMEOUT_SECONDS`, default
120 s) and output token caps. File uploads are limited by
`MAX_UPLOAD_MB` (default 25 MB) and chunk counts.

---

## File upload security

- Supported extensions: PDF, DOCX, XLSX/XLSM, CSV, JSON, TXT, MD, LOG, YAML,
  HTML, XML and common images.
- Magic bytes are checked for PDFs (`%PDF-`), Office ZIP containers (`PK\x03\x04`)
  and images (`PIL.Image.verify`).
- Empty files and oversized files are rejected.
- PDFs are capped at 300 pages; spreadsheets at 5,000 rows; extracted text at
  2,000,000 characters.
- Files are stored privately. Downloads require authentication and ownership.
- File contents are treated as untrusted data, not instructions. Prompt text
  instructs the model to use only supplied evidence.
- AETHER does not execute uploaded files or generated code. For high-assurance
  environments, add an external malware scanner before storage.
- Deleted files are removed from storage and their chunks are cascaded.

---

## Web research and SSRF

`validate_public_url` rejects non-HTTP(S) schemes and private, loopback,
link-local, multicast and reserved addresses, including IPv6 forms. Research
page fetches are capped at 2 MB and only the first configured number of sources
is read. Search snippets and page text are inserted into the prompt as
untrusted evidence and cannot cause tool execution.

Without a search provider, AETHER falls back to DuckDuckGo HTML search. If that
is unavailable, research mode explains the limitation rather than inventing
sources or citations. Secrets are scrubbed from fetched text before it is used.

---

## Prompt injection and model safety

- System prompts establish that retrieved pages, documents and memories are
  data, not instructions.
- The capability guard detects requests for unsupported actions (for example
  real-time control of external systems, guaranteed predictions, or illegal
  activity) and returns an honest limitation instead of fabricating capability.
- Citations are produced from actual search results. The model is instructed
  not to invent sources.
- Generated code is scanned for dangerous patterns, placeholders, syntax issues,
  unbalanced delimiters and security smells. A single repair round is attempted;
  if validation still fails, the report is returned to the user.
- Model output is never trusted as HTML or executed as code.

No guard is perfect. Treat model output as untrusted content in downstream
systems, and keep provider keys scoped and spend-limited.

---

## Secrets management

- All secrets are server-side environment variables. The web tier only exposes
  `AUTH_SECRET` to its own server runtime; backend tokens stay in the encrypted
  session cookie.
- Never prefix provider keys with `NEXT_PUBLIC_`.
- Use the platform's secret manager (Render secret environment variables, Cloudflare
  `wrangler secret`, Supabase project secrets, Railway variables, Vercel
  encrypted env, Docker secrets or a vault).
- Rotate JWT, Auth.js and provider secrets on a schedule. Rotating JWT secrets
  invalidates existing backend tokens; rotating `AUTH_SECRET` invalidates all
  web sessions.
- Production mode refuses weak or default JWT secrets, insecure cookies, `*`
  CORS and demo seeding.
- Do not commit `.env`, database files, storage volumes or logs. `.gitignore`
  and `.dockerignore` exclude them.

---

## Logging and privacy

- Requests receive an `X-Request-ID`; error envelopes include it for support.
- Logs avoid tokens, passwords, API keys and full document contents.
- Memory is user-visible, editable and wipeable. Account deletion removes all
  associated rows and stored files.
- Conversations can be exported as Markdown or JSON.
- AETHER does not use customer data to train models. Review each AI provider's
  retention and training policy before sending sensitive data.
- In local fallback mode, responses are generated locally and no data leaves
  the API. `/api/v1/health/providers` reports provider IDs, base URLs and model
  IDs only; it never returns key values.

---

## Known limitations

- SQLite is for development and tests only; use PostgreSQL in production.
- The in-process rate limiter/cache is not shared across replicas. Use Redis.
- Browser speech recognition depends on browser support and microphone
  permissions. Server STT/TTS require provider keys.
- Local storage is not durable on serverless platforms. Use Supabase Storage.
- There is no built-in malware scanner; add one for untrusted uploads at scale.
- Local fallback mode is intentionally limited and clearly labelled. It is not
  a substitute for a configured model, and it is disabled automatically when a
  valid provider key exists.
- CSP allows `'unsafe-inline'` and `'unsafe-eval'` for Next.js compatibility.
  Tighten with nonces/hashes if your threat model requires it.

---

## Production security checklist

- [ ] `ENVIRONMENT=production`
- [ ] Unique 32+ character JWT, internal and Auth.js secrets
- [ ] `COOKIE_SECURE=true`, HTTPS only, HSTS at the edge
- [ ] `ENABLE_API_DOCS=false`
- [ ] `SEED_DEMO=false`
- [ ] `AUTO_CREATE_TABLES=false`; migrations applied during release
- [ ] Exact `CORS_ORIGINS` and `TRUSTED_HOSTS`
- [ ] `TRUST_PROXY_HEADERS=true` only behind a trusted proxy
- [ ] Redis configured for multi-replica limits
- [ ] Supabase Storage configured for serverless web tiers
- [ ] Provider keys scoped, spend-limited and rotated
- [ ] Database backups, PITR and restore drills
- [ ] Log aggregation and alerting on 5xx/429 spikes
- [ ] Dependency and container scanning in CI
- [ ] Account deletion, memory wipe and export tested
- [ ] External malware scanning added if uploads are untrusted at scale
