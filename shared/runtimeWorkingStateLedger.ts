import type { ThreadWorkingStatePrompt } from "./runtimePrompt";

export type RuntimeWorkingStateRunEvent = {
  eventType: string;
  payload: unknown;
};

export type RuntimeWorkingStateStatus = "ok" | "error" | "cancelled";

export type RuntimeWorkingStateSummaryInput = {
  latestUserText?: string | null;
  runStatus: RuntimeWorkingStateStatus;
  runReason?: string | null;
  runErrorMessage?: string | null;
  events: RuntimeWorkingStateRunEvent[];
  nowMs: number;
};

export type RuntimeWorkingStateSummary = ThreadWorkingStatePrompt & {
  version: number;
  filesChanged: string[];
  verifiedFindings: string[];
  recentActions: string[];
  updatedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSummaryText(raw: unknown, maxLen = 240): string | undefined {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return undefined;
  return value.slice(0, maxLen);
}

function normalizeSummaryList(raw: string[], maxItems = 6, maxLen = 180): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const normalized = normalizeSummaryText(value, maxLen);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function extractToolArgsPath(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  const argsRecord = asRecord(payloadRecord?.args);
  return normalizeSummaryText(argsRecord?.path, 180) ?? null;
}

function extractToolArgsCommand(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  const argsRecord = asRecord(payloadRecord?.args);
  return normalizeSummaryText(argsRecord?.command, 180) ?? null;
}

function extractToolName(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return normalizeSummaryText(payloadRecord?.tool_name, 64) ?? null;
}

function extractToolStatus(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return normalizeSummaryText(payloadRecord?.status, 32) ?? null;
}

function extractToolErrorMessage(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  return (
    normalizeSummaryText(payloadRecord?.error_message, 240) ??
    normalizeSummaryText(payloadRecord?.error_code, 120) ??
    null
  );
}

export function isVerificationShellCommand(command: string | null | undefined): boolean {
  const value = String(command ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!value) return false;

  return (
    /^(npm|pnpm|yarn|bun) (run )?((build|test|typecheck|lint|check)([:\w.-]*)?)\b/.test(value) ||
    /^(npm|pnpm|yarn|bun) (test|exec tsc|exec vite build)\b/.test(value) ||
    /^(npx )?(tsc|vite build|vitest|jest|playwright test|eslint)\b/.test(value)
  );
}

export function summarizeRuntimeWorkingStateFromEvents(
  args: RuntimeWorkingStateSummaryInput,
): RuntimeWorkingStateSummary {
  const successfulReadPaths: string[] = [];
  const changedFiles: string[] = [];
  const recentActionsRaw: string[] = [];
  let successfulSearchCount = 0;
  let successfulVerificationShellCount = 0;
  let successfulOtherShellCount = 0;
  let firstFailedTool: { toolName: string; path: string | null; message: string | null } | null = null;

  for (const event of args.events) {
    if (event.eventType !== "tool_call_finished") continue;
    const toolName = extractToolName(event.payload);
    if (!toolName) continue;
    const status = extractToolStatus(event.payload);
    const path = extractToolArgsPath(event.payload);
    const command = toolName === "bash" ? extractToolArgsCommand(event.payload) : null;
    if (status === "ok") {
      if (toolName === "read" && path && path !== ".") {
        successfulReadPaths.push(path);
        recentActionsRaw.push(`Read ${path}.`);
      } else if ((toolName === "write" || toolName === "edit") && path) {
        changedFiles.push(path);
        recentActionsRaw.push(`${toolName === "write" ? "Wrote" : "Edited"} ${path}.`);
      } else if (toolName === "glob" || toolName === "grep") {
        successfulSearchCount += 1;
        recentActionsRaw.push(`Ran ${toolName}.`);
      } else if (toolName === "bash") {
        if (isVerificationShellCommand(command)) {
          successfulVerificationShellCount += 1;
        } else {
          successfulOtherShellCount += 1;
        }
        recentActionsRaw.push(command ? `Ran bash: ${command}.` : "Ran bash.");
      } else {
        recentActionsRaw.push(`Ran ${toolName}.`);
      }
      continue;
    }
    if (!firstFailedTool) {
      firstFailedTool = {
        toolName,
        path,
        message: extractToolErrorMessage(event.payload),
      };
    }
  }

  const filesChanged = normalizeSummaryList(changedFiles, 8, 180);
  const verifiedFindingsRaw: string[] = [];
  const readPaths = normalizeSummaryList(successfulReadPaths, 3, 180);
  for (const path of readPaths) {
    verifiedFindingsRaw.push(`Inspected ${path}.`);
  }
  if (successfulSearchCount > 0) {
    verifiedFindingsRaw.push(
      `Completed ${successfulSearchCount} workspace ${successfulSearchCount === 1 ? "search" : "searches"}.`,
    );
  }
  if (filesChanged.length > 0) {
    verifiedFindingsRaw.push(
      `Changed ${filesChanged.length} workspace ${filesChanged.length === 1 ? "file" : "files"}.`,
    );
  }
  if (successfulVerificationShellCount > 0) {
    verifiedFindingsRaw.push(
      `Completed ${successfulVerificationShellCount} verification ${successfulVerificationShellCount === 1 ? "command" : "commands"}.`,
    );
  } else if (filesChanged.length === 0 && successfulOtherShellCount > 0) {
    verifiedFindingsRaw.push(
      `Ran ${successfulOtherShellCount} shell ${successfulOtherShellCount === 1 ? "command" : "commands"} successfully.`,
    );
  }
  const verifiedFindings = normalizeSummaryList(verifiedFindingsRaw, 4, 220);

  const hasVerificationEvidence = successfulVerificationShellCount > 0;

  let lastResult: string | undefined;
  if (args.runStatus === "ok") {
    if (filesChanged.length > 0) {
      lastResult = normalizeSummaryText(
        hasVerificationEvidence
          ? `Completed the last workspace run and verified changes in ${filesChanged.join(", ")}.`
          : `Completed the last workspace run and changed ${filesChanged.join(", ")}; verification is still needed.`,
        240,
      );
    } else if (readPaths.length > 0) {
      lastResult = normalizeSummaryText(
        `Completed the last workspace run after inspecting ${readPaths.join(", ")}.`,
        240,
      );
    } else {
      lastResult = "Completed the last workspace run successfully.";
    }
  } else if (firstFailedTool) {
    lastResult = normalizeSummaryText(
      `The last workspace run failed during ${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""}.`,
      240,
    );
  } else {
    lastResult = normalizeSummaryText(
      `The last workspace run ended with status ${args.runStatus}.`,
      240,
    );
  }

  let openIssue: string | undefined;
  if (args.runStatus !== "ok") {
    openIssue =
      normalizeSummaryText(
        firstFailedTool
          ? `${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""} failed${firstFailedTool.message ? `: ${firstFailedTool.message}` : "."}`
          : args.runErrorMessage || args.runReason || "The last workspace run did not complete successfully.",
        240,
      ) ?? "The last workspace run did not complete successfully.";
  }

  const runNeedsVerification =
    args.runStatus === "ok" && filesChanged.length > 0 && !hasVerificationEvidence;
  const ledgerStatus =
    args.runStatus === "ok"
      ? runNeedsVerification
        ? "needs_verification"
        : "complete"
      : "blocked";
  const currentStep =
    ledgerStatus === "complete"
      ? undefined
      : ledgerStatus === "needs_verification"
        ? "Verify the changed workspace files."
        : "Resolve the blocker from the last run.";
  const blocker = args.runStatus !== "ok" ? openIssue : undefined;
  const nextAction =
    ledgerStatus === "complete"
      ? undefined
      : ledgerStatus === "needs_verification"
        ? "Run an appropriate build, test, preview, or targeted read before calling the task done."
        : firstFailedTool
          ? `Retry ${firstFailedTool.toolName} with a narrower or alternate path, or report the blocker if it is not recoverable.`
          : "Inspect the latest runtime events and continue from the last verified state.";
  const recentActions = normalizeSummaryList(recentActionsRaw, 6, 180);

  return {
    version: 2,
    goal: normalizeSummaryText(args.latestUserText, 240) ?? null,
    status: ledgerStatus,
    currentStep: currentStep ?? null,
    lastResult: lastResult ?? null,
    filesChanged,
    verifiedFindings,
    recentActions,
    openIssue: openIssue ?? null,
    blocker: blocker ?? null,
    nextAction: nextAction ?? null,
    updatedAt: args.nowMs,
  };
}
