"""Private file storage: Supabase Storage when configured, local volume otherwise."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import safe_join_component

logger = logging.getLogger("aether.storage")


class StorageService:
    def __init__(self) -> None:
        self.backend = "supabase" if settings.storage_uses_supabase else "local"
        self.root = Path(settings.storage_dir).resolve()
        if self.backend == "local":
            self.root.mkdir(parents=True, exist_ok=True)
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    def _local_path(self, key: str) -> Path:
        parts = [safe_join_component(part) for part in key.split("/") if part]
        if not parts:
            raise AppError("invalid_file", "Invalid storage key", 400)
        path = self.root.joinpath(*parts).resolve()
        if not str(path).startswith(str(self.root)):
            raise AppError("invalid_file", "Invalid storage path", 400)
        return path

    def _supabase_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
        }

    def _object_url(self, key: str) -> str:
        base = settings.supabase_url.rstrip("/")
        return f"{base}/storage/v1/object/{settings.supabase_bucket}/{key}"

    async def save(self, key: str, data: bytes, content_type: str) -> str:
        if self.backend == "supabase":
            try:
                response = await self.client.post(
                    self._object_url(key),
                    headers={
                        **self._supabase_headers(),
                        "Content-Type": content_type,
                        "x-upsert": "false",
                    },
                    content=data,
                )
                if response.status_code not in (200, 201):
                    raise AppError("storage_failed", "Could not store the file", 502)
                return "supabase"
            except httpx.HTTPError as exc:
                raise AppError("storage_failed", "Storage service is unavailable", 502) from exc
        path = self._local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return "local"

    async def read(self, key: str) -> bytes:
        if self.backend == "supabase":
            try:
                response = await self.client.get(
                    self._object_url(key), headers=self._supabase_headers()
                )
                if response.status_code == 404:
                    raise AppError("not_found", "File content not found", 404)
                response.raise_for_status()
                return response.content
            except httpx.HTTPError as exc:
                raise AppError("storage_failed", "Could not read the stored file", 502) from exc
        path = self._local_path(key)
        if not path.exists():
            raise AppError("not_found", "File content not found", 404)
        return path.read_bytes()

    async def delete(self, key: str) -> None:
        if self.backend == "supabase":
            try:
                await self.client.delete(self._object_url(key), headers=self._supabase_headers())
            except httpx.HTTPError as exc:
                logger.warning("Supabase delete failed: %s", exc)
            return
        path = self._local_path(key)
        path.unlink(missing_ok=True)

    async def signed_url(self, key: str, expires_in: int = 3600) -> dict[str, Any] | None:
        if self.backend != "supabase":
            return None
        try:
            response = await self.client.post(
                f"{settings.supabase_url.rstrip('/')}/storage/v1/object/sign/{settings.supabase_bucket}/{key}",
                headers=self._supabase_headers(),
                json={"expiresIn": expires_in},
            )
            response.raise_for_status()
            signed = response.json().get("signedURL", "")
            if signed.startswith("/"):
                signed = settings.supabase_url.rstrip("/") + signed
            return {"url": signed, "expires_in": expires_in}
        except httpx.HTTPError:
            return None

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()


storage = StorageService()
