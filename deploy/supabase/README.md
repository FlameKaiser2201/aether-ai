# Supabase Free — database and file storage

AETHER uses **Supabase Free** for PostgreSQL and object storage. No paid plan is
required.

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard>.
2. **New project** → choose an organisation, name (for example `aether`),
   a strong database password, and the region closest to your API host.
3. Wait for provisioning to finish (about two minutes).

Free plan limits: **500 MB database**, **1 GB file storage**, **5 GB egress**,
2 active projects, and projects pause after **1 week of inactivity**. Open the
dashboard at least weekly to keep the project awake, or run any query against it.

## 2. Create the schema

Open **SQL Editor → New query**, paste the contents of
[`schema.sql`](schema.sql), and click **Run**.

The script is idempotent. It creates every AETHER table, indexes, the private
`aether-files` bucket, enables row-level security, and stamps Alembic revision
`40481f84bf69` so the API container's automatic `alembic upgrade head` is a
no-op.

> The API also applies Alembic migrations on boot. You can skip this step and
> let the container create the schema, then run `schema.sql` afterwards to
> enable RLS and create the bucket. Running it before the first boot is simpler.

## 3. Copy the pooler connection string

Use the **session pooler**, not the direct connection and not the transaction
pooler. The API uses `asyncpg` with prepared statements and long-lived
connections; session mode on port `5432` is compatible.

1. **Project Settings → Database → Connection string → URI**.
2. Select **Session pooler** (port `5432`, host
   `aws-<n>-<region>.pooler.supabase.com`).
3. Copy the URI. It looks like:

```text
postgresql://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

4. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`,
   `/` → `%2F`, `:` → `%3A`).
5. Append `?sslmode=require`:

```text
postgresql+asyncpg://postgres.<project-ref>:<url-encoded-password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

The API normalizes `postgresql://` to `postgresql+asyncpg://` automatically and
translates `sslmode=require` into the `ssl` connect argument that asyncpg
expects. Keep `sslmode=require` in the value.

> **Why not the transaction pooler (port 6543)?** Transaction mode multiplexes
> connections between statements and breaks asyncpg's prepared-statement cache.
> Session mode is the safe choice for this app. If you must use transaction
> mode, the API would need `statement_cache_size=0` on every connection, which
> this repository does not configure.

## 4. Copy the API URL and service-role key

**Project Settings → API**:

- `SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` secret (server-only)

The service-role key bypasses RLS. **Never** expose it to the browser or prefix
it with `NEXT_PUBLIC_`. AETHER only uses it from the FastAPI server.

## 5. Create the storage bucket

`schema.sql` creates a private `aether-files` bucket. To create it manually:

**Storage → New bucket** → name `aether-files` → **Public bucket: off** → Save.

AETHER stores uploads under `userId/fileId.ext` and deletes them when the user
deletes the file or account. Do not add public read policies.

## 6. Set the API environment

On the API host (Render Free), add these variables/secrets:

```text
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<url-encoded-password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_BUCKET=aether-files
```

Keep the connection pool small on the free tier: the API runs one container and
Supabase Free has a shared CPU and 500 MB RAM.

## 7. Verify

```bash
curl https://<api-host>/health
curl https://<api-host>/api/v1/health/ready
```

`/health` returns `{"status":"ok"}`. `/api/v1/health/ready` checks the database
connection. If it fails, re-check the pooler host, the URL-encoded password, and
`sslmode=require`.
