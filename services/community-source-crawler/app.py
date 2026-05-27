import hmac
import hashlib
import ipaddress
import json
import os
import re
import uuid
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
MIN_VIRTUAL_NAV_ITEMS = read_int_env("POLYNET_CRAWLER_MIN_VIRTUAL_NAV_ITEMS", 3)
MAX_VIRTUAL_PAGES = read_int_env("POLYNET_CRAWLER_MAX_VIRTUAL_PAGES", 50)
MIN_VIRTUAL_SECTION_CHARS = read_int_env("POLYNET_CRAWLER_MIN_VIRTUAL_SECTION_CHARS", 160)
VIRTUAL_CLICK_DELAY_MS = read_int_env("POLYNET_CRAWLER_VIRTUAL_CLICK_DELAY_MS", 400)
MARKDOWN_TEXT_KEYS = (
    "fit_markdown",
    "raw_markdown",
    "markdown",
    "text",
    "markdown_with_citations",
    "references_markdown",
)


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


def markdown_text(raw: Any, depth: int = 0) -> str:
    if raw is None or depth > 5:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, bytes):
        return raw.decode("utf-8", errors="replace").strip()
    if isinstance(raw, dict):
        for key in MARKDOWN_TEXT_KEYS:
            text = markdown_text(raw.get(key), depth + 1)
            if text.strip():
                return text
        for value in raw.values():
            text = markdown_text(value, depth + 1)
            if text.strip():
                return text
        return ""
    for method_name in ("model_dump", "dict"):
        method = getattr(raw, method_name, None)
        if callable(method):
            try:
                text = markdown_text(method(), depth + 1)
                if text.strip():
                    return text
            except Exception:
                pass
    for key in MARKDOWN_TEXT_KEYS:
        text = markdown_text(getattr(raw, key, None), depth + 1)
        if text.strip():
            return text
    raw_dict = getattr(raw, "__dict__", None)
    if isinstance(raw_dict, dict):
        text = markdown_text(raw_dict, depth + 1)
        if text.strip():
            return text
    fallback = str(raw).strip()
    if fallback and fallback not in {"{}", "[]", "None"} and not fallback.startswith("<"):
        return fallback
    return ""


def result_markdown(result: Any) -> str:
    for key in ("markdown", "text", "cleaned_html", "html"):
        text = markdown_text(getattr(result, key, None))
        if text:
            return text
    return ""


def result_row(result: Any, requested_url: str, root_url: str) -> dict[str, Any]:
    metadata = getattr(result, "metadata", {}) or {}
    final_url = require_safe_url(getattr(result, "url", "") or requested_url)
    return {
        "requested_url": requested_url,
        "final_url": final_url,
        "url": final_url,
        "success": bool(getattr(result, "success", True)),
        "title": metadata.get("title") or getattr(result, "title", None),
        "markdown": result_markdown(result),
        "links": getattr(result, "links", {}) or {},
        "metadata": {
            **metadata,
            "depth": int(metadata.get("depth", 0) or 0),
            "parent_url": metadata.get("parent_url") or metadata.get("parent") or None,
            "root_url": root_url,
        },
        "error": getattr(result, "error_message", None) or getattr(result, "error", None),
    }


