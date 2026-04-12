import type { NormalizedSearchResult } from "./webSearchTypes";

type OpenAiSearchSuccess = {
  ok: true;
  results: NormalizedSearchResult[];
  backend: "openai";
  quality: "strong" | "weak" | "empty";
  qualityReason: "strong_sources" | "too_few_results" | "low_authority" | "no_results";
};

type OpenAiSearchFailure = {
  ok: false;
  code: string;
  message: string;
  outputPreview?: string;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function normalizeHttpUrl(url: string | null | undefined): string | null {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeComparableUrl(url: string | null | undefined): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(value: string, maxChars: number): string {
  const normalized = normalizeInlineWhitespace(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function inferLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
    return path ? `${host}/${path}` : host;
  } catch {
    return url;
  }
}

function hostnameForUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isLowAuthorityHost(host: string | null): boolean {
  if (!host) return true;
  return [
    "wikipedia.org",
    "youtube.com",
    "youtu.be",
    "reddit.com",
    "quora.com",
    "medium.com",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
  ].some((value) => host === value || host.endsWith(`.${value}`));
}

function isPreferredCanonicalHost(host: string | null): boolean {
  if (!host) return false;
  if (host === "github.com" || host.endsWith(".github.com")) return true;
  if (host.startsWith("docs.") || host.includes(".docs.")) return true;
  if (host.startsWith("developer.") || host.includes(".developer.")) return true;
  if (host.endsWith(".gov") || host.endsWith(".edu")) return true;
  if (host === "developers.openai.com" || host === "platform.openai.com") return true;
  return false;
}

function evaluateCanonicalSearchQuality(results: NormalizedSearchResult[]): {
  quality: OpenAiSearchSuccess["quality"];
  qualityReason: OpenAiSearchSuccess["qualityReason"];
} {
  if (results.length === 0) {
    return { quality: "empty", qualityReason: "no_results" };
  }
  if (results.length < 2) {
    return { quality: "weak", qualityReason: "too_few_results" };
  }
  let preferredCount = 0;
  let lowAuthorityCount = 0;
  for (const result of results) {
    const host = hostnameForUrl(result.url);
    if (isPreferredCanonicalHost(host)) preferredCount += 1;
    if (isLowAuthorityHost(host)) lowAuthorityCount += 1;
  }
  if (preferredCount >= 1) {
    return { quality: "strong", qualityReason: "strong_sources" };
  }
  if (lowAuthorityCount === results.length) {
    return { quality: "weak", qualityReason: "low_authority" };
  }
  return { quality: "weak", qualityReason: "low_authority" };
}

function shouldPreferAuthority(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(doc|docs|documentation|api|sdk|github|repo|repository|readme|reference|guide|spec|specification|official)\b/.test(
    normalized,
  );
}

function shouldPreferFreshNews(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(latest|current|recent|today|yesterday|breaking|news|update|updates|development|developments)\b/.test(
    normalized,
  );
}

function buildSearchPrompt(query: string): string {
  const guidance: string[] = [];
  if (shouldPreferAuthority(query)) {
    guidance.push(
      "Prefer official documentation, official GitHub repositories, standards docs, and primary sources over mirrors, summaries, and forum posts.",
    );
  }
  if (shouldPreferFreshNews(query)) {
    guidance.push(
      "Prefer recent, credible reporting and primary sources. Avoid encyclopedias and stale background pages when fresher sources are available.",
    );
  }
  return [
    "Use web search to gather the most relevant sources for the user's query.",
    guidance.join(" "),
    "Return a concise researched answer with citations so the caller can extract the source URLs.",
    `User query: ${query}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSnippetFromText(text: string, startIndex: number, endIndex: number): string | null {
  const boundedStart = Math.max(0, Math.min(text.length, startIndex));
  const boundedEnd = Math.max(boundedStart, Math.min(text.length, endIndex));
  const windowStart = Math.max(0, boundedStart - 160);
  const windowEnd = Math.min(text.length, boundedEnd + 160);
  const snippet = normalizeInlineWhitespace(text.slice(windowStart, windowEnd));
  return snippet ? truncateLabel(snippet, 220) : null;
}

export async function searchWithOpenAiWebSearch(params: {
  query: string;
}): Promise<OpenAiSearchSuccess | OpenAiSearchFailure> {
  const apiKey = readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: "OPENAI_API_KEY is not configured.",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: readEnv("ARX_OPENAI_WEB_SEARCH_MODEL") || "gpt-4.1-mini",
        input: buildSearchPrompt(params.query),
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        tool_choice: "required",
        max_output_tokens: 1400,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: error instanceof Error ? error.message : "OpenAI web search request failed.",
    };
  }

  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // keep raw for preview
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message:
        typeof parsed?.error?.message === "string" && parsed.error.message.trim()
          ? parsed.error.message.trim()
          : `OpenAI web search failed (${response.status}).`,
      outputPreview: raw.slice(0, 1200),
    };
  }

  const output = Array.isArray(parsed?.output) ? parsed.output : [];
  const messageEntry = output.find((entry: any) => entry?.type === "message") ?? null;
  const outputTextEntry = Array.isArray(messageEntry?.content)
    ? messageEntry.content.find((entry: any) => entry?.type === "output_text")
    : null;
  const responseText = typeof outputTextEntry?.text === "string" ? outputTextEntry.text : "";
  const annotations = Array.isArray(outputTextEntry?.annotations) ? outputTextEntry.annotations : [];
  const results = new Map<string, NormalizedSearchResult>();

  for (const annotation of annotations) {
    const url = normalizeHttpUrl(annotation?.url);
    if (!url) continue;
    const key = normalizeComparableUrl(url);
    if (!key || results.has(key)) continue;
    results.set(key, {
      title:
        typeof annotation?.title === "string" && annotation.title.trim()
          ? truncateLabel(annotation.title.trim(), 160)
          : inferLabelFromUrl(url),
      url,
      backend: "openai",
      snippet:
        typeof annotation?.start_index === "number" && typeof annotation?.end_index === "number"
          ? buildSnippetFromText(responseText, annotation.start_index, annotation.end_index)
          : null,
    });
  }

  for (const entry of output) {
    if (entry?.type !== "web_search_call") continue;
    const sources = Array.isArray(entry?.action?.sources) ? entry.action.sources : [];
    for (const source of sources) {
      const url = normalizeHttpUrl(source?.url);
      if (!url) continue;
      const key = normalizeComparableUrl(url);
      if (!key || results.has(key)) continue;
      results.set(key, {
        title: inferLabelFromUrl(url),
        url,
        backend: "openai",
        snippet: null,
      });
    }
  }

  const quality = evaluateCanonicalSearchQuality([...results.values()]);

  return {
    ok: true,
    backend: "openai",
    results: [...results.values()].slice(0, 8),
    quality: quality.quality,
    qualityReason: quality.qualityReason,
  };
}
