"""ASGI rate-limiting middleware with Redis + memory fallback."""

from __future__ import annotations

import json
import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.core.redis_client import cache
from app.core.security import TokenError, decode_token

logger = logging.getLogger("aether.ratelimit")


def _client_ip(scope: Scope) -> str:
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    if settings.trust_proxy_headers:
        forwarded = headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
        real_ip = headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()[:64]
    client = scope.get("client")
    return client[0] if client else "unknown"


def _identity(scope: Scope) -> tuple[str, str]:
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            payload = decode_token(auth[7:].strip(), "access")
            return "user", str(payload["sub"])
        except TokenError:
            pass
    return "ip", _client_ip(scope)


def _bucket(path: str) -> tuple[str, int, int]:
    if path.endswith("/auth/login") or path.endswith("/auth/register") or path.endswith("/auth/refresh"):
        return "auth", settings.auth_limit_per_minute, 60
    if "/chat" in path:
        return "chat", settings.chat_limit_per_minute, 60
    if path.endswith("/files") and path.startswith("/api"):
        return "upload", settings.upload_limit_per_hour, 3600
    return "api", settings.rate_limit_per_minute, 60


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path.endswith("/health") or path.endswith("/ready") or path.startswith("/docs"):
            await self.app(scope, receive, send)
            return

        kind, identity = _identity(scope)
        bucket, limit, window = _bucket(path)
        now = int(time.time())
        reset = now + window
        key = f"aether:rl:{bucket}:{kind}:{identity}:{now // window}"

        try:
            count = await cache.incr_window(key, window)
        except Exception:  # never take the API down because the limiter failed
            logger.exception("Rate limiter failure")
            count = 1

        remaining = max(0, limit - count)
        headers = [
            (b"x-ratelimit-limit", str(limit).encode()),
            (b"x-ratelimit-remaining", str(remaining).encode()),
            (b"x-ratelimit-reset", str(reset).encode()),
        ]

        if count > limit:
            body = json.dumps(
                {
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please slow down and try again shortly.",
                    }
                }
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"retry-after", str(max(1, reset - now)).encode()),
                        *headers,
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                message["headers"].extend(headers)
            await send(message)

        await self.app(scope, receive, send_with_headers)