def normalize_whitespace(raw: Any) -> str:
    text = str(raw or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    compact: list[str] = []
    blank = False
    for line in lines:
        if not line:
            if not blank:
                compact.append("")
            blank = True
            continue
        compact.append(line)
        blank = False
    return "\n".join(compact).strip()


def content_hash(raw: str) -> str:
    return hashlib.sha256(normalize_whitespace(raw).encode("utf-8", errors="ignore")).hexdigest()


def first_js_result(result: Any) -> dict[str, Any] | None:
    execution = getattr(result, "js_execution_result", None)
    if not isinstance(execution, dict):
        return None
    results = execution.get("results")
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    return first if isinstance(first, dict) else None


def virtual_section_text(result: Any) -> str:
    data = first_js_result(result)
    if data:
        for key in ("content_text", "body_text", "text"):
            text = normalize_whitespace(data.get(key))
            if text:
                return text
    return normalize_whitespace(result_markdown(result))


def virtual_section_title(result: Any, fallback: str) -> str:
    data = first_js_result(result)
    if data:
        for key in ("title", "label"):
            text = normalize_whitespace(data.get(key))
            if text:
                return text[:160]
    return normalize_whitespace(fallback)[:160] or "Section"


def make_virtual_discovery_js(max_items: int) -> str:
    return f"""
const maxItems = {max(1, int(max_items))};
const ignoreLabels = new Set([
  "copy", "close", "save", "saved", "submit", "sign in", "sign up",
  "join now", "preview", "mark complete", "complete", "open", "delete",
  "remove", "next", "previous", "back"
]);
function norm(value) {{
  return String(value || "").replace(/\\s+/g, " ").trim();
}}
function visible(el) {{
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}}
function scoreCandidate(el, label) {{
  let score = 0;
  const className = String(el.className || "").toLowerCase();
  const role = String(el.getAttribute("role") || "").toLowerCase();
  if (el.matches(".lesson-item, [data-lesson], [data-section], [data-tab]")) score += 30;
  if (className.includes("lesson") || className.includes("chapter") || className.includes("module")) score += 18;
  if (role === "tab" || role === "button") score += 10;
  if (el.closest("nav, aside, .sidebar, [class*='sidebar'], [class*='toc'], [class*='course'], [class*='lesson-list'], [class*='module-list']")) score += 12;
  if (/lesson|chapter|module|step|day\\s+\\d+|part\\s+\\d+/i.test(label)) score += 8;
  if (el.closest("main, article, [role='main'], .main, #main")) score -= 8;
  if (ignoreLabels.has(label.toLowerCase())) score -= 40;
  return score;
}}
const selector = [
  ".lesson-item", "[data-lesson]", "[data-section]", "[data-tab]",
  "[role='tab']", "[role='button']", "button", "a[href]", "[onclick]"
].join(",");
const nodes = Array.from(document.querySelectorAll(selector));
const seen = new Set();
const items = [];
for (const el of nodes) {{
  if (!visible(el)) continue;
  const label = norm(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
  if (label.length < 2 || label.length > 140) continue;
  const href = norm(el.getAttribute("href"));
  if (/^(mailto:|tel:)/i.test(href)) continue;
  const key = label.toLowerCase();
  if (seen.has(key)) continue;
  const score = scoreCandidate(el, label);
  if (score < 12) continue;
  const index = items.length;
  el.setAttribute("data-polynet-crawl-index", String(index));
  seen.add(key);
  items.push({{
    index,
    label,
    score,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || null,
    href: href || null
  }});
  if (items.length >= maxItems) break;
}}
window.__polynetCrawlVirtualItems = items;
return {{
  item_count: items.length,
  items
}};
"""


def make_virtual_click_js(index: int, label: str, delay_ms: int) -> str:
    label_json = json.dumps(label)
    return f"""
const targetIndex = {int(index)};
const targetLabel = {label_json};
const delayMs = {max(50, int(delay_ms))};
function sleep(ms) {{
  return new Promise(resolve => setTimeout(resolve, ms));
}}
function norm(value) {{
  return String(value || "").replace(/\\s+/g, " ").trim();
}}
function visible(el) {{
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}}
function bestContent() {{
  const selectors = [
    ".lesson.active", "[data-state='active']", "[role='tabpanel'][aria-hidden='false']",
    "main", "[role='main']", "article", "#main", ".main", "#content", ".content",
    "[class*='course-content']", "[class*='lesson-content']", "[id*='content']"
  ];
  let best = null;
  for (const selector of selectors) {{
    for (const el of Array.from(document.querySelectorAll(selector))) {{
      if (!visible(el)) continue;
      if (el.closest("nav, aside, .sidebar, [class*='sidebar']") && !el.matches("main, [role='main'], #main, .main")) continue;
      const text = norm(el.innerText || el.textContent);
      if (text.length < 80) continue;
      const score = text.length + (el.matches(".lesson.active, main, [role='main'], #main, .main") ? 10000 : 0);
      if (!best || score > best.score) best = {{ text, score }};
    }}
    if (best && best.score >= 10000) break;
  }}
  const bodyText = norm(document.body ? document.body.innerText : "");
  return {{
    content_text: best ? best.text : bodyText,
    body_text: bodyText
  }};
}}
function findTarget() {{
  const direct = document.querySelector(`[data-polynet-crawl-index="${{targetIndex}}"]`);
  if (direct && visible(direct)) return direct;
  const selector = [
    ".lesson-item", "[data-lesson]", "[data-section]", "[data-tab]",
    "[role='tab']", "[role='button']", "button", "a[href]", "[onclick]"
  ].join(",");
  const lower = targetLabel.toLowerCase();
  return Array.from(document.querySelectorAll(selector)).find(el => {{
    if (!visible(el)) return false;
    const text = norm(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
    return text.toLowerCase() === lower;
  }}) || null;
}}
const before = norm(document.body ? document.body.innerText : "");
const target = findTarget();
if (!target) {{
  const content = bestContent();
  return {{
    clicked: false,
    label: targetLabel,
    title: targetLabel,
    changed: false,
    ...content
  }};
}}
target.scrollIntoView({{ block: "center", inline: "nearest" }});
target.dispatchEvent(new MouseEvent("mouseover", {{ bubbles: true, cancelable: true, view: window }}));
target.click();
await sleep(delayMs);
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const content = bestContent();
const heading = Array.from(document.querySelectorAll(".lesson.active h1, .lesson.active h2, main h1, main h2, #main h1, #main h2, .main h1, .main h2, h1, h2"))
  .map(el => norm(el.innerText || el.textContent))
  .find(Boolean);
const after = norm(document.body ? document.body.innerText : "");
return {{
  clicked: true,
  label: targetLabel,
  title: heading || targetLabel,
  changed: before !== after,
  ...content
}};
"""


async def kill_crawler_session(crawler: AsyncWebCrawler, session_id: str) -> None:
    strategy = getattr(crawler, "crawler_strategy", None)
    kill_session = getattr(strategy, "kill_session", None)
    if callable(kill_session):
        try:
            await kill_session(session_id)
        except Exception:
            pass


async def extract_virtual_sections(
    crawler: AsyncWebCrawler,
    root_url: str,
    max_sections: int,
) -> list[dict[str, str]]:
    section_limit = max(0, min(max_sections, MAX_VIRTUAL_PAGES))
    if section_limit < MIN_VIRTUAL_NAV_ITEMS:
        return []
    session_id = f"polynet-virtual-{uuid.uuid4().hex}"
    sections: list[dict[str, str]] = []
    seen_hashes: set[str] = set()
    try:
        discovery_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            scraping_strategy=LXMLWebScrapingStrategy(),
            session_id=session_id,
            js_code=make_virtual_discovery_js(section_limit),
            delay_before_return_html=0.25,
            stream=False,
        )
        discovery = await crawler.arun(root_url, config=discovery_config)
        data = first_js_result(discovery) or {}
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list) or len(items) < MIN_VIRTUAL_NAV_ITEMS:
            return []

        for item in items[:section_limit]:
            if not isinstance(item, dict):
                continue
            raw_index = item.get("index")
            label = normalize_whitespace(item.get("label"))
            if not label:
                continue
            try:
                index = int(raw_index)
            except (TypeError, ValueError):
                continue
            click_config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                scraping_strategy=LXMLWebScrapingStrategy(),
                session_id=session_id,
                js_code=make_virtual_click_js(index, label, VIRTUAL_CLICK_DELAY_MS),
                js_only=True,
                delay_before_return_html=0.15,
                stream=False,
            )
            clicked = await crawler.arun(root_url, config=click_config)
            text = virtual_section_text(clicked)
            if len(text) < MIN_VIRTUAL_SECTION_CHARS:
                continue
            digest = content_hash(text)
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)
            sections.append({
                "title": virtual_section_title(clicked, label),
                "label": label,
                "markdown": text,
            })
    finally:
        await kill_crawler_session(crawler, session_id)
    return sections


