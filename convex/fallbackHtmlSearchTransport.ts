import type { NormalizedSearchResult } from "./webSearchTypes";

type FallbackSearchSuccess = {
  ok: true;
  results: NormalizedSearchResult[];
  backend: "fallback";
};

type FallbackSearchFailure = {
  ok: false;
  code: string;
  message: string;
  outputPreview?: string;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripHtml(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

function normalizeUrl(rawUrl: string): string | null {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;
  try {
    const prefixed = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const url = new URL(prefixed);
    if (url.hostname === "duckduckgo.com" && url.pathname === "/l/") {
      const redirected = url.searchParams.get("uddg");
      if (redirected) {
        return normalizeUrl(decodeHtmlEntities(redirected));
      }
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isTimeSensitiveSearchQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(latest|current|recent|today|yesterday|this week|this month|breaking|news|update|updates|development|developments)\b/.test(
    normalized,
  );
}

export async function searchWithFallbackHtml(params: {
  query: string;
}): Promise<FallbackSearchSuccess | FallbackSearchFailure> {
  let response: Response;
  try {
    const searchUrl = new URL("https://duckduckgo.com/html/");
    searchUrl.searchParams.set("q", params.query);
    if (isTimeSensitiveSearchQuery(params.query)) {
      searchUrl.searchParams.set("df", "d");
    }
    response = await fetch(searchUrl.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://duckduckgo.com/",
        "user-agent": "Mozilla/5.0",
      },
    });
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: error instanceof Error ? error.message : "web_research search request failed.",
    };
  }

  const html = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: `web_research search failed (${response.status}).`,
      outputPreview: html.slice(0, 500),
    };
  }

  const results: NormalizedSearchResult[] = [];
  const anchorRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null = null;
  while ((match = anchorRegex.exec(html)) && results.length < 8) {
    const url = normalizeUrl(decodeHtmlEntities(match[1] ?? ""));
    const title = stripHtml(match[2] ?? "");
    if (!url || !title) continue;
    const snippetWindow = html.slice(match.index, match.index + 1600);
    const snippetMatch = snippetWindow.match(
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/,
    );
    const snippet = stripHtml(snippetMatch?.[1] ?? snippetMatch?.[2] ?? "");
    results.push({
      title,
      url,
      backend: "fallback",
      snippet: snippet || null,
    });
  }

  return {
    ok: true,
    backend: "fallback",
    results,
  };
}
