export const WORKSPACE_CREDITS_PER_USD = 100;
export const PAID_TOOL_TARGET_GROSS_MARGIN_BPS = 6000;

// Includes retired runtime identities so immutable financial evidence stays legible.
export const PAID_TOOL_LEDGER_TOOL_NAMES = [
  "workspace_compute",
  "web_research",
  "voice_transcribe",
] as const;

export function getPaidToolLedgerLabel(toolName: string): string | null {
  const normalized = String(toolName ?? "").trim();
  if (normalized === "workspace_compute" || normalized === "codex_runtime") {
    return "Retired runtime";
  }
  if (normalized === "web_research") return "Web research";
  if (normalized === "voice_transcribe") return "Voice input";
  return null;
}

export function normalizePositiveInteger(raw: unknown, fallback: number, min = 1): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function creditsToUsd(credits: number): number {
  return Math.round((Math.max(0, Number(credits) || 0) / WORKSPACE_CREDITS_PER_USD) * 10000) / 10000;
}
