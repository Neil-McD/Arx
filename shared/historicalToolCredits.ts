export const WORKSPACE_CREDITS_PER_USD = 100;

export function normalizePositiveInteger(raw: unknown, fallback: number, min = 1): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

