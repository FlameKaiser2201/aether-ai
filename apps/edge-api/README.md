# AETHER edge API

Workers-native API for AETHER, running on Cloudflare Workers + D1 on the free
plan. It is an alternative to the FastAPI backend in `apps/api` for deployments
that must stay entirely on Cloudflare.

## Covered

- Auth: register, login, refresh rotation, logout, password change.
- Chat: JSON and SSE streaming, provider fallback, web search.
- Conversations: list, create, read, rename, pin, archive, delete, export.
- Settings, memories, tasks, search, health and voice status.
- Studio: study material (notes, summaries, questions, quizzes, flashcards,
  revision plans) and scored mock interviews, persisted in D1.

## Not covered yet

File upload/analysis, code actions, server-side speech, Redis rate limiting,
background memory extraction and automatic task planning. Those routes return
`501`; the Python API remains the full-featured backend for them.

## Commands

```bash
npm install

# Local development (requires .dev.vars with the secrets)
npx wrangler dev

# Create and migrate D1
npx wrangler d1 create aether-edge
npx wrangler d1 execute aether-edge --remote --file=migrations/0001_init.sql

# Secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put JWT_ACCESS_SECRET
npx wrangler secret put JWT_REFRESH_SECRET

# Deploy
npx wrangler deploy
```

See [`docs/EDGE_DEPLOYMENT.md`](../../docs/EDGE_DEPLOYMENT.md) for the full
walkthrough, the web service binding, verification steps and free-plan
trade-offs.
