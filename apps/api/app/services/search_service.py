"""Web research: provider abstraction, caching and SSRF-safe content extraction."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.core.redis_client import cache
from app.utils.security import UnsafeURLError, scrub_secrets, validate_public_url

logger = logging.getLogger("aether.search")

USER_AGENT = (
    "Mozilla/5.0 (compatible; AETHERResearch/1.0; +https://github.com/FlameKaiser2201/aether-ai)"
)
MAX_PAGE_BYTES = 2_000_000


@dataclass(slots=True)
class WebResult:
    index: int
    title: str
    url: str
    snippet: str = ""
    content: str = ""


@dataclass(slots=True)
class ResearchBundle:
    query: str
    provider: str
    results: list[WebResult] = field(default_factory=list)
    cached: bool = False


def search_available() -> bool:
    return True  # DuckDuckGo HTML fallback needs no key


def _provider() -> str:
    if settings.tavily_api_key:
        return "tavily"
    if settings.brave_search_api_key:
        return "brave"
    if settings.serper_api_key:
        return "serper"
    if settings.searxng_url:
        return "searxng"
    return "duckduckgo"


def _clean(text: str, limit: int = 500) -> str:
    text = re.sub(r"\s+", " ", BeautifulSoup(text or "", "html.parser").get_text(" ")).strip()
    return text[:limit]


async def _tavily(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebResult]:
    response = await client.post(
        "https://api.tavily.com/search",
        json={
            "api_key": settings.tavily_api_key,
            "query": query,
            "max_results": max_results,
            "search_depth": "advanced",
            "include_answer": False,
            "include_raw_content": False,
        },
        timeout=20,
    )
    response.raise_for_status()
    results = []
    for index, item in enumerate(response.json().get("results", [])[:max_results]):
        results.append(
            WebResult(
                index=index + 1,
                title=_clean(item.get("title", ""), 200) or "Untitled",
                url=item.get("url", ""),
                snippet=_clean(item.get("content", ""), 600),
                content=_clean(item.get("content", ""), 4000),
            )
        )
    return results


async def _brave(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebResult]:
    response = await client.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": max_results},
        headers={"X-Subscription-Token": settings.brave_search_api_key},
        timeout=20,
    )
    response.raise_for_status()
    results = []
    for index, item in enumerate(response.json().get("web", {}).get("results", [])[:max_results]):
        results.append(
            WebResult(
                index=index + 1,
                title=_clean(item.get("title", ""), 200) or "Untitled",
                url=item.get("url", ""),
                snippet=_clean(item.get("description", ""), 600),
            )
        )
    return results


async def _serper(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebResult]:
    response = await client.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": settings.serper_api_key},
        json={"q": query, "num": max_results},
        timeout=20,
    )
    response.raise_for_status()
    results = []
    for index, item in enumerate(response.json().get("organic", [])[:max_results]):
        results.append(
            WebResult(
                index=index + 1,
                title=_clean(item.get("title", ""), 200) or "Untitled",
                url=item.get("link", ""),
                snippet=_clean(item.get("snippet", ""), 600),
            )
        )
    return results


async def _searxng(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebResult]:
    response = await client.get(
        f"{settings.searxng_url.rstrip('/')}/search",
        params={"q": query, "format": "json", "safesearch": 1},
        timeout=20,
    )
    response.raise_for_status()
    results = []
    for index, item in enumerate(response.json().get("results", [])[:max_results]):
        results.append(
            WebResult(
                index=index + 1,
                title=_clean(item.get("title", ""), 200) or "Untitled",
                url=item.get("url", ""),
                snippet=_clean(item.get("content", ""), 600),
            )
        )
    return results


async def _duckduckgo(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebResult]:
    response = await client.get(
        "https://html.duckduckgo.com/html/",
        params={"q": query},
        headers={"User-Agent": USER_AGENT},
        timeout=20,
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    results: list[WebResult] = []
    for result in soup.select(".result")[: max_results * 2]:
        link = result.select_one("a.result__a")
        snippet = result.select_one(".result__snippet")
        if not link or not link.get("href"):
            continue
        url = str(link["href"])
        if url.startswith("//"):
            url = "https:" + url
        parsed = urlparse(url)
        if "duckduckgo.com" in parsed.netloc and "uddg" in parse_qs(parsed.query):
            url = unquote(parse_qs(parsed.query)["uddg"][0])
        results.append(
            WebResult(
                index=len(results) + 1,
                title=_clean(link.get_text(" "), 200) or "Untitled",
                url=url,
                snippet=_clean(snippet.get_text(" ") if snippet else "", 600),
            )
        )
        if len(results) >= max_results:
            break
    if not results:
        response = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
            timeout=20,
        )
        data = response.json() if response.status_code == 200 else {}
        if data.get("AbstractText"):
            results.append(
                WebResult(
                    index=1,
                    title=data.get("Heading") or "DuckDuckGo summary",
                    url=data.get("AbstractURL") or "https://duckduckgo.com/",
                    snippet=_clean(data.get("AbstractText", ""), 600),
                )
            )
    return results


async def _extract_page(client: httpx.AsyncClient, url: str) -> str:
    current = url
    for _ in range(3):
        try:
            await validate_public_url(current)
        except UnsafeURLError as exc:
            logger.info("Blocked unsafe URL %s: %s", current, exc)
            return ""
        try:
            async with client.stream(
                "GET",
                current,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain"},
                follow_redirects=False,
                timeout=15,
            ) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location", "")
                    if not location:
                        return ""
                    current = str(httpx.URL(current).join(location))
                    continue
                if response.status_code >= 400:
                    return ""
                content_type = response.headers.get("content-type", "")
                if not any(t in content_type for t in ("text/html", "text/plain", "application/xhtml")):
                    return ""
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_PAGE_BYTES:
                        break
                html = body.decode(response.encoding or "utf-8", errors="replace")
        except (httpx.HTTPError, UnicodeDecodeError) as exc:
            logger.info("Page fetch failed for %s: %s", current, exc)
            return ""

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg"]):
            tag.decompose()
        main = soup.find("article") or soup.find("main") or soup.body or soup
        text = main.get_text("\n", strip=True)
        text = re.sub(r"\n{2,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text[:6000]
    return ""


async def search(query: str, max_results: int | None = None, fetch_pages: bool = True) -> ResearchBundle:
    max_results = max_results or settings.search_max_results
    provider = _provider()
    cache_key = "aether:search:" + hashlib.sha256(
        f"{provider}:{query}:{max_results}:{fetch_pages}".encode()
    ).hexdigest()
    cached = await cache.get_json(cache_key)
    if cached:
        return ResearchBundle(
            query=query,
            provider=cached.get("provider", provider),
            results=[WebResult(**item) for item in cached.get("results", [])],
            cached=True,
        )

    results: list[WebResult] = []
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        try:
            if provider == "tavily":
                results = await _tavily(client, query, max_results)
            elif provider == "brave":
                results = await _brave(client, query, max_results)
            elif provider == "serper":
                results = await _serper(client, query, max_results)
            elif provider == "searxng":
                results = await _searxng(client, query, max_results)
            else:
                results = await _duckduckgo(client, query, max_results)
        except Exception as exc:
            logger.warning("Search provider %s failed: %s", provider, scrub_secrets(str(exc)))
            results = []

        results = [r for r in results if r.url.startswith(("http://", "https://"))][:max_results]
        if fetch_pages:
            for result in results[: settings.search_fetch_pages]:
                result.content = await _extract_page(client, result.url)

    for index, result in enumerate(results):
        result.index = index + 1
    await cache.set_json(
        cache_key,
        {
            "provider": provider,
            "results": [
                {
                    "index": r.index,
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "content": r.content,
                }
                for r in results
            ],
        },
        settings.search_cache_seconds,
    )
    return ResearchBundle(query=query, provider=provider, results=results)


def citations_from(results: list[WebResult]) -> list[dict[str, Any]]:
    return [
        {"index": r.index, "title": r.title, "url": r.url, "snippet": r.snippet}
        for r in results
    ]
