import {
  formatRuntimeDiagnosticSummary,
  selectTopRuntimeDiagnostic,
  type RuntimeDiagnostic,
} from "./runtimeDiagnostics.ts";

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

export type RuntimeWorkingStateSummary = {
  version: number;
  goal?: string;
  status: "idle" | "in_progress" | "blocked" | "needs_verification" | "complete";
  currentStep?: string;
  plan?: string[];
  completedSteps?: string[];
  decisions?: string[];
  openQuestions?: string[];
  focusFiles?: string[];
  lastResult?: string;
  openIssue?: string;
  blocker?: string;
  nextAction?: string;
  filesTouched: string[];
  filesChanged: string[];
  verifiedFindings: string[];
  recentActions: string[];
  verificationStatus: "not_needed" | "needed" | "passed" | "failed";
  lastDiagnostic?: string;
  updatedAt: number;
};

type RuntimeWorkingStateTaskLedgerFields = Pick<
  RuntimeWorkingStateSummary,
  "plan" | "completedSteps" | "decisions" | "openQuestions" | "focusFiles"
>;

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

function readSummaryList(
  record: Record<string, unknown>,
  key: keyof RuntimeWorkingStateTaskLedgerFields,
  maxItems: number,
  maxLen: number,
): string[] {
  const raw = record[key];
  return Array.isArray(raw)
    ? normalizeSummaryList(
        raw.map((value) => String(value ?? "")),
        maxItems,
        maxLen,
      )
    : [];
}

export function mergeRuntimeWorkingStateTaskLedger(args: {
  previous: unknown;
  current: RuntimeWorkingStateSummary;
}): RuntimeWorkingStateSummary {
  const previousRecord = asRecord(args.previous);
  if (!previousRecord) return args.current;
  return {
    ...args.current,
    plan: normalizeSummaryList(
      [
        ...(args.current.plan ?? []),
        ...readSummaryList(previousRecord, "plan", 5, 180),
      ],
      5,
      180,
    ),
    completedSteps: normalizeSummaryList(
      [
        ...(args.current.completedSteps ?? []),
        ...readSummaryList(previousRecord, "completedSteps", 8, 180),
      ],
      8,
      180,
    ),
    decisions: normalizeSummaryList(
      [
        ...(args.current.decisions ?? []),
        ...readSummaryList(previousRecord, "decisions", 5, 200),
      ],
      5,
      200,
    ),
    openQuestions: normalizeSummaryList(
      [
        ...(args.current.openQuestions ?? []),
        ...readSummaryList(previousRecord, "openQuestions", 4, 200),
      ],
      4,
      200,
    ),
    focusFiles: normalizeSummaryList(
      [
        ...(args.current.focusFiles ?? []),
        ...readSummaryList(previousRecord, "focusFiles", 8, 180),
      ],
      8,
      180,
    ),
  };
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
    normalizeSummaryText(payloadRecord?.top_diagnostic_summary, 240) ??
    normalizeSummaryText(payloadRecord?.error_message, 240) ??
    normalizeSummaryText(payloadRecord?.error_code, 120) ??
    null
  );
}

function extractFailureSemantics(payload: unknown): {
  kind: string | null;
  summary: string | null;
  suggestedRecovery: string | null;
} | null {
  const payloadRecord = asRecord(payload);
  const failureRecord = asRecord(payloadRecord?.failure_semantics);
  if (!failureRecord) return null;
  const kind = normalizeSummaryText(failureRecord.kind, 80) ?? null;
  const summary = normalizeSummaryText(failureRecord.summary, 220) ?? null;
  const suggestedRecovery =
    normalizeSummaryText(failureRecord.suggested_recovery, 240) ?? null;
  if (!kind && !summary && !suggestedRecovery) return null;
  return { kind, summary, suggestedRecovery };
}

