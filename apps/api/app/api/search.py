from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser
from app.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(payload: SearchRequest, user: CurrentUser) -> SearchResponse:
    bundle = await search_service.search(
        payload.query, max_results=payload.max_results, fetch_pages=True
    )
    return SearchResponse(
        query=bundle.query,
        provider=bundle.provider,
        results=[
            SearchResultItem(
                index=result.index,
                title=result.title,
                url=result.url,
                snippet=result.snippet,
            )
            for result in bundle.results
        ],
        cached=bundle.cached,
    )
