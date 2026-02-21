export type ModelSectionId = "all" | "free" | "openai" | "anthropic" | "google" | "x-ai" | "openrouter";
export type ModelCatalogSurface = "web" | "desktop";
export type ModelProviderId = "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

export type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

export type PremiumModelCatalogEntry = {
  id: string;
  label: string;
  section: Exclude<ModelSectionId, "all" | "free">;
  description: string;
};

type CatalogModelEntry = PremiumModelCatalogEntry & {
  surfaces: readonly ModelCatalogSurface[];
  defaultEnabled: boolean;
};

type FreeModelEntry = {
  id: string;
  label: string;
  description: string;
  openRouterModelRef: string;
};

export const DEFAULT_ACTIVE_MODEL_ID = "gpt-5.2";

const FREE_MODELS: readonly FreeModelEntry[] = [
  {
    id: "gpt-oss-120b-free",
    label: "GPT OSS 120B",
    description: "OpenRouter free tier",
    openRouterModelRef: "openai/gpt-oss-120b:free",
  },
  {
    id: "deepseek-r1-free",
    label: "DeepSeek R1",
    description: "OpenRouter free tier",
    openRouterModelRef: "deepseek/deepseek-r1-0528:free",
  },
];

const PREMIUM_MODELS: readonly CatalogModelEntry[] = [
  { id: "gpt-5.2", label: "GPT 5.2", section: "openai", description: "OpenAI", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "sonnet-4.5", label: "Sonnet 4.5", section: "anthropic", description: "Anthropic", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "opus-4.5", label: "Opus 4.5", section: "anthropic", description: "Anthropic", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "opus-4.6", label: "Opus 4.6", section: "anthropic", description: "Anthropic", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", section: "google", description: "Google", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", section: "google", description: "Google", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "grok-4.1", label: "Grok 4.1", section: "x-ai", description: "xAI", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "kimi-k2", label: "Kimi K2", section: "openrouter", description: "Moonshot via OpenRouter", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "glm-4.7", label: "GLM 4.7", section: "openrouter", description: "Zhipu via OpenRouter", surfaces: ["web", "desktop"], defaultEnabled: true },
  { id: "deepseek-v3.2", label: "DeepSeek V3.2", section: "openrouter", description: "DeepSeek via OpenRouter", surfaces: ["web", "desktop"], defaultEnabled: true },
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
  return FREE_MODELS.map((model) => ({ ...model }));
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
  return PREMIUM_MODELS.filter((model) => model.surfaces.includes(surface) && model.defaultEnabled).map((model) => ({
    id: model.id,
    label: model.label,
    enabled: true,
  }));
}

export function getPremiumModelCatalog(surface: ModelCatalogSurface): PremiumModelCatalogEntry[] {
  return PREMIUM_MODELS.filter((model) => model.surfaces.includes(surface)).map((model) => ({
    id: model.id,
    label: model.label,
    section: model.section,
    description: model.description,
  }));
}

export function isModelAvailableOnSurface(modelId: string | null | undefined, surface: ModelCatalogSurface): boolean {
  const id = normalizeModelId(modelId);
  if (!id) return false;
  if (FREE_MODEL_ALLOWLIST.has(id)) return true;
  return PREMIUM_MODELS.some((model) => model.id === id && model.surfaces.includes(surface));
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
