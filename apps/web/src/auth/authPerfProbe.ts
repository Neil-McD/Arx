type AuthPerfEvent = {
  kind: "start" | "end" | "instant";
  name: string;
  at: number;
  durationMs?: number | null;
  detail?: Record<string, unknown>;
};

type AuthPerfSnapshot = {
  events: AuthPerfEvent[];
  latestDurations: Record<
    string,
    {
      at: number;
      durationMs: number | null;
      detail?: Record<string, unknown>;
    }
  >;
};

declare global {
  interface Window {
    __authPerfData?: AuthPerfSnapshot;
  }
}

const PERF_EVENT_NAME = "auth-perf-update";
const MAX_EVENTS = 60;
let nextSpanId = 0;

const pendingSpans = new Map<
  string,
  {
    id: number;
    startMark: string;
    startAt: number;
    detail?: Record<string, unknown>;
  }
>();

function hasWindowPerformance(): boolean {
  return typeof window !== "undefined" && typeof window.performance !== "undefined";
}

function readSnapshot(): AuthPerfSnapshot {
  if (typeof window === "undefined") {
    return { events: [], latestDurations: {} };
  }
  if (!window.__authPerfData) {
    window.__authPerfData = { events: [], latestDurations: {} };
  }
  return window.__authPerfData;
}

function publishSnapshot(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PERF_EVENT_NAME));
}

function pushPerfEvent(event: AuthPerfEvent): void {
  const snapshot = readSnapshot();
  snapshot.events = [...snapshot.events.slice(-(MAX_EVENTS - 1)), event];
  if (event.kind === "end") {
    snapshot.latestDurations[event.name] = {
      at: event.at,
      durationMs: event.durationMs ?? null,
      detail: event.detail,
    };
  } else if (event.kind === "instant") {
    snapshot.latestDurations[event.name] = {
      at: event.at,
      durationMs: 0,
      detail: event.detail,
    };
  }
  publishSnapshot();
}

export function beginAuthPerfSpan(name: string, detail: Record<string, unknown> = {}): void {
  if (!hasWindowPerformance()) return;
  if (pendingSpans.has(name)) {
    endAuthPerfSpan(name, { overwritten: true });
  }
  const id = ++nextSpanId;
  const startMark = `auth-perf:${name}:start:${id}`;
  window.performance.mark(startMark);
  pendingSpans.set(name, {
    id,
    startMark,
    startAt: window.performance.now(),
    detail,
  });
  pushPerfEvent({
    kind: "start",
    name,
    at: Date.now(),
    detail,
  });
}

export function endAuthPerfSpan(name: string, detail: Record<string, unknown> = {}): void {
  if (!hasWindowPerformance()) return;
  const pending = pendingSpans.get(name);
  if (!pending) return;
  pendingSpans.delete(name);
  const endMark = `auth-perf:${name}:end:${pending.id}`;
  const measureName = `auth-perf:${name}:measure:${pending.id}`;
  window.performance.mark(endMark);
  window.performance.measure(measureName, pending.startMark, endMark);
  const durationMs = window.performance.now() - pending.startAt;
  pushPerfEvent({
    kind: "end",
    name,
    at: Date.now(),
    durationMs,
    detail: { ...pending.detail, ...detail },
  });
}

export async function measureAuthPerfSpan<TValue>(
  name: string,
  work: () => Promise<TValue>,
  detail: Record<string, unknown> = {},
): Promise<TValue> {
  beginAuthPerfSpan(name, detail);
  try {
    const result = await work();
    endAuthPerfSpan(name, { status: "ok" });
    return result;
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : typeof error === "string" && error.trim()
          ? error.trim()
          : "unknown_error";
    endAuthPerfSpan(name, { status: "error", reason });
    throw error;
  }
}

export function recordAuthPerfInstant(name: string, detail: Record<string, unknown> = {}): void {
  if (!hasWindowPerformance()) return;
  const markName = `auth-perf:${name}:instant:${++nextSpanId}`;
  window.performance.mark(markName);
  pushPerfEvent({
    kind: "instant",
    name,
    at: Date.now(),
    detail,
  });
}

export function readAuthPerfSnapshot(): AuthPerfSnapshot {
  return readSnapshot();
}

export function subscribeToAuthPerfUpdates(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PERF_EVENT_NAME, listener as EventListener);
  return () => {
    window.removeEventListener(PERF_EVENT_NAME, listener as EventListener);
  };
}