def merge_virtual_sections_into_root_row(
    rows: list[dict[str, Any]],
    sections: list[dict[str, str]],
) -> list[dict[str, Any]]:
    if not rows or len(sections) < MIN_VIRTUAL_NAV_ITEMS:
        return rows
    root = rows[0]
    original = normalize_whitespace(root.get("markdown"))
    original_hash = content_hash(original) if original else ""
    seen = {original_hash} if original_hash else set()
    blocks: list[str] = []
    if original:
        blocks.append(original)
    added = 0
    for section in sections:
        markdown = normalize_whitespace(section.get("markdown"))
        if not markdown:
            continue
        digest = content_hash(markdown)
        if digest in seen:
            continue
        seen.add(digest)
        title = normalize_whitespace(section.get("title") or section.get("label")) or "Section"
        blocks.append(f"## {title}\n\n{markdown}")
        added += 1
    if added <= 0:
        return rows
    blocks.insert(0, f"Crawl captured {added} virtual sections from client-side navigation.")
    root["markdown"] = "\n\n---\n\n".join(blocks)
    metadata = dict(root.get("metadata") or {})
    metadata["virtual_page_count"] = added
    metadata["virtual_page_strategy"] = "clickable_navigation"
    root["metadata"] = metadata
    root["title"] = root.get("title") or (sections[0].get("title") if sections else None)
    return rows


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
        "max_virtual_pages": MAX_VIRTUAL_PAGES,
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
        if len(rows) == 1 and max_pages >= MIN_VIRTUAL_NAV_ITEMS:
            sections = await extract_virtual_sections(crawler, root_url, max_pages)
            rows = merge_virtual_sections_into_root_row(rows, sections)
    virtual_page_count = sum(
        int((row.get("metadata") or {}).get("virtual_page_count", 0) or 0)
        for row in rows
        if isinstance(row.get("metadata"), dict)
    )
    return {
        "ok": True,
        "results": rows,
        "page_count": len(rows),
        "virtual_page_count": virtual_page_count,
        "max_pages": max_pages,
        "max_depth": max_depth,
    }
