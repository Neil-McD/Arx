type ProductLatencyDetails = Record<string, unknown>;

type ProductLatencyMark = {
  name: string;
  atMs: number;
  elapsedMs: number;
  details?: ProductLatencyDetails;
};

export type ProductLatencyTrace = {
  id: string;
  label: string;
  startedAtMs: number;
  startedAtIso: string;
  endedAtMs?: number;
  durationMs?: number;
  status?: "ok" | "cancelled" | "error";
  details?: ProductLatencyDetails;
  marks: ProductLatencyMark[];
};

type ProductLatencyWindow = Window & {
  __POLYNET_LATENCY_TRACES__?: ProductLatencyTrace[];
};

const TRACE_LIMIT = 100;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function getNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `latency_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function compactDetails(details: ProductLatencyDetails | undefined): ProductLatencyDetails | undefined {
  if (!details) return undefined;
  const next: ProductLatencyDetails = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function isProductLatencyTraceEnabled(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (env?.DEV) return true;
  if (!hasWindow()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugLatency") === "1") return true;
    return window.localStorage.getItem("polynet:debugLatency") === "1";
  } catch {
    return false;
  }
}

export function startProductLatencyTrace(
  label: string,
  details?: ProductLatencyDetails,
): ProductLatencyTrace | null {
  if (!isProductLatencyTraceEnabled()) return null;
  const startedAtMs = getNowMs();
  return {
    id: createTraceId(),
    label,
    startedAtMs,
    startedAtIso: new Date().toISOString(),
    details: compactDetails(details),
    marks: [],
  };
}

export function markProductLatencyTrace(
  trace: ProductLatencyTrace | null,
  name: string,
  details?: ProductLatencyDetails,
): void {
  if (!trace) return;
  const atMs = getNowMs();
  trace.marks.push({
    name,
    atMs,
    elapsedMs: atMs - trace.startedAtMs,
    details: compactDetails(details),
  });
}

export function finishProductLatencyTrace(
  trace: ProductLatencyTrace | null,
  status: "ok" | "cancelled" | "error" = "ok",
  details?: ProductLatencyDetails,
): void {
  if (!trace) return;
  const endedAtMs = getNowMs();
  trace.endedAtMs = endedAtMs;
  trace.durationMs = endedAtMs - trace.startedAtMs;
  trace.status = status;
  const finalDetails = compactDetails(details);
  if (finalDetails) {
    trace.details = {
      ...(trace.details ?? {}),
      ...finalDetails,
    };
  }
  if (hasWindow()) {
    const latencyWindow = window as ProductLatencyWindow;
    const traces = latencyWindow.__POLYNET_LATENCY_TRACES__ ?? [];
    traces.push(trace);
    latencyWindow.__POLYNET_LATENCY_TRACES__ = traces.slice(-TRACE_LIMIT);
  }
  if (typeof console === "undefined") return;
  const duration = typeof trace.durationMs === "number" ? `${Math.round(trace.durationMs)}ms` : "unknown";
  console.groupCollapsed(`[polynet latency] ${trace.label} ${status} ${duration}`);
  console.log({
    id: trace.id,
    label: trace.label,
    status: trace.status,
    durationMs: trace.durationMs,
    details: trace.details ?? null,
  });
  if (trace.marks.length > 0) {
    console.table(
      trace.marks.map((mark) => ({
        mark: mark.name,
        elapsedMs: Math.round(mark.elapsedMs),
        details: mark.details ? JSON.stringify(mark.details) : "",
      })),
    );
  }
  console.groupEnd();
}
