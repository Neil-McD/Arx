

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
