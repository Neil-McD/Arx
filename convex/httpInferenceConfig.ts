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
