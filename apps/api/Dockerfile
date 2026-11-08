# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --upgrade pip \
    && pip install .

RUN groupadd --system --gid 10001 aether \
    && useradd --system --uid 10001 --gid aether --create-home aether \
    && mkdir -p /app/data \
    && chown -R aether:aether /app

USER aether

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# Wait for the database, apply migrations, then serve. The retry loop makes
# cold starts on managed platforms safe without hiding a real migration error.
CMD ["sh", "-c", "set -e; n=0; until alembic upgrade head; do n=$((n+1)); if [ \"$n\" -ge 30 ]; then echo 'database migration failed after 30 attempts' >&2; exit 1; fi; echo 'waiting for database...'; sleep 2; done; exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --proxy-headers"]
