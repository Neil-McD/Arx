export type NormalizedSearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  backend: "openai" | "xai" | "fallback";
};

export type WebResearchBillingBackend = "openai" | "xai" | "fallback" | "jina";
export type WebResearchBillingCostSource = "provider_exact" | "estimated" | "mixed";

export type WebResearchBillingEvidence = {
  rawVendorCostUsd: number;
  costSource: WebResearchBillingCostSource;
  provider: WebResearchBillingBackend | "mixed";
  backends: WebResearchBillingBackend[];
  model?: string | null;
  usage?: {
    costInUsdTicks?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    reasoningTokens?: number | null;
    numServerSideToolsUsed?: number | null;
    serverSideToolUsage?: Record<string, number> | null;
  } | null;
};

export type StructuredWebSource = {
  url: string;
  host: string;
  label: string;
  snippet: string | null;
  backend: "openai" | "xai" | "fallback" | "page";
  kind: "search" | "opened";
};