function extractRuntimeDiagnostics(payload: unknown): RuntimeDiagnostic[] {
  const payloadRecord = asRecord(payload);
  const rawDiagnostics = Array.isArray(payloadRecord?.diagnostics)
    ? payloadRecord?.diagnostics
    : [];
  const diagnostics: RuntimeDiagnostic[] = [];
  for (const raw of rawDiagnostics) {
    const record = asRecord(raw);
    const message = normalizeSummaryText(record?.message, 600);
    const source = normalizeSummaryText(record?.source, 80);
    if (!message || !source) continue;
    const severityRaw = normalizeSummaryText(record?.severity, 20);
    const severity =
      severityRaw === "warning" || severityRaw === "info" ? severityRaw : "error";
    const diagnostic: RuntimeDiagnostic = {
      source,
      severity,
      message,
    };
    const file = normalizeSummaryText(record?.file, 260);
    const code = normalizeSummaryText(record?.code, 80);
    const line = Number(record?.line);
    const column = Number(record?.column);
    if (file) diagnostic.file = file;
    if (Number.isFinite(line) && line > 0) diagnostic.line = Math.floor(line);
    if (Number.isFinite(column) && column > 0) diagnostic.column = Math.floor(column);
    if (code) diagnostic.code = code;
    diagnostics.push(diagnostic);
    if (diagnostics.length >= 8) break;
  }
  return diagnostics;
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
  const touchedPaths: string[] = [];
  const changedFiles: string[] = [];
  const recentActionsRaw: string[] = [];
  const completedStepsRaw: string[] = [];
  let successfulSearchCount = 0;
  let successfulVerificationShellCount = 0;
  let failedVerificationShellCount = 0;
  let successfulOtherShellCount = 0;
  let firstFailedTool: {
    toolName: string;
    path: string | null;
    message: string | null;
    failureSemantics: ReturnType<typeof extractFailureSemantics>;
  } | null = null;
  const diagnostics: RuntimeDiagnostic[] = [];

  for (const event of args.events) {
    if (event.eventType === "runtime_diagnostics_detected") {
      diagnostics.push(...extractRuntimeDiagnostics(event.payload));
      continue;
    }
    if (event.eventType !== "tool_call_finished") continue;
    const toolName = extractToolName(event.payload);
    if (!toolName) continue;
    diagnostics.push(...extractRuntimeDiagnostics(event.payload));
    const status = extractToolStatus(event.payload);
    const path = extractToolArgsPath(event.payload);
    const command = toolName === "bash" ? extractToolArgsCommand(event.payload) : null;
    if (status === "ok") {
      if (toolName === "read" && path && path !== ".") {
        successfulReadPaths.push(path);
        touchedPaths.push(path);
        recentActionsRaw.push(`Read ${path}.`);
      } else if ((toolName === "write" || toolName === "edit") && path) {
        changedFiles.push(path);
        touchedPaths.push(path);
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
    if (path && path !== ".") {
      touchedPaths.push(path);
    }
    if (toolName === "bash" && isVerificationShellCommand(command)) {
      failedVerificationShellCount += 1;
    }
    if (!firstFailedTool) {
      firstFailedTool = {
        toolName,
        path,
        message: extractToolErrorMessage(event.payload),
        failureSemantics: extractFailureSemantics(event.payload),
      };
    }
  }

  const topDiagnostic = selectTopRuntimeDiagnostic(diagnostics);
  const topDiagnosticSummary = formatRuntimeDiagnosticSummary(topDiagnostic);

  const filesTouched = normalizeSummaryList(touchedPaths, 10, 180);
  const filesChanged = normalizeSummaryList(changedFiles, 8, 180);
  const focusFiles = normalizeSummaryList([...changedFiles, ...successfulReadPaths], 8, 180);
  const verifiedFindingsRaw: string[] = [];
  const readPaths = normalizeSummaryList(successfulReadPaths, 3, 180);
  for (const path of readPaths) {
    verifiedFindingsRaw.push(`Inspected ${path}.`);
  }
  if (successfulSearchCount > 0) {
    verifiedFindingsRaw.push(
      `Completed ${successfulSearchCount} workspace ${successfulSearchCount === 1 ? "search" : "searches"}.`,
    );
    completedStepsRaw.push(
      `Searched the workspace ${successfulSearchCount === 1 ? "once" : `${successfulSearchCount} times`}.`,
    );
  }
  if (filesChanged.length > 0) {
    verifiedFindingsRaw.push(
      `Changed ${filesChanged.length} workspace ${filesChanged.length === 1 ? "file" : "files"}.`,
    );
    completedStepsRaw.push(
      `Changed ${filesChanged.length} workspace ${filesChanged.length === 1 ? "file" : "files"}.`,
    );
  }
  if (successfulVerificationShellCount > 0) {
    verifiedFindingsRaw.push(
      `Completed ${successfulVerificationShellCount} verification ${successfulVerificationShellCount === 1 ? "command" : "commands"}.`,
    );
    completedStepsRaw.push(
      `Ran ${successfulVerificationShellCount} verification ${successfulVerificationShellCount === 1 ? "command" : "commands"}.`,
    );
  } else if (filesChanged.length === 0 && successfulOtherShellCount > 0) {
    verifiedFindingsRaw.push(
      `Ran ${successfulOtherShellCount} shell ${successfulOtherShellCount === 1 ? "command" : "commands"} successfully.`,
    );
  }
  if (readPaths.length > 0) {
    completedStepsRaw.unshift(`Inspected ${readPaths.join(", ")}.`);
  }
  if (topDiagnosticSummary) {
    verifiedFindingsRaw.push(`Found diagnostic: ${topDiagnosticSummary}`);
  }
  const verifiedFindings = normalizeSummaryList(verifiedFindingsRaw, 4, 220);
  const completedSteps = normalizeSummaryList(completedStepsRaw, 6, 180);

  const hasVerificationEvidence = successfulVerificationShellCount > 0;
  const verificationStatus =
    failedVerificationShellCount > 0 || (args.runStatus !== "ok" && Boolean(topDiagnosticSummary))
      ? "failed"
      : filesChanged.length === 0
        ? "not_needed"
        : hasVerificationEvidence
          ? "passed"
          : "needed";

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
      topDiagnosticSummary
        ? `The last workspace run failed with diagnostic ${topDiagnosticSummary}.`
        : firstFailedTool.failureSemantics?.summary
          ? `The last workspace run failed: ${firstFailedTool.failureSemantics.summary}`
        : `The last workspace run failed during ${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""}.`,
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
          ? topDiagnosticSummary
          ? `Verification failed: ${topDiagnosticSummary}`
          : firstFailedTool.failureSemantics?.summary
            ? `${firstFailedTool.toolName} failed: ${firstFailedTool.failureSemantics.summary}`
            : `${firstFailedTool.toolName}${firstFailedTool.path ? ` on ${firstFailedTool.path}` : ""} failed${firstFailedTool.message ? `: ${firstFailedTool.message}` : "."}`
          : args.runErrorMessage ||
            args.runReason ||
            "The last workspace run did not complete successfully.",
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
      : verificationStatus === "failed"
        ? "Fix the failed verification diagnostic."
        : ledgerStatus === "needs_verification"
        ? "Verify the changed workspace files."
        : "Resolve the blocker from the last run.";
  const blocker = args.runStatus !== "ok" ? openIssue : undefined;
  const topDiagnosticIsFailureSemantic =
    Boolean(firstFailedTool?.failureSemantics?.kind) &&
    topDiagnostic?.source === "shell" &&
    topDiagnostic?.code === firstFailedTool?.failureSemantics?.kind;
  const nextAction =
    ledgerStatus === "complete"
      ? undefined
      : ledgerStatus === "needs_verification"
        ? "Run an appropriate build, test, preview, or targeted read before calling the task done."
        : topDiagnosticIsFailureSemantic &&
            firstFailedTool?.failureSemantics?.suggestedRecovery
          ? firstFailedTool.failureSemantics.suggestedRecovery
        : topDiagnosticSummary
          ? `Fix ${topDiagnosticSummary}`
        : firstFailedTool?.failureSemantics?.suggestedRecovery
          ? firstFailedTool.failureSemantics.suggestedRecovery
        : firstFailedTool
          ? `Inspect the ${firstFailedTool.toolName} failure details, preserve the last verified state, and continue only from a concrete recovery path.`
          : "Inspect the latest runtime events and continue from the last verified state.";
  const plan =
    ledgerStatus === "complete"
      ? []
      : normalizeSummaryList(
          [currentStep, nextAction].filter((value): value is string => Boolean(value)),
          5,
          180,
        );
  const recentActions = normalizeSummaryList(recentActionsRaw, 6, 180);
  const goal = normalizeSummaryText(args.latestUserText, 240);

  return {
    version: 3,
    ...(goal ? { goal } : null),
    status: ledgerStatus,
    ...(currentStep ? { currentStep } : null),
    ...(plan.length > 0 ? { plan } : null),
    ...(completedSteps.length > 0 ? { completedSteps } : null),
    ...(focusFiles.length > 0 ? { focusFiles } : null),
    ...(lastResult ? { lastResult } : null),
    verificationStatus,
    filesTouched,
    filesChanged,
    verifiedFindings,
    ...(topDiagnosticSummary ? { lastDiagnostic: topDiagnosticSummary } : null),
    recentActions,
    ...(openIssue ? { openIssue } : null),
    ...(blocker ? { blocker } : null),
    ...(nextAction ? { nextAction } : null),
    updatedAt: args.nowMs,
  };
}
