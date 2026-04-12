export type WorkspaceInstrumentationScope =
  | "lifecycle"
  | "project"
  | "route"
  | "thread"
  | "preview"
  | "computer_use";

export type WorkspaceInstrumentationStatus = "start" | "success" | "failure" | "skip";

export type WorkspaceInstrumentationEvent = {
  at: number;
  scope: WorkspaceInstrumentationScope;
  name: string;
  status: WorkspaceInstrumentationStatus;
  projectId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  page?: string | null;
  view?: string | null;
  detail?: Record<string, unknown>;
  error?: string | null;
};

declare global {
  interface Window {
    __workspaceDebugEvents?: WorkspaceInstrumentationEvent[];
  }
}

const WORKSPACE_DEBUG_RING_BUFFER_SIZE = 200;

export function formatWorkspaceInstrumentationError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown_error";
}

export function isWorkspaceDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debugWorkspace") === "1") return true;
    if (window.localStorage.getItem("debug:workspace") === "1") return true;
  } catch {
    // ignore storage/query access failures
  }
  return false;
}

export function emitWorkspaceEvent(
  event: Omit<WorkspaceInstrumentationEvent, "at">,
): void {
  if (!isWorkspaceDebugEnabled()) return;
  const next: WorkspaceInstrumentationEvent = {
    at: Date.now(),
    ...event,
  };
  try {
    console.debug("[workspace]", next);
  } catch {
    // ignore console failures
  }
  if (typeof window === "undefined") return;
  const ring = Array.isArray(window.__workspaceDebugEvents) ? window.__workspaceDebugEvents : [];
  ring.push(next);
  if (ring.length > WORKSPACE_DEBUG_RING_BUFFER_SIZE) {
    ring.splice(0, ring.length - WORKSPACE_DEBUG_RING_BUFFER_SIZE);
  }
  window.__workspaceDebugEvents = ring;
}
