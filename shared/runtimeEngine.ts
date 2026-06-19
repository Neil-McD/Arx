export const RUNTIME_ENGINE_POLYNET = "polynet";
export const RUNTIME_ENGINE_CODEX = "codex";

export const RUNTIME_ENGINES = [
  RUNTIME_ENGINE_POLYNET,
  RUNTIME_ENGINE_CODEX,
] as const;

export type RuntimeEngine = (typeof RUNTIME_ENGINES)[number];

export function normalizeRuntimeEngine(raw: unknown): RuntimeEngine | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === RUNTIME_ENGINE_POLYNET) return RUNTIME_ENGINE_POLYNET;
  if (value === RUNTIME_ENGINE_CODEX) return RUNTIME_ENGINE_CODEX;
  return null;
}
