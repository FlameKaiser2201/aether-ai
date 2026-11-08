"""Redis connection with a transparent in-process fallback.

The API is fully functional without Redis (single-instance mode); the fallback is
explicitly surfaced in health/settings so operators know to attach Redis at scale.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger("aether.redis")


class _MemoryBackend:
    def __init__(self) -> None:
        self._values: dict[str, tuple[str, float | None]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        async with self._lock:
            item = self._values.get(key)
            if item is None:
                return None
            value, expires = item
            if expires is not None and expires <= time.monotonic():
                self._values.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: str, ttl: int | None) -> None:
        async with self._lock:
            expires = time.monotonic() + ttl if ttl else None
            self._values[key] = (value, expires)
            if len(self._values) > 5000:
                now = time.monotonic()
                self._values = {
                    k: v for k, v in self._values.items() if v[1] is None or v[1] > now
                }

    async def incr(self, key: str, ttl: int) -> int:
        async with self._lock:
            item = self._values.get(key)
            now = time.monotonic()
            if item is None or (item[1] is not None and item[1] <= now):
                count = 1
                self._values[key] = (str(count), now + ttl)
                return count
            count = int(item[0]) + 1
            self._values[key] = (str(count), item[1])
            return count

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._values.pop(key, None)


class CacheManager:
    def __init__(self) -> None:
        self._redis: Redis | None = None
        self._memory = _MemoryBackend()
        self.available = False
        self.backend = "memory"

    async def connect(self) -> None:
        if not settings.redis_url:
            logger.warning("REDIS_URL not set; using in-process cache and rate limiter")
            return
        try:
            client = Redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )
            await asyncio.wait_for(client.ping(), timeout=2.5)
            self._redis = client
            self.available = True
            self.backend = "redis"
            logger.info("Redis connected")
        except (RedisError, TimeoutError, OSError) as exc:
            logger.warning("Redis unavailable (%s); using in-process fallback", exc)

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    async def get_json(self, key: str) -> Any | None:
        try:
            raw = await self._redis.get(key) if self.available and self._redis else await self._memory.get(key)
            return json.loads(raw) if raw else None
        except (RedisError, json.JSONDecodeError) as exc:
            logger.warning("Cache read failed: %s", exc)
            return None

    async def set_json(self, key: str, value: Any, ttl: int) -> None:
        raw = json.dumps(value, ensure_ascii=False, default=str)
        try:
            if self.available and self._redis:
                await self._redis.set(key, raw, ex=ttl)
            else:
                await self._memory.set(key, raw, ttl)
        except RedisError as exc:
            logger.warning("Cache write failed: %s", exc)

    async def incr_window(self, key: str, window_seconds: int) -> int:
        try:
            if self.available and self._redis:
                pipe = self._redis.pipeline()
                pipe.incr(key)
                pipe.expire(key, window_seconds, nx=True)
                results = await pipe.execute()
                return int(results[0])
            return await self._memory.incr(key, window_seconds)
        except RedisError as exc:
            logger.warning("Rate limit backend failed (%s); failing open", exc)
            return 1

    async def delete(self, key: str) -> None:
        try:
            if self.available and self._redis:
                await self._redis.delete(key)
            else:
                await self._memory.delete(key)
        except RedisError:
            pass

    async def ping(self) -> bool:
        if not self.available or not self._redis:
            return False
        try:
            return bool(await self._redis.ping())
        except RedisError:
            return False


cache = CacheManager()
