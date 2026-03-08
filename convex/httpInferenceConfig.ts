const DEFAULT_PUBLIC_MODEL_MAP: Record<string, string> = Object.freeze({
  "gpt-oss-120b-free": "openai/gpt-oss-120b:free",
});

const DEFAULT_PLATFORM_MODEL_MAP: Record<string, string> = Object.freeze({
  "gpt-5.4": "openai/gpt-5.4",
  "sonnet-4.6": "anthropic/claude-sonnet-4-5",
  "opus-4.6": "anthropic/claude-opus-4-1",
  "gemini-3-flash": "google/gemini-2.5-flash",
  "gemini-3.1-pro": "google/gemini-2.5-pro",
  "grok-4.1": "x-ai/grok-4-fast",
});

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function parseModelMapFromEnv(name: string): Record<string, string> {
  const raw = readEnv(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const alias = String(key ?? "").trim();
      const ref = typeof value === "string" ? value.trim() : "";
      if (!alias || !ref) continue;
      out[alias] = ref;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadPublicModelMap(): Record<string, string> {
  const override = parseModelMapFromEnv("ARX_PUBLIC_MODEL_MAP_JSON");
  if (Object.keys(override).length > 0) return override;
  return { ...DEFAULT_PUBLIC_MODEL_MAP };
}

export function loadPlatformModelMap(): Record<string, string> {
  const override = parseModelMapFromEnv("ARX_PLATFORM_MODEL_MAP_JSON");
  if (Object.keys(override).length > 0) return override;
  return { ...DEFAULT_PLATFORM_MODEL_MAP };
}

export function normalizePositiveInt(raw: unknown, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function parseBoolish(raw: unknown, fallback = false): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
  if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  return fallback;
}

export function parseOptionalString(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLen);
}

export function parseProviderModelRef(raw: string): { provider: string; providerModel: string } | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const slashAt = value.indexOf("/");
  if (slashAt <= 0 || slashAt >= value.length - 1) return null;
  const provider = value.slice(0, slashAt).trim().toLowerCase();
  const providerModel = value.slice(slashAt + 1).trim();
  if (!provider || !providerModel) return null;
  return { provider, providerModel };
}
