export const RUNTIME_ENGINE_POLYNET = "polynet";
export const POLYNET_RUNTIME_ENGINE_ID = "runtime_convex";

export const RUNTIME_ENGINES = [RUNTIME_ENGINE_POLYNET] as const;
export type RuntimeEngine = (typeof RUNTIME_ENGINES)[number];

export const DEFAULT_ACTIVE_RUNTIME_ENGINE = RUNTIME_ENGINE_POLYNET;
export const ACTIVE_RUNTIME_ENGINES = RUNTIME_ENGINES;

export function normalizeRuntimeEngine(raw: unknown): RuntimeEngine | null {
  return String(raw ?? "").trim().toLowerCase() === RUNTIME_ENGINE_POLYNET
    ? RUNTIME_ENGINE_POLYNET
    : null;
}

export type RuntimeEngineAccessLevel = "included";

export function getRuntimeEngineAccessLevel(_engine: RuntimeEngine | null): RuntimeEngineAccessLevel {
  return "included";
}

export function canUseRuntimeEngine(params: { engine: RuntimeEngine | null }): boolean {
  return params.engine === RUNTIME_ENGINE_POLYNET;
}

export type PolynetRuntimeEngineResolution = {
  ok: true;
  requestedRuntimeEngine: RuntimeEngine | null;
  resolvedRuntimeEngine: typeof RUNTIME_ENGINE_POLYNET;
  runtimeEngineSource: "request" | "default";
  engineId: typeof POLYNET_RUNTIME_ENGINE_ID;
};

export function resolvePolynetRuntimeEngine(params: {
  requestedRuntimeEngine: RuntimeEngine | null;
}): PolynetRuntimeEngineResolution {
  return {
    ok: true,
    requestedRuntimeEngine: params.requestedRuntimeEngine,
    resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET,
    runtimeEngineSource: params.requestedRuntimeEngine ? "request" : "default",
    engineId: POLYNET_RUNTIME_ENGINE_ID,
  };
}
