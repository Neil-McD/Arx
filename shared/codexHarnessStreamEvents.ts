import { CODEX_HARNESS_PROBE_EVENT_MARKER } from "./codexHarnessProbeScript.ts";

export type CodexHarnessProbeStreamEvent = Record<string, unknown>;
export type CodexHarnessLogChunkStrategy =
  | "cumulative"
  | "duplicate"
  | "overlap"
  | "reset";

export const CODEX_HARNESS_LOG_OVERLAP_MIN_CHARS = 64;
export const CODEX_HARNESS_LOG_OVERLAP_MAX_SEARCH_CHARS = 64_000;

export function findCodexHarnessLogOverlapSuffixLength(
  previous: string,
  next: string,
): number {
  const previousText = String(previous ?? "");
  const nextText = String(next ?? "");
  const maxOverlap = Math.min(
    previousText.length,
    nextText.length,
    CODEX_HARNESS_LOG_OVERLAP_MAX_SEARCH_CHARS,
  );
  const minOverlap = Math.min(CODEX_HARNESS_LOG_OVERLAP_MIN_CHARS, maxOverlap);
  for (let length = maxOverlap; length >= minOverlap; length -= 1) {
    if (previousText.endsWith(nextText.slice(0, length))) return length;
  }
  return 0;
}

export function readCodexHarnessNextLogChunk(params: {
  previousLogText: string;
  nextLogText: string;
}): { chunk: string; strategy: CodexHarnessLogChunkStrategy } {
  const previousLogText = String(params.previousLogText ?? "");
  const nextLogText = String(params.nextLogText ?? "");
  if (!previousLogText) {
    return { chunk: nextLogText, strategy: "reset" };
  }
  if (nextLogText === previousLogText) {
    return { chunk: "", strategy: "duplicate" };
  }
  if (nextLogText.startsWith(previousLogText)) {
    return {
      chunk: nextLogText.slice(previousLogText.length),
      strategy: "cumulative",
    };
  }
  const overlapLength = findCodexHarnessLogOverlapSuffixLength(
    previousLogText,
    nextLogText,
  );
  if (overlapLength >= CODEX_HARNESS_LOG_OVERLAP_MIN_CHARS) {
    return { chunk: nextLogText.slice(overlapLength), strategy: "overlap" };
  }
  return { chunk: nextLogText, strategy: "reset" };
}

export function parseCodexHarnessProbeStreamEventLine(
  line: string,
): CodexHarnessProbeStreamEvent | null {
  const normalized = String(line ?? "").trim();
  if (!normalized.startsWith(CODEX_HARNESS_PROBE_EVENT_MARKER)) return null;
  const raw = normalized.slice(CODEX_HARNESS_PROBE_EVENT_MARKER.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CodexHarnessProbeStreamEvent)
      : null;
  } catch {
    return null;
  }
}

export function readCodexHarnessProbeStreamEvents(
  outputText: string,
  limit = 120,
): CodexHarnessProbeStreamEvent[] {
  const maxEvents = Math.max(0, Math.floor(limit));
  if (maxEvents === 0) return [];
  const events: CodexHarnessProbeStreamEvent[] = [];
  for (const rawLine of String(outputText ?? "").split(/\r?\n/)) {
    const parsed = parseCodexHarnessProbeStreamEventLine(rawLine);
    if (!parsed) continue;
    events.push(parsed);
    if (events.length >= maxEvents) break;
  }
  return events;
}

export function createCodexHarnessProbeStreamEventIncrementalParser(params?: {
  eventLimit?: number;
  maxBufferedLineChars?: number;
}): {
  push: (
    chunk: string,
    options?: { flush?: boolean },
  ) => CodexHarnessProbeStreamEvent[];
  getBufferedLine: () => string;
  getMalformedLineCount: () => number;
} {
  const eventLimit = Math.max(0, Math.floor(params?.eventLimit ?? 5000));
  const maxBufferedLineChars = Math.max(
    1000,
    Math.floor(params?.maxBufferedLineChars ?? 200_000),
  );
  let emittedEventCount = 0;
  let malformedLineCount = 0;
  let bufferedLine = "";

  const parseLine = (line: string): CodexHarnessProbeStreamEvent | null => {
    if (emittedEventCount >= eventLimit) return null;
    const normalized = String(line ?? "").trim();
    if (!normalized.startsWith(CODEX_HARNESS_PROBE_EVENT_MARKER)) return null;
    const raw = normalized.slice(CODEX_HARNESS_PROBE_EVENT_MARKER.length).trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        malformedLineCount += 1;
        return null;
      }
      emittedEventCount += 1;
      return parsed as CodexHarnessProbeStreamEvent;
    } catch {
      malformedLineCount += 1;
      return null;
    }
  };

  const push = (
    chunk: string,
    options?: { flush?: boolean },
  ): CodexHarnessProbeStreamEvent[] => {
    if (emittedEventCount >= eventLimit) return [];
    const combined = bufferedLine + String(chunk ?? "");
    const lines = combined.split(/\r?\n/);
    bufferedLine = lines.pop() ?? "";
    if (bufferedLine.length > maxBufferedLineChars) {
      bufferedLine = bufferedLine.slice(bufferedLine.length - maxBufferedLineChars);
    }
    const events: CodexHarnessProbeStreamEvent[] = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) events.push(parsed);
      if (emittedEventCount >= eventLimit) break;
    }
    if (emittedEventCount < eventLimit && bufferedLine) {
      const parsed = parseCodexHarnessProbeStreamEventLine(bufferedLine);
      if (parsed) {
        emittedEventCount += 1;
        events.push(parsed);
        bufferedLine = "";
      } else if (options?.flush === true) {
        parseLine(bufferedLine);
        bufferedLine = "";
      }
    }
    return events;
  };

  return {
    push,
    getBufferedLine: () => bufferedLine,
    getMalformedLineCount: () => malformedLineCount,
  };
}
