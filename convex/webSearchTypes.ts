export type WebResearchBillingCostSource = "provider_exact" | "estimated";

export type WebResearchBillingEvidence = {
  rawVendorCostUsd: number;
  costSource: WebResearchBillingCostSource;
  provider: "exa";
  backends: Array<"exa">;
};

export type StructuredWebSource = {
  url: string;
  host: string;
  label: string;
  snippet: string | null;
  backend: "exa";
  kind: "search" | "opened";
};
