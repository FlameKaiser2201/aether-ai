#!/usr/bin/env bash
# Production entry point for the FastAPI service when the platform does not
# use the Docker image CMD (for example a Nixpacks/Railway custom start).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/api"

alembic upgrade head
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
