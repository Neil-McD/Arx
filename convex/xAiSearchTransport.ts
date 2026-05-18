import type { NormalizedSearchResult, WebResearchBillingEvidence } from "./webSearchTypes";

type XAiSearchSuccess = {
  ok: true;
  results: NormalizedSearchResult[];
  backend: "xai";
  billingEvidence: WebResearchBillingEvidence;
};

type XAiSearchFailure = {
  ok: false;
  code: string;
  message: string;
  outputPreview?: string;
};

const XAI_USD_TICKS_PER_DOLLAR = 10_000_000_000;

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

function buildSnippetFromText(text: string): string | null {
  const normalized = normalizeInlineWhitespace(text.replace(/\[\[\d+\]\]\([^)]+\)/g, ""));
  if (!normalized) return null;
  return truncateLabel(normalized, 220);
}

function readFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeServerSideToolUsage(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const normalized: Record<string, number> = {};
  for (const [key, rawCount] of Object.entries(value as Record<string, unknown>)) {
    const count = readFiniteNumber(rawCount);
    if (!key || count === null) continue;
    normalized[key] = count;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function countServerSideXSearchCalls(output: unknown[]): number {
  return output.filter((entry: any) => entry?.type === "x_search_call").length;
}

function buildXAiBillingEvidence(params: {
  parsed: any;
  model: string;
  output: unknown[];
}): WebResearchBillingEvidence {
  const usage = params.parsed?.usage && typeof params.parsed.usage === "object"
    ? params.parsed.usage
    : {};
  const costInUsdTicks = readFiniteNumber(usage.cost_in_usd_ticks);
  const exactCostUsd =
    costInUsdTicks !== null ? Math.max(0, costInUsdTicks / XAI_USD_TICKS_PER_DOLLAR) : null;
  const serverSideToolUsage = normalizeServerSideToolUsage(usage.server_side_tool_usage);
  const xSearchCallCount = countServerSideXSearchCalls(params.output);
  const numServerSideToolsUsed =
    readFiniteNumber(usage.num_server_side_tools_used) ??
    (serverSideToolUsage
      ? Object.values(serverSideToolUsage).reduce((sum, count) => sum + count, 0)
      : xSearchCallCount || null);

  return {
    rawVendorCostUsd: exactCostUsd ?? 0,
    costSource: exactCostUsd !== null ? "provider_exact" : "estimated",
    provider: "xai",
    backends: ["xai"],
    model: params.model,
    usage: {
      costInUsdTicks,
      inputTokens: readFiniteNumber(usage.input_tokens ?? usage.prompt_tokens),
      outputTokens: readFiniteNumber(usage.output_tokens ?? usage.completion_tokens),
      totalTokens: readFiniteNumber(usage.total_tokens),
      reasoningTokens: readFiniteNumber(
        usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens,
      ),
      numServerSideToolsUsed,
      serverSideToolUsage,
    },
  };
}

function buildXSearchPrompt(query: string): string {
  return [
    "Use x_search aggressively to find the highest-signal current X-native sources for the user's query.",
    "Prefer direct posts, threads, quoted posts, and linked primary sources with high information density over generic profile or home pages.",
    "Lean into emerging signal, niche context, fast-moving developments, and informed technical discussion when they are relevant.",
    "Return a concise researched answer with citations so the caller can extract the source URLs.",
    `User query: ${query}`,
  ].join("\n");
}

export async function searchWithXAi(params: {
  query: string;
}): Promise<XAiSearchSuccess | XAiSearchFailure> {
  const apiKey = readEnv("XAI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: "XAI_API_KEY is not configured.",
    };
  }

  const model = readEnv("ARX_XAI_SEARCH_MODEL") || "grok-4.20-reasoning";
  let response: Response;
  try {
    response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: buildXSearchPrompt(params.query) }],
        tools: [
          {
            type: "x_search",
            enable_image_understanding: false,
            enable_video_understanding: false,
          },
        ],
        max_turns: 3,
        max_output_tokens: 1400,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      code: "web_research_unavailable",
      message: error instanceof Error ? error.message : "xAI search request failed.",
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
        typeof parsed?.error === "string" && parsed.error.trim()
          ? parsed.error.trim()
          : `xAI search failed (${response.status}).`,
      outputPreview: raw.slice(0, 1200),
    };
  }

  const output = Array.isArray(parsed?.output) ? parsed.output : [];
  const messageEntry = output.find((entry: any) => entry?.type === "message") ?? null;
  const outputTextEntry = Array.isArray(messageEntry?.content)
    ? messageEntry.content.find((entry: any) => entry?.type === "output_text")
    : null;
  const responseText =
    typeof outputTextEntry?.text === "string"
      ? outputTextEntry.text
      : Array.isArray(output)
        ? output
            .flatMap((entry: any) => (Array.isArray(entry?.content) ? entry.content : []))
            .map((entry: any) => (typeof entry?.text === "string" ? entry.text : ""))
            .join("\n")
        : "";
  const results = new Map<string, NormalizedSearchResult>();

  const annotations = Array.isArray(outputTextEntry?.annotations) ? outputTextEntry.annotations : [];
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
      backend: "xai",
      snippet: buildSnippetFromText(responseText),
    });
  }

  return {
    ok: true,
    backend: "xai",
    billingEvidence: buildXAiBillingEvidence({ parsed, model, output }),
    results: [...results.values()].slice(0, 8),
  };
}
