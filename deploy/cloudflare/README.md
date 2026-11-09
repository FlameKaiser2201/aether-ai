# Cloudflare Workers — free Next.js frontend

The AETHER web tier is a Next.js 15 app with Auth.js server-side sessions and a
same-origin `/api/proxy` route. It runs on **Cloudflare Workers** through
[OpenNext](https://opennext.js.org/cloudflare) on the **Workers Free** plan.

## Why Workers, not Pages

Cloudflare Pages' `@cloudflare/next-on-pages` adapter supports Next.js
`>=14.3.0 && <=15.5.2`. This project is on **Next.js 15.5.29**, so the adapter
cannot build it. Cloudflare now recommends Workers + OpenNext for Next.js SSR;
Pages only supports statically exported Next.js apps. The app cannot be static
because Auth.js and the API proxy run on the server.

The configuration is already in the repository:

- [`apps/web/wrangler.jsonc`](../../apps/web/wrangler.jsonc) — Worker name,
  OpenNext entrypoint, static assets, compatibility flags.
- [`apps/web/open-next.config.ts`](../../apps/web/open-next.config.ts) — OpenNext
  configuration.
- [`apps/web/package.json`](../../apps/web/package.json) — `build:cloudflare`,
  `preview`, and `deploy:cloudflare` scripts.

## 1. Authenticate Wrangler

```bash
cd apps/web
npx wrangler login
```

Or use an API token with the **Workers Scripts: Edit** permission:

```bash
export CLOUDFLARE_API_TOKEN=...   # PowerShell: $env:CLOUDFLARE_API_TOKEN="..."
```

## 2. Set runtime secrets

Set these once per Worker. `API_URL` must be the Northflank public HTTPS origin;
`AUTH_URL` and `NEXTAUTH_URL` must be the Worker's public HTTPS origin.

```bash
cd apps/web

npx wrangler secret put AUTH_SECRET
npx wrangler secret put API_URL
npx wrangler secret put AUTH_URL
npx wrangler secret put NEXTAUTH_URL
```

Generate `AUTH_SECRET` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`AUTH_SECRET` must be at least 32 bytes and identical across every Worker
version. Changing it invalidates all web sessions.

`API_URL`, `AUTH_URL`, and `NEXTAUTH_URL` are not browser-exposed; they are read
by the Worker's server runtime. Do **not** prefix them with `NEXT_PUBLIC_`.

## 3. Build and deploy

```bash
cd apps/web
npm ci
npm run deploy:cloudflare
```

The first deploy prints the Worker URL:

```text
https://aether-web.<your-subdomain>.workers.dev
```

If the name `aether-web` is already used in your account, edit the `name` field
in `apps/web/wrangler.jsonc` and redeploy.

### Deploy from GitHub Actions (alternative)

[`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml)
builds and deploys the Worker on Linux, which avoids Windows/OneDrive
`readlink` issues in OpenNext. Add these repository secrets, then run
**Actions → Deploy web to Cloudflare → Run workflow**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with **Workers Scripts: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages overview |
| `AUTH_SECRET` | 48-byte random |
| `API_URL` | Northflank public origin |
| `AUTH_URL` | `https://aether-web.<subdomain>.workers.dev` |
| `NEXTAUTH_URL` | same as `AUTH_URL` |

The workflow deploys the Worker first (creating it if needed), then writes the
four Worker secrets. Secrets persist across later deployments.

## 4. Point the API back at the Worker

After the first Worker deploy, copy its URL and update the API service on
Northflank:

```text
APP_URL=https://aether-web.<your-subdomain>.workers.dev
CORS_ORIGINS=https://aether-web.<your-subdomain>.workers.dev
```

Redeploy the API service. Then open the Worker URL, register an account, and
test chat.

## 5. Custom domain (optional)

1. Cloudflare Dashboard → **Workers & Pages → aether-web → Settings → Domains
   & Routes → Add → Custom domain**.
2. Enter the hostname and let Cloudflare create the DNS record.
3. Update `AUTH_URL` and `NEXTAUTH_URL` to the custom domain, and update the
   API's `APP_URL` / `CORS_ORIGINS` to match.
4. Redeploy the Worker so Auth.js sees the new public origin.

## Local preview

```bash
cd apps/web
npm run preview
```

`npm run preview` builds with OpenNext and starts the local Workers runtime. It
still needs `API_URL` and `AUTH_SECRET` in the environment or in
`apps/web/.dev.vars`.

## Free-plan notes

- **100,000 requests/day**, **10 ms CPU per request**, 128 MB memory. The web
  tier is mostly static assets and short server renders, so it fits — but a
  heavy SSR request can hit `Error 1102` (CPU limit). If that happens, reduce
  server work, cache pages, or move the web tier to a free Vercel Hobby project.
  The FastAPI backend cannot run on Workers Free because Argon2 logins alone
  exceed 10 ms.
- Workers have no persistent disk. Uploads go to Supabase Storage through the
  API; never set `STORAGE_BACKEND=local` for the API.
- Keep `nodejs_compat` and `nodejs_compat_populate_process_env` enabled. They
  let Auth.js read `process.env` and use Node-compatible APIs.
- Check the OpenNext and Wrangler compatibility dates when upgrading Next.js.
  `wrangler.jsonc` pins `compatibility_date: 2026-11-01`.
