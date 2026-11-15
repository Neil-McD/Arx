// web_research: the guide's one web tool, on Exa (https://docs.exa.ai).
// search → POST /search with highlights; open_page and find_in_page →
// POST /contents for one public URL. Exa reports what each call cost, and
// that exact cost is what the community is charged.
import type {
  StructuredWebSource,
  WebResearchBillingEvidence,
} from "./webSearchTypes";
import {
  estimateWebResearchVendorCostUsd,
  type WebResearchCreditAction,
} from "../shared/providerPricing";
import { classifyWebResearchUrlAccess } from "../shared/webResearchUrlPolicy.ts";

const EXA_API = "https://api.exa.ai";
const EXA_TIMEOUT_MS = 25_000;
const SEARCH_RESULTS = 8;
const PAGE_MAX_CHARS = 40_000;

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

type ExaResult = {
  title?: string | null;
  url?: string;
  publishedDate?: string | null;
  text?: string | null;
  highlights?: string[] | null;
};

type ExaResponse = {
  results?: ExaResult[];
  statuses?: Array<{ id?: string; status?: string; error?: { tag?: string } | null }>;
  costDollars?: { total?: number } | null;
};

function hostForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function billing(action: WebResearchCreditAction, body: ExaResponse): WebResearchBillingEvidence {
  const total = Number(body.costDollars?.total);
  const exact = Number.isFinite(total) && total >= 0;
  return {
    rawVendorCostUsd: exact ? total : estimateWebResearchVendorCostUsd(action),
    costSource: exact ? "provider_exact" : "estimated",
    provider: "exa",
    backends: ["exa"],
  };
}

async function callExa(path: "/search" | "/contents", payload: Record<string, unknown>):
  Promise<{ ok: true; body: ExaResponse } | { ok: false; code: string; message: string; outputPreview?: string }> {
  const apiKey = String(process.env.EXA_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, code: "web_research_unavailable", message: "Web research isn't set up on this deployment." };
  }
  let response: Response;
  try {
    response = await fetch(`${EXA_API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: error instanceof Error && error.name === "TimeoutError" ? "Web research timed out." : "Web research request failed.",
    };
  }
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: `Web research failed (${response.status}).`,
      outputPreview: text.slice(0, 500),
    };
  }
  try {
    return { ok: true, body: JSON.parse(text) as ExaResponse };
  } catch {
    return { ok: false, code: "web_research_unavailable", message: "Web research returned an unreadable answer." };
  }
}

export async function searchWeb(params: { query: string }): Promise<WebResearchResult> {
  const query = String(params.query ?? "").trim();
  if (!query) {
    return { ok: false, code: "invalid_tool_args", message: "web_research search requires a non-empty query." };
  }
  const call = await callExa("/search", {
    query,
    type: "auto",
    numResults: SEARCH_RESULTS,
    contents: { highlights: true },
  });
  if (!call.ok) return call;
  const results = (call.body.results ?? [])
    .filter((result) => typeof result.url === "string" && classifyWebResearchUrlAccess(result.url).ok)
    .slice(0, SEARCH_RESULTS);
  const outputText = results.length === 0
    ? `Query: ${query}\nNo results found.`
    : [
        `Query: ${query}`,
        ...results.map((result, index) => [
          `${index + 1}. ${result.title || hostForUrl(result.url!)}`,
          `URL: ${result.url}`,
          ...(result.publishedDate ? [`Published: ${result.publishedDate.slice(0, 10)}`] : []),
          `Highlights: ${(result.highlights ?? []).join(" … ").trim() || "(none)"}`,
        ].join("\n")),
      ].join("\n\n");
  return {
    ok: true,
    exitCode: 0,
    outputText,
    webSources: results.map((result) => ({
      url: result.url!,
      host: hostForUrl(result.url!),
      label: result.title || hostForUrl(result.url!),
      snippet: result.highlights?.[0] ?? null,
      backend: "exa",
      kind: "search",
    })),
    billingEvidence: billing("search", call.body),
  };
}

// One public page's text; the URL rule runs before anything leaves Polynet.
async function readPage(rawUrl: string, action: WebResearchCreditAction):
  Promise<{ ok: true; url: string; title: string | null; text: string; billing: WebResearchBillingEvidence } | Extract<WebResearchResult, { ok: false }>> {
  const access = classifyWebResearchUrlAccess(rawUrl);
  if (!access.ok || !access.normalizedUrl) {
    return {
      ok: false,
      code: access.code ?? "invalid_tool_args",
      message: access.message ?? "web_research needs a valid http or https URL.",
    };
  }
  const url = access.normalizedUrl;
  const call = await callExa("/contents", { urls: [url], text: { maxCharacters: PAGE_MAX_CHARS } });
  if (!call.ok) return call;
  const status = call.body.statuses?.[0];
  const page = call.body.results?.[0];
  if ((status && status.status !== "success") || !page) {
    return { ok: false, code: "web_research_page_unavailable", message: `Couldn't read ${url}${status?.error?.tag ? ` (${status.error.tag})` : ""}.` };
  }
  return { ok: true, url, title: page.title ?? null, text: String(page.text ?? "").trim(), billing: billing(action, call.body) };
}

function openedSource(url: string, title: string | null): StructuredWebSource {
  return { url, host: hostForUrl(url), label: title || hostForUrl(url), snippet: null, backend: "exa", kind: "opened" };
}

export async function fetchWebPage(params: { url: string }): Promise<WebResearchResult> {
  const page = await readPage(params.url, "open_page");
  if (!page.ok) return page;
  return {
    ok: true,
    exitCode: 0,
    outputText: [`URL: ${page.url}`, ...(page.title ? [`Title: ${page.title}`] : []), "", page.text || "(no readable content)"].join("\n"),
    webSources: [openedSource(page.url, page.title)],
    billingEvidence: page.billing,
  };
}

function previewAroundMatch(text: string, query: string): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 240), Math.min(text.length, index + query.length + 240)).trim();
}

export async function executeWebResearch(params: {
  action: "search" | "open_page" | "find_in_page";
  query?: string;
  url?: string;
}): Promise<WebResearchResult> {
  if (params.action === "search") return searchWeb({ query: String(params.query ?? "").trim() });
  if (params.action === "open_page") return fetchWebPage({ url: String(params.url ?? "").trim() });
  if (params.action === "find_in_page") {
    const url = String(params.url ?? "").trim();
    const query = String(params.query ?? "").trim();
    if (!url || !query) {
      return { ok: false, code: "invalid_tool_args", message: "web_research find_in_page requires url and query." };
    }
    const page = await readPage(url, "find_in_page");
    if (!page.ok) return page;
    const matchCount = page.text.toLowerCase().split(query.toLowerCase()).length - 1;
    return {
      ok: true,
      exitCode: 0,
      outputText: [
        `URL: ${page.url}`,
        `Query: ${query}`,
        `Matches: ${matchCount}`,
        `Preview: ${matchCount > 0 ? previewAroundMatch(page.text, query) || "(match found, preview unavailable)" : "(none)"}`,
      ].join("\n"),
      webSources: [openedSource(page.url, page.title)],
      billingEvidence: page.billing,
    };
  }
  return { ok: false, code: "invalid_tool_args", message: "web_research action invalid." };
}
