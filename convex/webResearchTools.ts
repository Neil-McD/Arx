function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}

function stripHtml(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

function normalizeUrl(rawUrl: string): string | null {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;
  try {
    const prefixed =
      trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
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

type WebResearchResult =
  | {
      ok: true;
      outputText: string;
      exitCode: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
      outputPreview?: string;
    };

function previewAroundMatch(text: string, query: string): string {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index < 0) return "";
  const start = Math.max(0, index - 240);
  const end = Math.min(text.length, index + query.length + 240);
  return text.slice(start, end).trim();
}

export async function searchWeb(params: {
  query: string;
}): Promise<WebResearchResult> {
  const query = String(params.query ?? "").trim();
  if (!query) {
    return {
      ok: false,
      code: "invalid_tool_args",
      message: "web_research search requires a non-empty query.",
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://duckduckgo.com/",
        "user-agent": "Mozilla/5.0",
      },
      },
    );
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message:
        error instanceof Error ? error.message : "web_research search request failed.",
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

  const anchorRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const results: Array<{ title: string; url: string; snippet: string | null }> =
    [];
  let match: RegExpExecArray | null = null;
  while ((match = anchorRegex.exec(html)) && results.length < 5) {
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
      snippet: snippet || null,
    });
  }

  if (results.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      outputText: `Query: ${query}\nNo results found.`,
    };
  }

  return {
    ok: true,
    exitCode: 0,
    outputText: [
      `Query: ${query}`,
      ...results.map((result, index) =>
        [
          `${index + 1}. ${result.title}`,
          `URL: ${result.url}`,
          `Snippet: ${result.snippet ?? "(none)"}`,
        ].join("\n"),
      ),
    ].join("\n\n"),
  };
}

export async function fetchWebPage(params: {
  url: string;
}): Promise<WebResearchResult> {
  const url = normalizeUrl(params.url);
  if (!url) {
    return {
      ok: false,
      code: "invalid_tool_args",
      message: "web_research open_page requires a valid http or https URL.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`https://r.jina.ai/http://${url}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message:
        error instanceof Error ? error.message : "web_research open_page request failed.",
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: `web_research open_page failed (${response.status}).`,
      outputPreview: text.slice(0, 500),
    };
  }

  const normalizedText = text.trim().slice(0, 40000);
  return {
    ok: true,
    exitCode: 0,
    outputText: normalizedText || `Fetched URL: ${url}\n(no readable content)`,
  };
}

export async function executeWebResearch(params: {
  action: "search" | "open_page" | "find_in_page";
  query?: string;
  url?: string;
}): Promise<WebResearchResult> {
  if (params.action === "search") {
    return searchWeb({ query: String(params.query ?? "").trim() });
  }
  if (params.action === "open_page") {
    return fetchWebPage({ url: String(params.url ?? "").trim() });
  }
  if (params.action === "find_in_page") {
    const url = String(params.url ?? "").trim();
    const query = String(params.query ?? "").trim();
    if (!url || !query) {
      return {
        ok: false,
        code: "invalid_tool_args",
        message: "web_research find_in_page requires url and query.",
      };
    }
    const page = await fetchWebPage({ url });
    if (!page.ok) return page;
    const text = String(page.outputText ?? "");
    const matchCount = text
      .toLowerCase()
      .split(query.toLowerCase())
      .length - 1;
    const preview = previewAroundMatch(text, query);
    return {
      ok: true,
      exitCode: 0,
      outputText:
        matchCount > 0
          ? [
              `URL: ${url}`,
              `Query: ${query}`,
              `Matches: ${matchCount}`,
              `Preview: ${preview || "(match found, preview unavailable)"}`,
            ].join("\n")
          : [
              `URL: ${url}`,
              `Query: ${query}`,
              "Matches: 0",
              "Preview: (none)",
            ].join("\n"),
    };
  }
  return {
    ok: false,
    code: "invalid_tool_args",
    message: "web_research action invalid.",
  };
}
