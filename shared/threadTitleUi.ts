export type ThreadTitleLane = "chat" | "agent";

const THREAD_CONTEXT_TRACE_STORAGE_KEY = "arx:trace-thread-context";
const LEGACY_DEFAULT_THREAD_TITLE = "untitled thread";

export function isMissingThreadTitleValue(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return !normalized || normalized === LEGACY_DEFAULT_THREAD_TITLE;
}

export function deriveThreadTitleFromUserText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  if (collapsed.length <= 64) return collapsed;
  return `${collapsed.slice(0, 64).trimEnd()}...`;
}

export function buildContextFallbackThreadTitle(params: {
  threadId: string;
  hints: Array<string | null | undefined>;
  lane?: ThreadTitleLane;
}): string {
  const cleanedHints = params.hints
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0);
  if (cleanedHints.length > 0) {
    const joined = cleanedHints.join(" · ");
    return deriveThreadTitleFromUserText(joined) || joined;
  }
  if (params.lane) {
    const laneLabel = params.lane === "agent" ? "Agent" : "Chat";
    return `${laneLabel} ${params.threadId.slice(0, 6)}`;
  }
  return `Thread ${params.threadId.slice(0, 6)}`;
}

function isThreadContextTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const globalToggle = (window as unknown as { __ARX_TRACE_THREAD_CONTEXT__?: boolean })
      .__ARX_TRACE_THREAD_CONTEXT__;
    if (globalToggle === true) return true;
    return window.localStorage?.getItem(THREAD_CONTEXT_TRACE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function traceThreadContext(event: string, payload: Record<string, unknown>): void {
  if (!isThreadContextTraceEnabled()) return;
  console.debug("[thread-context-trace]", {
    event,
    ts: new Date().toISOString(),
    ...payload,
  });
}
