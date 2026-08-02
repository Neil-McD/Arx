export const RUNTIME_ENGINE_POLYNET = "polynet";
export const RUNTIME_ENGINE_CODEX = "codex";

export const RUNTIME_ENGINES = [
  RUNTIME_ENGINE_POLYNET,
  RUNTIME_ENGINE_CODEX,
] as const;

export type RuntimeEngine = (typeof RUNTIME_ENGINES)[number];

export const DEFAULT_ACTIVE_RUNTIME_ENGINE = RUNTIME_ENGINE_POLYNET;

export const ACTIVE_WORKSPACE_RUNTIME_ENGINES = [
  RUNTIME_ENGINE_POLYNET,
  RUNTIME_ENGINE_CODEX,
] as const satisfies readonly RuntimeEngine[];

export function normalizeRuntimeEngine(raw: unknown): RuntimeEngine | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === RUNTIME_ENGINE_POLYNET) return RUNTIME_ENGINE_POLYNET;
  if (value === RUNTIME_ENGINE_CODEX) return RUNTIME_ENGINE_CODEX;
  return null;
}

export function isActiveWorkspaceRuntimeEngine(engine: RuntimeEngine): boolean {
  return (ACTIVE_WORKSPACE_RUNTIME_ENGINES as readonly RuntimeEngine[]).includes(engine);
}

export function normalizeActiveWorkspaceRuntimeEngine(raw: unknown): RuntimeEngine {
  const engine = normalizeRuntimeEngine(raw);
  return engine && isActiveWorkspaceRuntimeEngine(engine)
    ? engine
    : DEFAULT_ACTIVE_RUNTIME_ENGINE;
}

export type RuntimeEngineAccessLevel = "included";

export function getRuntimeEngineDisplayName(engine: RuntimeEngine | null): string {
  if (engine === RUNTIME_ENGINE_CODEX) return "Codex";
  return "Polynet";
}

export function getRuntimeEngineAccessLevel(engine: RuntimeEngine | null): RuntimeEngineAccessLevel {
  return "included";
}

export function canUseRuntimeEngine(params: {
  engine: RuntimeEngine | null;
}): boolean {
  return params.engine === RUNTIME_ENGINE_POLYNET || params.engine === RUNTIME_ENGINE_CODEX;
}
