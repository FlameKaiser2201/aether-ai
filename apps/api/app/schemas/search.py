from __future__ import annotations

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=6, ge=1, le=10)


class SearchResultItem(BaseModel):
    index: int
    title: str
    url: str
    snippet: str


class SearchResponse(BaseModel):
    query: str
    provider: str
    results: list[SearchResultItem]
    cached: bool = False
