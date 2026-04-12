import type { ModelFundingSource, ModelProviderId, ModelToggle } from "./modelCatalog";

type ModelRegistryRow = {
  id?: unknown;
  provider?: unknown;
  display_name?: unknown;
  supported_sources?: unknown;
};

export type ModelRegistryParseDiagnostics = {
  total_rows: number;
  accepted_rows: number;
  dropped_empty_id: number;
  dropped_duplicate_id: number;
  dropped_not_allowed: number;
  dropped_invalid_row: number;
  unknown_provider: number;
};

export type ParsedModelRegistry = {
  catalog: ModelToggle[];
  providerById: Record<string, ModelProviderId>;
  supportedSourcesById: Record<string, ModelFundingSource[]>;
  diagnostics: ModelRegistryParseDiagnostics;
};

type ParseModelRegistryRowsOptions = {
  isModelAllowed?: (modelId: string) => boolean;
  formatModelLabel?: (modelId: string) => string | null;
};

function normalizeProviderId(rawValue: unknown): ModelProviderId | null {
  const value = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  if (value === "openai") return "openai";
  if (value === "anthropic") return "anthropic";
  if (value === "google") return "google";
  if (value === "x-ai" || value === "xai") return "x-ai";
  if (value === "openrouter") return "openrouter";
  return null;
}

function normalizeFundingSource(rawValue: unknown): ModelFundingSource | null {
  const value = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  if (value === "demo_public") return "demo_public";
  if (value === "user_key") return "user_key";
  if (value === "user_chatgpt" || value === "chatgpt") return "user_chatgpt";
  return null;
}

export function parseModelRegistryRows(
  rows: unknown,
  options: ParseModelRegistryRowsOptions = {},
): ParsedModelRegistry {
  const list = Array.isArray(rows) ? (rows as ModelRegistryRow[]) : [];
  const diagnostics: ModelRegistryParseDiagnostics = {
    total_rows: list.length,
    accepted_rows: 0,
    dropped_empty_id: 0,
    dropped_duplicate_id: 0,
    dropped_not_allowed: 0,
    dropped_invalid_row: 0,
    unknown_provider: 0,
  };
  const seen = new Set<string>();
  const catalog: ModelToggle[] = [];
  const providerById: Record<string, ModelProviderId> = {};
  const supportedSourcesById: Record<string, ModelFundingSource[]> = {};

  for (const row of list) {
    if (!row || typeof row !== "object") {
      diagnostics.dropped_invalid_row += 1;
      continue;
    }
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) {
      diagnostics.dropped_empty_id += 1;
      continue;
    }
    const dedupeKey = id.toLowerCase();
    if (seen.has(dedupeKey)) {
      diagnostics.dropped_duplicate_id += 1;
      continue;
    }
    if (options.isModelAllowed && !options.isModelAllowed(id)) {
      diagnostics.dropped_not_allowed += 1;
      continue;
    }
    const provider = normalizeProviderId(row.provider);
    if (typeof row.provider === "string" && row.provider.trim() && !provider) {
      diagnostics.unknown_provider += 1;
    }
    if (provider) providerById[id] = provider;
    const supportedSources = Array.isArray(row.supported_sources)
      ? row.supported_sources
          .map((value) => normalizeFundingSource(value))
          .filter((value): value is ModelFundingSource => value !== null)
      : [];
    if (supportedSources.length > 0) {
      supportedSourcesById[id] = Array.from(new Set(supportedSources));
    }
    const label =
      (typeof row.display_name === "string" ? row.display_name.trim() : "") ||
      (options.formatModelLabel?.(id)?.trim() ?? "") ||
      id;
    catalog.push({ id, label, enabled: true });
    seen.add(dedupeKey);
    diagnostics.accepted_rows += 1;
  }

  return { catalog, providerById, supportedSourcesById, diagnostics };
}
