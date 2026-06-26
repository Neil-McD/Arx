import { isComputerUseToolName } from "./retrievalTools.ts";
import type { CloudRuntimeRunEventTransportRow } from "./cloudThreadsRead";

export type RuntimeComputerUseStep = {
  id: string;
  seq: number;
  title: string;
  summary: string | null;
  status: "running" | "ok" | "error";
};

export type RuntimeComputerUseViewerState = {
  latestFrameUrl: string | null;
  latestActionTitle: string | null;
  latestSummary: string | null;
  pendingActionTitle: string | null;
  status: "active" | "stopped" | "error";
  recentSteps: RuntimeComputerUseStep[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toFiniteNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toStringValue(item))
    .filter((item): item is string => Boolean(item));
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function readRuntimeToolName(payload: Record<string, unknown> | null): string | null {
  return toStringValue(payload?.tool_name) ?? toStringValue(payload?.tool);
}

function readRuntimeToolArgs(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(payload?.args) ?? asRecord(payload?.arguments) ?? parseJsonRecord(payload?.arguments);
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(value: string, maxChars: number): string {
  const normalized = normalizeInlineWhitespace(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function summarizeUrlLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathSegments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2);
    const path = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
    return truncateLabel(`${host}${path}`, 44);
  } catch {
    return truncateLabel(url, 44);
  }
}

function buildComputerUseCallTitle(toolName: string, args: Record<string, unknown> | null): string {
  const url = toStringValue(args?.url);
  if (toolName === "computer_open_url") return `Open ${summarizeUrlLabel(url) || "browser URL"}`;
  if (toolName === "computer_screenshot") return "Capture screenshot";
  if (toolName === "computer_click") {
    const x = Number(args?.x);
    const y = Number(args?.y);
    return Number.isFinite(x) && Number.isFinite(y)
      ? `Click ${Math.floor(x)}, ${Math.floor(y)}`
      : "Click";
  }
  if (toolName === "computer_type") return "Type text";
  if (toolName === "computer_keypress") {
    const key = toStringValue(args?.key);
    return key ? `Press ${key}` : "Press key";
  }
  if (toolName === "computer_scroll") {
    const direction = toStringValue(args?.direction);
    return direction === "up" || direction === "down" ? `Scroll ${direction}` : "Scroll";
  }
  if (toolName === "computer_stop") return "Stop computer use";
  return toolName;
}

function resolveToolCallId(
  event: Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "payload">,
  payload: Record<string, unknown>,
  toolName: string,
): string {
  return (
    toStringValue(payload.tool_call_id) ||
    toStringValue(payload.provider_call_id) ||
    toStringValue(payload.item_id) ||
    `${event.run_id}:${event.seq}:${toolName}`
  );
}

function readComputerUseDetails(payload: Record<string, unknown> | null): {
  frameUrl: string | null;
  summary: string | null;
} {
  const details = asRecord(payload?.details);
  const computerUse = asRecord(details?.computer_use) ?? asRecord(payload?.computer_use);
  const requestedX = toFiniteNumberValue(computerUse?.requested_x);
  const requestedY = toFiniteNumberValue(computerUse?.requested_y);
  const mouseX = toFiniteNumberValue(computerUse?.mouse_x);
  const mouseY = toFiniteNumberValue(computerUse?.mouse_y);
  const browserWindowTitle = toStringValue(computerUse?.browser_window_title);
  const windowTitlesBefore = toStringArray(computerUse?.window_titles_before);
  const windowTitlesAfter = toStringArray(computerUse?.window_titles_after);
  const networkProbeStatus = toStringValue(computerUse?.network_probe_status);
  const networkProbeMessage = toStringValue(computerUse?.network_probe_message);
  const networkProbeOutput = toStringValue(computerUse?.network_probe_output);
  const diagnostics: string[] = [];

  if (
    requestedX !== null &&
    requestedY !== null &&
    mouseX !== null &&
    mouseY !== null
  ) {
    diagnostics.push(
      requestedX === mouseX && requestedY === mouseY
        ? `Cursor confirmed at (${mouseX}, ${mouseY}).`
        : `Requested (${requestedX}, ${requestedY}); cursor ended at (${mouseX}, ${mouseY}).`,
    );
  }

  if (browserWindowTitle) {
    diagnostics.push(`Browser window: ${browserWindowTitle}.`);
  }

  if (windowTitlesBefore.length > 0 || windowTitlesAfter.length > 0) {
    const beforeLabel = windowTitlesBefore.length > 0 ? windowTitlesBefore.join(", ") : "(none)";
    const afterLabel = windowTitlesAfter.length > 0 ? windowTitlesAfter.join(", ") : "(none)";
    diagnostics.push(`Windows before: ${beforeLabel}. After: ${afterLabel}.`);
  }

  if (networkProbeStatus && networkProbeStatus !== "reachable") {
    diagnostics.push(
      networkProbeMessage
        ? `Navigation blocker: ${networkProbeMessage}.`
        : `Navigation blocker: ${networkProbeStatus}.`,
    );
    if (networkProbeOutput) {
      diagnostics.push(`Probe output: ${truncateLabel(networkProbeOutput, 180)}.`);
    }
  }

  const summary = toStringValue(computerUse?.summary);
  return {
    frameUrl: toStringValue(computerUse?.frame_url),
    summary: [summary, diagnostics.join(" ")].filter((value): value is string => Boolean(value)).join(" ").trim() || null,
  };
}

export function buildRuntimeComputerUseViewer(
  events: Array<Pick<CloudRuntimeRunEventTransportRow, "run_id" | "seq" | "event_type" | "payload">>,
): RuntimeComputerUseViewerState | null {
  const pendingTitles = new Map<string, string>();
  const recentSteps: RuntimeComputerUseStep[] = [];
  let latestFrameUrl: string | null = null;
  let latestActionTitle: string | null = null;
  let latestSummary: string | null = null;
  let lastFinishedToolName: string | null = null;
  let lastFinishedStatus: "ok" | "error" | null = null;

  for (const event of events) {
    if (event.event_type !== "tool_call_started" && event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const toolName = readRuntimeToolName(payload);
    if (!toolName || !isComputerUseToolName(toolName)) continue;
    const args = readRuntimeToolArgs(payload);
    const callId = resolveToolCallId(event, payload, toolName);
    const title = buildComputerUseCallTitle(toolName, args);
    if (event.event_type === "tool_call_started") {
      pendingTitles.set(callId, title);
      continue;
    }

    pendingTitles.delete(callId);
    const status = toStringValue(payload.status) === "error" ? "error" : "ok";
    const { frameUrl, summary } = readComputerUseDetails(payload);
    recentSteps.push({
      id: callId,
      seq: event.seq,
      title,
      summary,
      status,
    });
    latestActionTitle = title;
    latestSummary = summary;
    if (frameUrl) {
      latestFrameUrl = frameUrl;
    }
    lastFinishedToolName = toolName;
    lastFinishedStatus = status;
  }

  if (!latestFrameUrl && recentSteps.length === 0 && pendingTitles.size === 0) return null;

  const pendingActionTitle =
    pendingTitles.size > 0 ? Array.from(pendingTitles.values())[pendingTitles.size - 1] ?? null : null;
  const status =
    lastFinishedStatus === "error"
      ? "error"
      : lastFinishedToolName === "computer_stop"
        ? "stopped"
        : "active";

  return {
    latestFrameUrl,
    latestActionTitle,
    latestSummary,
    pendingActionTitle,
    status,
    recentSteps: recentSteps.slice(-5).reverse(),
  };
}
