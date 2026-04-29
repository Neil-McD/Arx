import type { RuntimeWorkspaceTerminalPrompt } from "./runtimePrompt";
import type { RuntimeTurnContextPacket } from "./runtimeTurnContextPacket";

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

  return {
    usedFallback: true,
    content: buildTinyEmergencyFallback(input),
  };
}
