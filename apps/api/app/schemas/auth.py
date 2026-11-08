from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, EmailStr, Field, field_validator


def _validate_password(value: str) -> str:
    if len(value) < 10:
        raise ValueError("Password must be at least 10 characters")
    if len(value) > 128:
        raise ValueError("Password must be at most 128 characters")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must contain a lowercase letter")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain an uppercase letter")
    if not re.search(r"\d", value):
        raise ValueError("Password must contain a digit")
    if value.lower() in {"password1", "password123", "qwerty1234", "letmein123"}:
        raise ValueError("This password is too common")
    return value


Password = Annotated[str, Field(min_length=10, max_length=128)]
Name = Annotated[str, Field(min_length=1, max_length=80)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    name: Name

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class OAuthLoginRequest(BaseModel):
    email: EmailStr
    name: Name = "AETHER user"
    avatar_url: str | None = Field(default=None, max_length=1024)
    provider: str = Field(min_length=1, max_length=32)
    provider_account_id: str = Field(min_length=1, max_length=255)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=4096)


class LogoutRequest(RefreshRequest):
    pass


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    avatar_url: str | None = None
    auth_provider: str
    email_verified: bool
    role: str
    preferences: dict[str, Any]
    created_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserUpdate(BaseModel):
    name: Name | None = None
    avatar_url: str | None = Field(default=None, max_length=1024)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return _validate_password(value)
