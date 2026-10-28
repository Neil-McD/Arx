import { searchWithFallbackHtml } from "./fallbackHtmlSearchTransport";
import { searchWithOpenAiWebSearch } from "./openAiWebSearchTransport";
import type {
  NormalizedSearchResult,
  StructuredWebSource,
  WebResearchBillingBackend,
  WebResearchBillingCostSource,
  WebResearchBillingEvidence,
} from "./webSearchTypes";
import {
  estimateWebResearchVendorCostUsd,
  type WebResearchCreditAction,
} from "../shared/providerPricing";
import {
  classifyWebResearchUrlAccess,
  normalizeWebResearchUrl,
} from "../shared/webResearchUrlPolicy.ts";

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
    const key = normalizeWebResearchUrl(result.url);
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

function buildEstimatedBillingEvidence(params: {
  backend: WebResearchBillingBackend;
  action: WebResearchCreditAction;
  rawVendorCostUsd?: number;
}): WebResearchBillingEvidence {
  return {
    rawVendorCostUsd:
      typeof params.rawVendorCostUsd === "number"
        ? Math.max(0, params.rawVendorCostUsd)
        : estimateWebResearchVendorCostUsd(params.action),
    costSource: "estimated",
    provider: params.backend,
    backends: [params.backend],
    usage: null,
  };
}

function combineBillingEvidence(
  evidenceParts: WebResearchBillingEvidence[],
): WebResearchBillingEvidence | undefined {
  if (evidenceParts.length === 0) return undefined;
  const backends = [...new Set(evidenceParts.flatMap((evidence) => evidence.backends))];
  const rawVendorCostUsd = evidenceParts.reduce(
    (sum, evidence) => sum + Math.max(0, Number(evidence.rawVendorCostUsd) || 0),
    0,
  );
  const costSources = new Set<WebResearchBillingCostSource>(
    evidenceParts.map((evidence) => evidence.costSource),
  );
  const costSource =
    costSources.size === 1
      ? evidenceParts[0].costSource
      : "mixed";
  const exactUsage = evidenceParts.find((evidence) => evidence.usage)?.usage ?? null;
  return {
    rawVendorCostUsd,
    costSource,
    provider: backends.length === 1 ? backends[0] : "mixed",
    backends,
    model: evidenceParts.length === 1 ? evidenceParts[0].model ?? null : null,
    usage: exactUsage,
  };
}

type WebResearchResult =
  | {
      ok: true;
      outputText: string;
      exitCode: number;
      webSources?: StructuredWebSource[];
      billingEvidence?: WebResearchBillingEvidence;
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

  const backendLabels: string[] = [];
  const openAiResults: NormalizedSearchResult[] = [];
  const fallbackResults: NormalizedSearchResult[] = [];
  const billingEvidenceParts: WebResearchBillingEvidence[] = [];
  let needsCanonicalFallback = false;

  const openAiResult = await searchWithOpenAiWebSearch({ query });
  if (openAiResult.ok) {
    billingEvidenceParts.push(buildEstimatedBillingEvidence({ backend: "openai", action: "search" }));
  }
  if (openAiResult.ok && openAiResult.quality === "strong") {
    backendLabels.push("openai");
    openAiResults.push(...openAiResult.results);
  } else {
    needsCanonicalFallback = true;
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
    billingEvidenceParts.push(
      buildEstimatedBillingEvidence({ backend: "fallback", action: "search", rawVendorCostUsd: 0 }),
    );
  }

  const results = dedupeResults([...openAiResults, ...fallbackResults]).slice(0, 8);

  return {
    ok: true,
    exitCode: 0,
    outputText: formatNormalizedResults(query, results, backendLabels),
    webSources: buildStructuredSearchSources(results),
    billingEvidence: combineBillingEvidence(billingEvidenceParts),
  };
}

export async function fetchWebPage(params: {
  url: string;
}): Promise<WebResearchResult> {
  const access = classifyWebResearchUrlAccess(params.url);
  if (!access.ok || !access.normalizedUrl) {
    return {
      ok: false,
      code: access.code ?? "invalid_tool_args",
      message: access.message ?? "web_research open_page requires a valid http or https URL.",
    };
  }
  const url = access.normalizedUrl;

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
    billingEvidence: buildEstimatedBillingEvidence({ backend: "jina", action: "open_page" }),
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
      billingEvidence: buildEstimatedBillingEvidence({ backend: "jina", action: "find_in_page" }),
    };
  }
  return {
    ok: false,
    code: "invalid_tool_args",
    message: "web_research action invalid.",
  };
}
