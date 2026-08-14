export const RUNTIME_ENGINE_POLYNET = "polynet";
export const RUNTIME_ENGINE_CODEX = "codex";
export const POLYNET_RUNTIME_ENGINE_ID = "runtime_convex";

export const RUNTIME_ENGINES = [
  RUNTIME_ENGINE_POLYNET,
  RUNTIME_ENGINE_CODEX,
] as const;

export type RuntimeEngine = (typeof RUNTIME_ENGINES)[number];

export const DEFAULT_ACTIVE_RUNTIME_ENGINE = RUNTIME_ENGINE_POLYNET;

export const ACTIVE_WORKSPACE_RUNTIME_ENGINES = [
  RUNTIME_ENGINE_POLYNET,
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
  return params.engine === RUNTIME_ENGINE_POLYNET;
}

export type PolynetRuntimeEngineResolution =
  | {
      ok: true;
      requestedRuntimeEngine: RuntimeEngine | null;
      resolvedRuntimeEngine: typeof RUNTIME_ENGINE_POLYNET;
      runtimeEngineSource: "request" | "default";
      engineId: typeof POLYNET_RUNTIME_ENGINE_ID;
    }
  | {
      ok: false;
      status: 400;
      code: "unsupported_runtime_engine";
      message: string;
      requestedRuntimeEngine: typeof RUNTIME_ENGINE_CODEX;
      resolvedRuntimeEngine: null;
      runtimeEngineSource: "request";
      engineId: null;
    };

export function resolvePolynetRuntimeEngine(params: {
  requestedRuntimeEngine: RuntimeEngine | null;
}): PolynetRuntimeEngineResolution {
  if (params.requestedRuntimeEngine === RUNTIME_ENGINE_CODEX) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_runtime_engine",
      message: "The native Polynet runtime is the only supported runtime engine.",
      requestedRuntimeEngine: RUNTIME_ENGINE_CODEX,
      resolvedRuntimeEngine: null,
      runtimeEngineSource: "request",
      engineId: null,
    };
  }

  return {
    ok: true,
    requestedRuntimeEngine: params.requestedRuntimeEngine,
    resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET,
    runtimeEngineSource: params.requestedRuntimeEngine ? "request" : "default",
    engineId: POLYNET_RUNTIME_ENGINE_ID,
  };
}
