"""Password hashing, JWT issuance/verification and input sanitizers."""

from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

ALGORITHM = "HS256"
_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_FILENAME_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired or of the wrong type."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode(subject: str, token_type: Literal["access", "refresh"], lifetime: timedelta, **extra: Any) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "jti": secrets.token_urlsafe(18),
        **extra,
    }
    secret = settings.jwt_access_secret if token_type == "access" else settings.jwt_refresh_secret
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def create_access_token(user_id: str, email: str, role: str = "user") -> tuple[str, int]:
    lifetime = timedelta(minutes=settings.access_token_minutes)
    token = _encode(user_id, "access", lifetime, email=email, role=role)
    return token, int(lifetime.total_seconds())


def create_refresh_token(user_id: str) -> tuple[str, datetime]:
    lifetime = timedelta(days=settings.refresh_token_days)
    token = _encode(user_id, "refresh", lifetime)
    return token, datetime.now(UTC) + lifetime


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]:
    secret = settings.jwt_access_secret if expected_type == "access" else settings.jwt_refresh_secret
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid token") from exc
    if payload.get("type") != expected_type:
        raise TokenError("Invalid token type")
    if not payload.get("sub"):
        raise TokenError("Invalid token subject")
    return payload


def sanitize_text(value: str, *, max_length: int = 20000, strip_html: bool = False) -> str:
    """Normalize control characters and cap length. Never trust this as HTML."""
    value = unicodedata.normalize("NFC", value or "")
    value = _CONTROL_CHARS.sub("", value)
    if strip_html:
        import bleach

        value = bleach.clean(value, tags=[], attributes={}, strip=True)
    return value[:max_length]


def sanitize_filename(name: str, *, fallback: str = "file") -> str:
    name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    name = name.replace("\\", "/").split("/")[-1].strip()
    name = _FILENAME_UNSAFE.sub("_", name).strip("._")
    if not name:
        name = fallback
    return name[:180]


def safe_join_component(value: str) -> str:
    """Only allow UUID-like path components in storage keys."""
    cleaned = re.sub(r"[^A-Za-z0-9-]", "", value)
    if not cleaned or ".." in cleaned:
        raise ValueError("Invalid path component")
    return cleaned


def new_request_id() -> str:
    return secrets.token_hex(12)
