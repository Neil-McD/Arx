import type {
  RuntimeWorkspaceTerminalPrompt,
  ThreadWorkingStatePrompt,
} from "./runtimePrompt";

export type RuntimeFailureFinalizerInput = {
  partialContent?: string | null;
  workingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals?: RuntimeWorkspaceTerminalPrompt[] | null;
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

function normalizeList(values: unknown, maxItems: number, maxLen = 220): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeLine(value, maxLen);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function formatList(values: string[], fallback: string): string {
  if (values.length === 0) return `- ${fallback}`;
  return values.map((value) => `- ${value}`).join("\n");
}

function selectLiveTerminal(
  terminals: RuntimeWorkspaceTerminalPrompt[] | null | undefined,
): RuntimeWorkspaceTerminalPrompt | null {
  if (!Array.isArray(terminals)) return null;
  return (
    terminals.find((terminal) => terminal?.status === "running") ??
    terminals.find((terminal) => terminal?.status === "starting") ??
    null
  );
}

function formatLiveTerminalResult(
  terminal: RuntimeWorkspaceTerminalPrompt | null,
): string | null {
  if (!terminal) return null;
  const command = normalizeLine(terminal.command, 140);
  const health = normalizeLine(terminal.healthStatus, 80);
  const preview = normalizeLine(terminal.previewStatus, 80);
  const browserObservation = normalizeLine(
    terminal.lastBrowserObservationSummary,
    180,
  );
  const previewProbe = normalizeLine(terminal.lastPreviewProbeSummary, 180);
  const parts = [
    `A background terminal is still ${terminal.status}`,
    command ? `command: ${command}` : null,
    health ? `health: ${health}` : null,
    preview ? `preview: ${preview}` : null,
    browserObservation ? `browser observation: ${browserObservation}` : null,
    previewProbe ? `preview probe: ${previewProbe}` : null,
  ].filter(Boolean);
  return parts.join("; ") + ".";
}

function buildLiveTerminalBlocker(
  terminal: RuntimeWorkspaceTerminalPrompt | null,
  runStatus: RuntimeFailureFinalizerInput["status"],
): string | null {
  if (!terminal) return null;
  const prefix =
    runStatus === "cancelled"
      ? "The run was cancelled"
      : "The foreground diagnostic failed";
  const preview = normalizeLine(terminal.previewStatus, 80);
  if (preview === "blank" || preview === "render_error_suspected") {
    return `${prefix}, but the background terminal is still running and the preview needs browser/render inspection.`;
  }
  if (preview === "running") {
    return `${prefix}, but the background terminal and preview are still running.`;
  }
  return `${prefix}, but a background terminal is still running.`;
}

function buildLiveTerminalNextAction(
  terminal: RuntimeWorkspaceTerminalPrompt | null,
): string | null {
  if (!terminal) return null;
  const preview = normalizeLine(terminal.previewStatus, 80);
  if (preview === "blank" || preview === "render_error_suspected") {
    return "Inspect the active preview with browser/computer-use evidence, then debug frontend render, console, root mount, imports, or CSS before restarting the terminal.";
  }
  if (preview === "running") {
    return "Keep the running background terminal, inspect the preview/browser state, and only rerun diagnostics that answer a specific remaining question.";
  }
  return "Read the running terminal output and process health before retrying or starting another terminal.";
}

export function buildRuntimeFailureFinalAnswer(
  input: RuntimeFailureFinalizerInput,
): RuntimeFailureFinalizerOutput {
  const partialContent = String(input.partialContent ?? "").trim();
  if (partialContent) {
    return { content: partialContent, usedFallback: false };
  }

  const workingState = input.workingState ?? null;
  const liveTerminal = selectLiveTerminal(input.activeBackgroundTerminals);
  const liveTerminalResult = formatLiveTerminalResult(liveTerminal);
  const goal = normalizeLine(workingState?.goal, 180);
  const status = normalizeLine(workingState?.status, 80);
  const lastResult =
    liveTerminalResult ?? normalizeLine(workingState?.lastResult, 260);
  const blocker =
    buildLiveTerminalBlocker(liveTerminal, input.status) ??
    normalizeLine(workingState?.blocker, 260) ??
    normalizeLine(workingState?.openIssue, 260) ??
    normalizeLine(input.errorMessage, 260) ??
    normalizeLine(input.errorCode, 160) ??
    normalizeLine(input.reason, 160) ??
    "The run stopped before it could complete.";
  const nextAction =
    buildLiveTerminalNextAction(liveTerminal) ??
    normalizeLine(workingState?.nextAction, 240) ??
    "Continue from the last verified state and retry the failed step if it is still needed.";
  const verifiedFindings = normalizeList(workingState?.verifiedFindings, 4, 220);
  const filesChanged = normalizeList(workingState?.filesChanged, 8, 180);
  const recentActions = normalizeList(workingState?.recentActions, 6, 180);
  const changedOrTouched =
    filesChanged.length > 0
      ? filesChanged
      : recentActions.filter((action) => /read|wrote|edited|ran/i.test(action));

  const whatHappened = [
    input.status === "cancelled"
      ? "The run was cancelled before it completed."
      : "The run stopped before it completed.",
    goal ? `Goal: ${goal}.` : null,
    status ? `Ledger status: ${status}.` : null,
    lastResult ? `Last result: ${lastResult}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    usedFallback: true,
    content: [
      "Run stopped before completing.",
      "",
      "What happened:",
      `- ${whatHappened || "The runtime stopped before producing a final answer."}`,
      "",
      "Verified so far:",
      formatList(verifiedFindings, "No verified findings were recorded before the stop."),
      "",
      "Changed/touched:",
      formatList(changedOrTouched, "No changed or touched files were recorded before the stop."),
      "",
      "Blocker:",
      `- ${blocker}`,
      "",
      "Next action:",
      `- ${nextAction}`,
    ].join("\n"),
  };
}
