import hmac
import ipaddress
import os
from typing import Any
from urllib.parse import urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


TOKEN_ENV = "ARX_CRAWLER_TOKEN"
DENIED_HOSTNAME_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".home",
    ".lan",
    ".test",
    ".invalid",
)


def read_int_env(name: str, fallback: int) -> int:
    try:
        value = int(os.getenv(name, "").strip())
        return value if value > 0 else fallback
    except ValueError:
        return fallback


DEFAULT_MAX_PAGES = read_int_env("POLYNET_CRAWLER_DEFAULT_MAX_PAGES", 75)
MAX_PAGES = read_int_env("POLYNET_CRAWLER_MAX_PAGES", 100)
DEFAULT_MAX_DEPTH = read_int_env("POLYNET_CRAWLER_DEFAULT_MAX_DEPTH", 3)
MAX_DEPTH = read_int_env("POLYNET_CRAWLER_MAX_DEPTH", 4)


class CrawlRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=1)
    browser_config: dict[str, Any] | None = None
    crawler_config: dict[str, Any] | None = None


app = FastAPI(title="Polynet Community Source Crawler")


def require_token(authorization: str | None) -> None:
    expected = os.getenv(TOKEN_ENV, "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="crawler_token_not_configured")
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="crawler_auth_required")
    token = authorization[len(prefix):].strip()
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="crawler_auth_invalid")


def is_denied_hostname(hostname: str) -> bool:
    normalized = hostname.strip().lower().rstrip(".")
    if not normalized:
        return True
    if normalized == "localhost" or normalized.endswith(DENIED_HOSTNAME_SUFFIXES):
        return True
    try:
        address = ipaddress.ip_address(normalized)
        return (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        )
    except ValueError:
        return False


def require_safe_url(raw: str) -> str:
    parsed = urlparse(str(raw or "").strip())
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="crawler_url_https_required")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="crawler_url_credentials_not_supported")
    if parsed.port and parsed.port != 443:
        raise HTTPException(status_code=400, detail="crawler_url_port_not_supported")
    if is_denied_hostname(parsed.hostname or ""):
        raise HTTPException(status_code=400, detail="crawler_url_private_or_local")
    return parsed._replace(fragment="").geturl()


def requested_crawl_limits(payload: CrawlRequest) -> tuple[int, int]:
    params = (
        (payload.crawler_config or {})
        .get("params", {})
        .get("deep_crawl_strategy", {})
        .get("params", {})
    )
    max_pages = params.get("max_pages", DEFAULT_MAX_PAGES)
    max_depth = params.get("max_depth", DEFAULT_MAX_DEPTH)
    try:
        page_count = int(max_pages)
    except (TypeError, ValueError):
        page_count = DEFAULT_MAX_PAGES
    try:
        depth = int(max_depth)
    except (TypeError, ValueError):
        depth = DEFAULT_MAX_DEPTH
    return max(1, min(page_count, MAX_PAGES)), max(0, min(depth, MAX_DEPTH))


def markdown_text(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    for key in ("fit_markdown", "raw_markdown", "markdown", "text"):
        value = getattr(raw, key, None)
        if isinstance(value, str) and value.strip():
            return value
    if isinstance(raw, dict):
        for key in ("fit_markdown", "raw_markdown", "markdown", "text"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return str(raw)


def result_row(result: Any, requested_url: str, root_url: str) -> dict[str, Any]:
    metadata = getattr(result, "metadata", {}) or {}
    final_url = require_safe_url(getattr(result, "url", "") or requested_url)
    return {
        "requested_url": requested_url,
        "final_url": final_url,
        "url": final_url,
        "success": bool(getattr(result, "success", True)),
        "title": metadata.get("title") or getattr(result, "title", None),
        "markdown": markdown_text(getattr(result, "markdown", "")),
        "links": getattr(result, "links", {}) or {},
        "metadata": {
            **metadata,
            "depth": int(metadata.get("depth", 0) or 0),
            "parent_url": metadata.get("parent_url") or metadata.get("parent") or None,
            "root_url": root_url,
        },
        "error": getattr(result, "error_message", None) or getattr(result, "error", None),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "kind": "polynet_community_source_crawler",
        "engine": "crawl4ai",
        "default_max_pages": DEFAULT_MAX_PAGES,
        "default_max_depth": DEFAULT_MAX_DEPTH,
        "max_pages": MAX_PAGES,
        "max_depth": MAX_DEPTH,
        "auth_configured": bool(os.getenv(TOKEN_ENV, "").strip()),
    }


@app.post("/crawl")
async def crawl(payload: CrawlRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(authorization)
    root_url = require_safe_url(payload.urls[0])
    max_pages, max_depth = requested_crawl_limits(payload)
    strategy = BFSDeepCrawlStrategy(
        max_depth=max_depth,
        max_pages=max_pages,
        include_external=False,
    )
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        deep_crawl_strategy=strategy,
        scraping_strategy=LXMLWebScrapingStrategy(),
        stream=False,
    )
    browser_config = BrowserConfig(headless=True)
    async with AsyncWebCrawler(config=browser_config) as crawler:
        results = await crawler.arun(root_url, config=config)
    if not isinstance(results, list):
        results = [results]
    rows = [result_row(result, root_url, root_url) for result in results]
    return {
        "ok": True,
        "results": rows,
        "page_count": len(rows),
        "max_pages": max_pages,
        "max_depth": max_depth,
    }
