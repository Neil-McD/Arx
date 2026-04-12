import { decodeHtmlEntities, searchWithFallbackHtml } from "./fallbackHtmlSearchTransport";
import { searchWithOpenAiWebSearch } from "./openAiWebSearchTransport";
import { searchWithXAi } from "./xAiSearchTransport";
import type { NormalizedSearchResult, StructuredWebSource } from "./webSearchTypes";

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function isTimeSensitiveSearchQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(latest|current|recent|today|yesterday|this week|this month|breaking|news|update|updates|development|developments)\b/.test(
    normalized,
  );
}

function isCanonicalSearchQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(doc|docs|documentation|api|sdk|github|repo|repository|readme|reference|guide|spec|specification|official|manual|changelog)\b/.test(
    normalized,
  );
}

function isFrontierSearchQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(alpha|signal|sentiment|reaction|buzz|chatter|discourse|on x|on twitter|what people are saying|what x is saying)\b/.test(
    normalized,
  );
}

type SearchBackendMode = "canonical" | "hybrid";

function routeSearchBackend(query: string): SearchBackendMode {
  const canonical = isCanonicalSearchQuery(query);
  const frontier = isFrontierSearchQuery(query);
  const timeSensitive = isTimeSensitiveSearchQuery(query);
  if (canonical && !timeSensitive && !frontier) return "canonical";
  return "hybrid";
}

function formatNormalizedResults(query: string, results: NormalizedSearchResult[], backendLabels: string[]): string {
  if (results.length === 0) return `Query: ${query}\nNo results found.`;
  const backendLabel = backendLabels.length > 0 ? `\nBackends: ${backendLabels.join(", ")}` : "";
  return [
    `Query: ${query}${backendLabel}`,
    ...results.map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        `URL: ${result.url}`,
        `Snippet: ${result.snippet ?? "(none)"}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function dedupeResults(results: NormalizedSearchResult[]): NormalizedSearchResult[] {
  const seen = new Set<string>();
  const deduped: NormalizedSearchResult[] = [];
  for (const result of results) {
    const key = normalizeUrl(result.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function inferUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathSegments = parsed.pathname.split("/").filter(Boolean).slice(0, 2);
    const path = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
    return host + path || url;
  } catch {
    return url;
  }
}

function hostForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildStructuredSearchSources(results: NormalizedSearchResult[]): StructuredWebSource[] {
  return results.map((result) => ({
    url: result.url,
    host: hostForUrl(result.url),
    label: result.title || inferUrlLabel(result.url),
    snippet: result.snippet,
    backend: result.backend,
    kind: "search",
  }));
}

function buildStructuredOpenedSource(url: string): StructuredWebSource {
  return {
    url,
    host: hostForUrl(url),
    label: inferUrlLabel(url),
    snippet: null,
    backend: "page",
    kind: "opened",
  };
}

function mergeResultsWithDiversity(
  batches: NormalizedSearchResult[][],
  maxResults: number,
): NormalizedSearchResult[] {
  const indexes = batches.map(() => 0);
  const seen = new Set<string>();
  const merged: NormalizedSearchResult[] = [];

  while (merged.length < maxResults) {
    let progressed = false;
    for (let batchIndex = 0; batchIndex < batches.length && merged.length < maxResults; batchIndex += 1) {
      const batch = batches[batchIndex] ?? [];
      while (indexes[batchIndex] < batch.length) {
        const candidate = batch[indexes[batchIndex]++];
        const key = normalizeUrl(candidate?.url ?? "");
        if (!candidate || !key || seen.has(key)) continue;
        seen.add(key);
        merged.push(candidate);
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  return merged;
}

type WebResearchResult =
  | {
      ok: true;
      outputText: string;
      exitCode: number;
      webSources?: StructuredWebSource[];
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

  const mode = routeSearchBackend(query);
  const backendLabels: string[] = [];
  const openAiResults: NormalizedSearchResult[] = [];
  const xAiResults: NormalizedSearchResult[] = [];
  const fallbackResults: NormalizedSearchResult[] = [];
  let needsCanonicalFallback = false;

  const openAiResult = await searchWithOpenAiWebSearch({ query });
  if (openAiResult.ok && openAiResult.quality === "strong") {
    backendLabels.push("openai");
    openAiResults.push(...openAiResult.results);
  } else {
    needsCanonicalFallback = true;
  }

  const shouldUseXAi = mode === "hybrid";
  if (shouldUseXAi) {
    const xAiResult = await searchWithXAi({ query });
    if (xAiResult.ok) {
      backendLabels.push("xai");
      xAiResults.push(...xAiResult.results);
    } else if (!openAiResult.ok) {
      return {
        ok: false,
        code: xAiResult.code,
        message: xAiResult.message,
        outputPreview: xAiResult.outputPreview,
      };
    }
  }

  if (needsCanonicalFallback) {
    const fallbackResult = await searchWithFallbackHtml({ query });
    if (!fallbackResult.ok) {
      return {
        ok: false,
        code: fallbackResult.code,
        message: fallbackResult.message,
        outputPreview: fallbackResult.outputPreview,
      };
    }
    fallbackResults.push(...fallbackResult.results);
    backendLabels.push("fallback");
  }

  const results =
    mode === "canonical"
      ? dedupeResults([...openAiResults, ...fallbackResults]).slice(0, 8)
      : mergeResultsWithDiversity([openAiResults, xAiResults, fallbackResults], 8);

  return {
    ok: true,
    exitCode: 0,
    outputText: formatNormalizedResults(query, results, backendLabels),
    webSources: buildStructuredSearchSources(results),
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
    webSources: [buildStructuredOpenedSource(url)],
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
      webSources: [buildStructuredOpenedSource(url)],
    };
  }
  return {
    ok: false,
    code: "invalid_tool_args",
    message: "web_research action invalid.",
  };
}
