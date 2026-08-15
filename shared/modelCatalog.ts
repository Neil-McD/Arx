export type ModelSectionId = "all" | "free" | "openai" | "anthropic" | "google" | "x-ai" | "openrouter";
export type ModelCatalogSurface = "web";
export type ModelProviderId = "openai" | "anthropic" | "google" | "x-ai" | "openrouter";
export type ModelFundingSource = "demo_public" | "user_key" | "user_chatgpt";
export type ModelRegistryRow = {
  id: string;
  provider: ModelProviderId;
  display_name: string;
  supported_sources: readonly ModelFundingSource[];
  sort_order: number;
  enabled: boolean;
};

export type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

export type ModelCatalogEntry = {
  id: string;
  label: string;
  section: Exclude<ModelSectionId, "all" | "free">;
  description: string;
  supportedFundingSources: readonly ModelFundingSource[];
};

type CatalogModelEntry = ModelCatalogEntry & {
  surfaces: readonly ModelCatalogSurface[];
  defaultEnabled: boolean;
  supportsImageInput: boolean;
};

type FreeModelEntry = {
  id: string;
  label: string;
  description: string;
  openRouterModelRef: string;
  supportedFundingSources: readonly ModelFundingSource[];
  supportsImageInput: boolean;
};

export const DEFAULT_ACTIVE_MODEL_ID = "gpt-5.6-sol";
export const DEFAULT_ACTIVE_MODEL_LABEL = "GPT 5.6 Sol";

const FREE_MODELS: readonly FreeModelEntry[] = [
  {
    id: "gpt-oss-120b-free",
    label: "GPT OSS 120B",
    description: "OpenRouter free tier",
    openRouterModelRef: "openai/gpt-oss-120b:free",
    supportedFundingSources: ["demo_public", "user_key"],
    supportsImageInput: false,
  },
];

