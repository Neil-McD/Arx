export type RuntimeInstrumentationScope =
  | "lifecycle"
  | "route"
  | "thread"

export type RuntimeInstrumentationStatus = "start" | "success" | "failure" | "skip";

export type RuntimeInstrumentationEvent = {
  at: number;
  scope: RuntimeInstrumentationScope;
  name: string;
  status: RuntimeInstrumentationStatus;
  threadId?: string | null;
  runId?: string | null;
  page?: string | null;
  view?: string | null;
  detail?: Record<string, unknown>;
  error?: string | null;
};

declare global {
  interface Window {
    __agentRuntimeDebugEvents?: RuntimeInstrumentationEvent[];
  }
}

const AGENT_RUNTIME_DEBUG_RING_BUFFER_SIZE = 200;

export function formatRuntimeInstrumentationError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown_error";
}

export function isAgentRuntimeDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debugAgentRuntime") === "1") return true;
    if (window.localStorage.getItem("debug:agent-runtime") === "1") return true;
  } catch {
    // ignore storage/query access failures
  }
  return false;
}

export function emitAgentRuntimeEvent(
  event: Omit<RuntimeInstrumentationEvent, "at">,
): void {
  if (!isAgentRuntimeDebugEnabled()) return;
  const next: RuntimeInstrumentationEvent = {
    at: Date.now(),
    ...event,
  };
  try {
    console.debug("[agent-runtime]", JSON.stringify(next));
  } catch {
    // ignore console failures
  }
  if (typeof window === "undefined") return;
  const ring = Array.isArray(window.__agentRuntimeDebugEvents) ? window.__agentRuntimeDebugEvents : [];
  ring.push(next);
  if (ring.length > AGENT_RUNTIME_DEBUG_RING_BUFFER_SIZE) {
    ring.splice(0, ring.length - AGENT_RUNTIME_DEBUG_RING_BUFFER_SIZE);
  }
  window.__agentRuntimeDebugEvents = ring;
}

