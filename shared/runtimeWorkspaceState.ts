export type RuntimeWorkspaceTerminalStatus =
  | "none"
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped"
  | "stale";

export type RuntimeWorkspacePreviewStatus =
  | "none"
  | "starting"
  | "running"
  | "blank"
  | "render_error_suspected"
  | "unreachable"
  | "server_exited";

export type RuntimeWorkspaceStateSummary = {
  terminalStatus: RuntimeWorkspaceTerminalStatus;
  previewStatus: RuntimeWorkspacePreviewStatus;
  terminalSessionId?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  outputTail?: string;
  previewPort?: number;
  previewPath?: string;
  previewLabel?: string;
  issue?: string;
  nextAction?: string;
  updatedAt: number;
};

export type RuntimeWorkspaceStateEvent = {
  eventType: string;
  payload: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown, maxLen = 240): string | undefined {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}…`
    : normalized;
}

function normalizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.floor(numeric);
}

function normalizeTerminalStatus(value: unknown): RuntimeWorkspaceTerminalStatus | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "starting" ||
    normalized === "running" ||
    normalized === "exited" ||
    normalized === "failed" ||
    normalized === "stopped" ||
    normalized === "stale"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizePreviewStatus(value: unknown): RuntimeWorkspacePreviewStatus | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "starting" ||
    normalized === "running" ||
    normalized === "blank" ||
    normalized === "render_error_suspected" ||
    normalized === "unreachable" ||
    normalized === "server_exited" ||
    normalized === "none"
  ) {
    return normalized;
  }
  return undefined;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const text = String(value ?? "").trim();
  if (!text || !text.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function extractPayloadDetails(payload: unknown): Record<string, unknown> | null {
  const payloadRecord = asRecord(payload);
  const detailsRecord = asRecord(payloadRecord?.details);
  if (detailsRecord) return detailsRecord;
  return (
    parseJsonRecord(payloadRecord?.output) ??
    parseJsonRecord(payloadRecord?.output_preview)
  );
}

function previewStatusFromTerminal(params: {
  terminalStatus: RuntimeWorkspaceTerminalStatus;
  previewPort?: number;
  explicitPreviewStatus?: RuntimeWorkspacePreviewStatus;
  outputTail?: string;
}): RuntimeWorkspacePreviewStatus {
  if (params.explicitPreviewStatus) return params.explicitPreviewStatus;
  if (!params.previewPort) return "none";
  if (params.terminalStatus === "starting") return "starting";
  if (params.terminalStatus === "running") {
    const tail = String(params.outputTail ?? "");
    if (/\b(blank page|blank white|white screen|empty preview)\b/i.test(tail)) {
      return "blank";
    }
    return "running";
  }
  if (params.terminalStatus === "failed" || params.terminalStatus === "exited") {
    return "server_exited";
  }
  return "none";
}

function deriveIssue(params: {
  terminalStatus: RuntimeWorkspaceTerminalStatus;
  previewStatus: RuntimeWorkspacePreviewStatus;
  exitCode?: number;
}): { issue?: string; nextAction?: string } {
  if (params.previewStatus === "blank") {
    return {
      issue: "Preview is reachable but rendered blank while the terminal is still running.",
      nextAction:
        "Inspect the frontend render path, browser console symptoms, root mount, imports, and CSS before restarting the terminal.",
    };
  }
  if (params.previewStatus === "render_error_suspected") {
    return {
      issue: "Preview likely has a frontend render error while the server is still running.",
      nextAction:
        "Inspect browser console symptoms and the app render path before restarting the terminal.",
    };
  }
  if (params.previewStatus === "unreachable") {
    return {
      issue: "Preview is not reachable.",
      nextAction:
        "Check whether the terminal is running and whether the preview port/path matches the server.",
    };
  }
  if (params.previewStatus === "server_exited") {
    return {
      issue:
        typeof params.exitCode === "number"
          ? `Preview server exited with code ${params.exitCode}.`
          : "Preview server exited.",
      nextAction:
        "Read the terminal output and fix the server command or app runtime error before starting a new preview.",
    };
  }
  if (params.terminalStatus === "failed") {
    return {
      issue: "Background terminal failed.",
      nextAction:
        "Read the terminal output and fix the command/runtime failure before retrying.",
    };
  }
  return {};
}

export function summarizeWorkspaceRuntimeStateFromEvents(params: {
  events: RuntimeWorkspaceStateEvent[];
  nowMs: number;
}): RuntimeWorkspaceStateSummary | null {
  let latest: RuntimeWorkspaceStateSummary | null = null;

  for (const event of params.events) {
    if (event.eventType !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    const toolName = normalizeText(payload?.tool_name, 80);
    if (
      toolName !== "terminal_start" &&
      toolName !== "terminal_read" &&
      toolName !== "terminal_write" &&
      toolName !== "terminal_stop"
    ) {
      continue;
    }

    const details = extractPayloadDetails(payload);
    const status = normalizeTerminalStatus(details?.status);
    const terminalStatus =
      toolName === "terminal_stop"
        ? "stopped"
        : status ?? (payload?.status === "ok" ? "running" : "failed");
    const terminalSessionId =
      normalizeText(details?.terminal_session_id, 120) ??
      normalizeText(payload?.terminal_session_id, 120);
    const command = normalizeText(details?.command, 220);
    const cwd = normalizeText(details?.cwd, 160);
    const exitCode =
      normalizeNumber(details?.exit_code) ?? normalizeNumber(payload?.exit_code);
    const outputTail =
      normalizeText(details?.output_tail, 500) ??
      normalizeText(payload?.output_preview, 500);
    const previewPort = normalizeNumber(details?.preview_port);
    const previewPath = normalizeText(details?.preview_path, 120);
    const previewLabel = normalizeText(details?.preview_label, 80);
    const explicitPreviewStatus =
      normalizePreviewStatus(details?.preview_status) ??
      normalizePreviewStatus(payload?.preview_status);
    const previewStatus = previewStatusFromTerminal({
      terminalStatus,
      previewPort,
      explicitPreviewStatus,
      outputTail,
    });
    const derived = deriveIssue({ terminalStatus, previewStatus, exitCode });
    const previous = latest as RuntimeWorkspaceStateSummary | null;

    latest = {
      terminalStatus,
      previewStatus,
      ...(terminalSessionId ? { terminalSessionId } : null),
      ...(command ? { command } : previous?.command ? { command: previous.command } : null),
      ...(cwd ? { cwd } : previous?.cwd ? { cwd: previous.cwd } : null),
      ...(typeof exitCode === "number" ? { exitCode } : null),
      ...(outputTail ? { outputTail } : null),
      ...(typeof previewPort === "number"
        ? { previewPort }
        : previous?.previewPort
          ? { previewPort: previous.previewPort }
          : null),
      ...(previewPath ? { previewPath } : previous?.previewPath ? { previewPath: previous.previewPath } : null),
      ...(previewLabel ? { previewLabel } : previous?.previewLabel ? { previewLabel: previous.previewLabel } : null),
      ...(derived.issue ? { issue: derived.issue } : null),
      ...(derived.nextAction ? { nextAction: derived.nextAction } : null),
      updatedAt: params.nowMs,
    };
  }

  return latest;
}
