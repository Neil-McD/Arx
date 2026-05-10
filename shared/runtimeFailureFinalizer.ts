import type { RuntimeWorkspaceTerminalPrompt } from "./runtimePrompt";
import type {
  RuntimeRecentToolAttemptPrompt,
  RuntimeTurnContextPacket,
} from "./runtimeTurnContextPacket";

export type RuntimeFailureFinalizerInput = {
  partialContent?: string | null;
  runtimeTurnContext?: RuntimeTurnContextPacket | null;
  status: "error" | "cancelled";
  reason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type RuntimeFailureFinalizerOutput = {
  content: string;
  usedFallback: boolean;
};

function normalizeLine(value: unknown, maxLen = 260): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1).trimEnd()}...` : normalized;
}

function isConnectedAppFailure(attempt: RuntimeRecentToolAttemptPrompt): boolean {
  return (
    attempt.status === "error" &&
    String(attempt.failureKind ?? "").startsWith("app_")
  );
}

function connectedAppFailureLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "app_auth_required":
      return "connection/auth issue";
    case "app_permission_denied":
      return "permissions/scope issue";
    case "app_invalid_arguments":
      return "invalid tool arguments";
    case "app_rate_limited":
      return "provider rate limit";
    case "app_provider_unreachable":
      return "provider/network issue";
    case "app_provider_error":
      return "provider server issue";
    case "app_no_accessible_resources":
      return "no accessible provider resources";
    default:
      return "connected-app tool failure";
  }
}

export function hasConnectedAppFailureEvidence(
  runtimeTurnContext: RuntimeTurnContextPacket | null | undefined,
): boolean {
  return selectConnectedAppFailures(runtimeTurnContext).length > 0;
}

function selectConnectedAppFailures(
  runtimeTurnContext: RuntimeTurnContextPacket | null | undefined,
): RuntimeRecentToolAttemptPrompt[] {
  const attempts = runtimeTurnContext?.recentToolAttempts;
  if (!Array.isArray(attempts)) return [];
  const seen = new Set<string>();
  const out: RuntimeRecentToolAttemptPrompt[] = [];
  for (const attempt of attempts) {
    if (!isConnectedAppFailure(attempt)) continue;
    const key = [
      attempt.connectedAppName ?? "",
      attempt.connectedAppToolName ?? "",
      attempt.failureKind ?? "",
      attempt.failureSummary ?? "",
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(attempt);
    if (out.length >= 3) break;
  }
  return out;
}

function buildConnectedAppFailureFallback(
  input: RuntimeFailureFinalizerInput,
): string | null {
  if (input.status !== "error") return null;
  const failures = selectConnectedAppFailures(input.runtimeTurnContext);
  if (failures.length === 0) return null;
  const lines = [
    failures.length > 1
      ? "I hit repeated connected-app failures before I could finish."
      : "I hit a connected-app failure before I could finish.",
  ];
  for (const failure of failures) {
    const appName =
      normalizeLine(failure.connectedAppName, 80) ??
      normalizeLine(failure.toolName, 80) ??
      "Connected app";
    const appTool = normalizeLine(failure.connectedAppToolName, 100);
    const label = connectedAppFailureLabel(failure.failureKind);
    const summary = normalizeLine(failure.failureSummary, 220);
    const recovery = normalizeLine(failure.suggestedRecovery, 260);
    lines.push(
      `${appName}${appTool ? ` ${appTool}` : ""}: ${label}.${summary ? ` ${summary}` : ""}`,
    );
    if (recovery) {
      lines.push(`Next step: ${recovery}`);
    }
  }
  lines.push(
    "I would not keep retrying the same failing app call without changing setup, permissions, or arguments.",
  );
  return lines.join("\n");
}

function buildTinyEmergencyFallback(
  input: RuntimeFailureFinalizerInput,
): string {
  const terminal = selectLiveTerminal(input.runtimeTurnContext);
  const terminalCopy = terminal
    ? " The background process still appears to be running."
    : "";
  const previewCopy = buildPreviewTruthCopy(terminal);
  const reason =
    normalizeLine(input.errorMessage, 180) ??
    normalizeLine(input.errorCode, 120) ??
    normalizeLine(input.reason, 120);
  const reasonCopy = reason ? ` Runtime note: ${reason}` : "";
  return [
    input.status === "cancelled"
      ? "I stopped before I could finish."
      : "I hit a runtime stop before I could finish.",
    `${terminalCopy}${previewCopy}${reasonCopy}`.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function selectLiveTerminal(
  runtimeTurnContext: RuntimeTurnContextPacket | null | undefined,
): RuntimeWorkspaceTerminalPrompt | null {
  const terminals = runtimeTurnContext?.activeBackgroundTerminals;
  if (!Array.isArray(terminals)) return null;
  return (
    terminals.find((terminal) => terminal?.status === "running") ??
    terminals.find((terminal) => terminal?.status === "starting") ??
    null
  );
}

function buildPreviewTruthCopy(
  terminal: RuntimeWorkspaceTerminalPrompt | null,
): string {
  if (!terminal) return "";
  const previewProcessStatus = normalizeLine(terminal.previewStatus, 80);
  const renderStatus = normalizeLine(terminal.previewRenderStatus, 80);
  const inspectionStatus = normalizeLine(terminal.previewInspectionStatus, 100);
  const parts = [
    previewProcessStatus ? `preview_process=${previewProcessStatus}` : null,
    renderStatus ? `render=${renderStatus}` : null,
    inspectionStatus ? `inspection=${inspectionStatus}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` Preview truth: ${parts.join("; ")}.` : "";
}

export function buildRuntimeFailureFinalAnswer(
  input: RuntimeFailureFinalizerInput,
): RuntimeFailureFinalizerOutput {
  const partialContent = String(input.partialContent ?? "").trim();
  if (partialContent) {
    return { content: partialContent, usedFallback: false };
  }

  const connectedAppFallback = buildConnectedAppFailureFallback(input);
  if (connectedAppFallback) {
    return {
      usedFallback: true,
      content: connectedAppFallback,
    };
  }

  return {
    usedFallback: true,
    content: buildTinyEmergencyFallback(input),
  };
}