const CONNECTED_PROVIDER_MODELS: readonly CatalogModelEntry[] = [
  { id: DEFAULT_ACTIVE_MODEL_ID, label: DEFAULT_ACTIVE_MODEL_LABEL, section: "openai", description: "OpenAI", supportedFundingSources: ["user_key", "user_chatgpt"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
  { id: "gpt-5.5", label: "GPT 5.5", section: "openai", description: "OpenAI compatibility", supportedFundingSources: ["user_key", "user_chatgpt"], surfaces: ["web"], defaultEnabled: false, supportsImageInput: true },
  { id: "sonnet-4.6", label: "Sonnet 4.6", section: "anthropic", description: "Anthropic", supportedFundingSources: ["user_key"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
  { id: "opus-4.6", label: "Opus 4.6", section: "anthropic", description: "Anthropic", supportedFundingSources: ["user_key"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", section: "google", description: "Google", supportedFundingSources: ["user_key"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", section: "google", description: "Google", supportedFundingSources: ["user_key"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
  { id: "grok-4.1", label: "Grok 4.1", section: "x-ai", description: "xAI", supportedFundingSources: ["user_key"], surfaces: ["web"], defaultEnabled: true, supportsImageInput: true },
];

export const DEFAULT_GUEST_MODEL_ID = FREE_MODELS[0]!.id;

export const FREE_MODEL_ALLOWLIST: ReadonlySet<string> = new Set(
  FREE_MODELS.map((model) => model.id.toLowerCase()),
);

export const FREE_MODEL_LABELS: Readonly<Record<string, string>> = Object.freeze(
  FREE_MODELS.reduce<Record<string, string>>((acc, model) => {
    acc[model.id] = model.label;
    return acc;
  }, {}),
);

export function getFreeModelEntries(): FreeModelEntry[] {
  return FREE_MODELS.map((model) => ({
    ...model,
    supportedFundingSources: [...model.supportedFundingSources],
  }));
}

export function getPublicFreeModelMap(): Record<string, string> {
  return FREE_MODELS.reduce<Record<string, string>>((acc, model) => {
    const id = String(model.id ?? "").trim();
    const ref = String(model.openRouterModelRef ?? "").trim();
    if (!id || !ref) return acc;
    acc[id] = ref;
    return acc;
  }, {});
}

export function getDefaultModelToggles(surface: ModelCatalogSurface): ModelToggle[] {
  return CONNECTED_PROVIDER_MODELS.filter((model) => model.surfaces.includes(surface) && model.defaultEnabled).map((model) => ({
    id: model.id,
    label: model.label,
    enabled: true,
  }));
}

export function getModelCatalog(surface: ModelCatalogSurface): ModelCatalogEntry[] {
  return CONNECTED_PROVIDER_MODELS.filter((model) => model.surfaces.includes(surface)).map((model) => ({
    id: model.id,
    label: model.label,
    section: model.section,
    description: model.description,
    supportedFundingSources: [...model.supportedFundingSources],
  }));
}

export function getModelRegistryRows(surface: ModelCatalogSurface): ModelRegistryRow[] {
  return CONNECTED_PROVIDER_MODELS.filter((model) => model.surfaces.includes(surface))
    .map((model, index) => ({
      id: model.id,
      provider: model.section,
      display_name: model.label,
      supported_sources: [...model.supportedFundingSources],
      sort_order: index * 10 + 10,
      enabled: model.defaultEnabled,
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function getSupportedFundingSourcesForModel(modelId: string | null | undefined): ModelFundingSource[] {
  const id = normalizeModelId(modelId);
  if (!id) return [];
  const freeModel = FREE_MODELS.find((model) => model.id === id);
  if (freeModel) return [...freeModel.supportedFundingSources];
  const connectedProviderModel = CONNECTED_PROVIDER_MODELS.find((model) => model.id === id);
  if (connectedProviderModel) return [...connectedProviderModel.supportedFundingSources];
  return [];
}

export function supportsModelFundingSource(
  modelId: string | null | undefined,
  fundingSource: ModelFundingSource,
): boolean {
  return getSupportedFundingSourcesForModel(modelId).includes(fundingSource);
}

export function supportsModelImageInput(modelId: string | null | undefined): boolean {
  const id = normalizeModelId(modelId);
  if (!id) return false;
  const freeModel = FREE_MODELS.find((model) => model.id === id);
  if (freeModel) return freeModel.supportsImageInput;
  return CONNECTED_PROVIDER_MODELS.find((model) => model.id === id)?.supportsImageInput === true;
}

export function isModelAvailableOnSurface(modelId: string | null | undefined, surface: ModelCatalogSurface): boolean {
  const id = normalizeModelId(modelId);
  if (!id) return false;
  if (FREE_MODEL_ALLOWLIST.has(id)) return true;
  return CONNECTED_PROVIDER_MODELS.some((model) => model.id === id && model.surfaces.includes(surface));
}

export function isFreeModelId(modelId: string | null | undefined, allowlist: ReadonlySet<string> = FREE_MODEL_ALLOWLIST): boolean {
  const id = normalizeModelId(modelId);
  if (!id) return false;
  return allowlist.has(id);
}

export function inferModelSection(modelId: string, providerId: string | null | undefined): Exclude<ModelSectionId, "all"> {
  if (isFreeModelId(modelId)) return "free";

  const mappedProvider = String(providerId ?? "").trim().toLowerCase();
  if (mappedProvider === "openai") return "openai";
  if (mappedProvider === "anthropic") return "anthropic";
  if (mappedProvider === "google") return "google";
  if (mappedProvider === "x-ai" || mappedProvider === "xai") return "x-ai";
  if (mappedProvider === "openrouter") return "openrouter";

  const id = normalizeModelId(modelId);
  if (id.startsWith("gpt-")) return "openai";
  if (id.startsWith("sonnet-") || id.startsWith("opus-")) return "anthropic";
  if (id.startsWith("gemini-")) return "google";
  if (id.startsWith("grok-")) return "x-ai";
  return "openrouter";
}

export function inferModelProviderId(modelId: string, providerId: string | null | undefined): ModelProviderId {
  const section = inferModelSection(modelId, providerId);
  if (section === "free") return "openrouter";
  return section;
}

function normalizeModelId(modelId: string | null | undefined): string {
  return String(modelId ?? "").trim().toLowerCase();
}
