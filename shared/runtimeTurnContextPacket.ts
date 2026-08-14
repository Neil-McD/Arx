import type { ThreadWorkingStatePrompt } from "./runtimePrompt.ts";
import {
  normalizeRuntimeProjectContext,
  type RuntimeProjectContextPrompt,
} from "./projectContext.ts";
import {
  buildRuntimeContextFragmentsFromParts,
  compactRuntimeContextFragmentsForSnapshot,
  renderRuntimeContextFragmentsForPrompt,
  type RuntimeContextFragmentV1,
  type RuntimeContextRunEvent,
} from "./runtimeContextFragments.ts";
import type { RuntimeTurnEnvelopeV1 } from "./runtimeTurnEnvelope.ts";
import {
  runtimeCommunityContextReceiptResultSummary,
  runtimeCommunityContextReceiptTarget,
} from "./runtimeCommunityContextReceipt.ts";

export type RuntimeTurnContextPacket = {
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  projectContext?: RuntimeProjectContextPrompt | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  recentToolAttempts: RuntimeRecentToolAttemptPrompt[];
  fragments?: RuntimeContextFragmentV1[];
  runtimeStop?: {
    status: "error" | "cancelled";
    reason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
};

export type RuntimeTurnContextSnapshotV1 = {
  version: 1;
  capturedAt: number;
  latestUserText: string | null;
  runtimeTurnEnvelope: RuntimeTurnEnvelopeV1 | null;
  projectContext: RuntimeProjectContextPrompt | null;
  threadWorkingState: ThreadWorkingStatePrompt | null;
  recentToolAttempts: RuntimeRecentToolAttemptPrompt[];
  fragments?: RuntimeContextFragmentV1[];
  runtimeStop: RuntimeTurnContextPacket["runtimeStop"];
};

export type RuntimeRecentToolAttemptPrompt = {
  toolCallId?: string | null;
  providerCallId?: string | null;
  toolName: string;
  status: "ok" | "error";
  commandOrTarget?: string | null;
  cwd?: string | null;
  exitCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  outputPreview?: string | null;
  failureSummary?: string | null;
  failureKind?: string | null;
  suggestedRecovery?: string | null;
  createdAt?: number | null;
};

export type RuntimeRecentToolAttemptEvent = {
  eventType: string;
  payload: unknown;
  createdAt?: number;
};

function normalizePromptBlock(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function joinPromptBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => normalizePromptBlock(block))
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

function truncatePromptSnippet(value: string | null | undefined, limit = 240): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return asRecord(record[key]);
}

function readAttemptString(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return truncatePromptSnippet(value, 500);
  }
  return null;
}

function readAttemptNumber(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  }
  return null;
}

function normalizeAttemptStatus(value: unknown): "ok" | "error" | null {
  const status = String(value ?? "").trim();
  if (status === "ok" || status === "error") return status;
  if (value === true) return "ok";
  if (value === false) return "error";
  return null;
}

function readToolAttemptCommandOrTarget(params: {
  toolName: string;
  payload: Record<string, unknown>;
  args: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  failureSemantics: Record<string, unknown> | null;
}): string | null {
  const toolName = params.toolName;
  const receiptTarget = runtimeCommunityContextReceiptTarget(params.payload);
  if (receiptTarget) return receiptTarget;
  if (toolName === "bash") {
    return (
      readAttemptString(params.failureSemantics, "command") ??
      readAttemptString(params.args, "command") ??
      readAttemptString(params.details, "command")
    );
  }
  if (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "sha256") {
    return readAttemptString(params.args, "path");
  }
  if (toolName === "glob" || toolName === "grep") {
    return readAttemptString(params.args, "pattern", "query", "path");
  }
  if (toolName === "terminal_start") {
    return readAttemptString(params.args, "command") ?? readAttemptString(params.details, "command");
  }
  if (toolName === "terminal_read" || toolName === "terminal_stop") {
    return readAttemptString(params.args, "terminal_session_id", "terminalId", "id");
  }
  if (toolName === "computer_open_url") {
    return readAttemptString(params.args, "url") ?? readAttemptString(params.details, "url", "target_url");
  }
  if (toolName.startsWith("computer_")) {
    return readAttemptString(params.details, "summary", "browser_window_title");
  }
  return readAttemptString(params.args, "path", "url", "query", "command");
}

function normalizeRuntimeRecentToolAttempt(
  event: RuntimeRecentToolAttemptEvent,
): RuntimeRecentToolAttemptPrompt | null {
  if (event.eventType !== "tool_call_finished") return null;
  const payload = asRecord(event.payload);
  if (!payload) return null;
  const toolName = readAttemptString(payload, "tool_name", "toolName", "tool") ?? "";
  if (!toolName) return null;
  const status =
    normalizeAttemptStatus(payload.status) ??
    normalizeAttemptStatus(payload.success) ??
    (readAttemptString(payload, "error_code", "error_message") ? "error" : "ok");
  const args = readNestedRecord(payload, "args");
  const details = readNestedRecord(payload, "details");
  const failureSemantics = readNestedRecord(payload, "failure_semantics");
  const outputPreview =
    readAttemptString(payload, "output_preview", "output") ??
    readAttemptString(details, "output_preview", "stdout_preview", "stderr_preview") ??
    runtimeCommunityContextReceiptResultSummary(payload);
  const attempt: RuntimeRecentToolAttemptPrompt = {
    toolCallId: readAttemptString(payload, "tool_call_id", "toolCallId"),
    providerCallId: readAttemptString(payload, "provider_call_id", "providerCallId"),
    toolName,
    status,
    commandOrTarget: readToolAttemptCommandOrTarget({
      toolName,
      payload,
      args,
      details,
      failureSemantics,
    }),
    cwd:
      readAttemptString(failureSemantics, "cwd") ??
      readAttemptString(details, "cwd") ??
      readAttemptString(args, "cwd"),
    exitCode:
      readAttemptNumber(payload, "exit_code", "exitCode") ??
      readAttemptNumber(details, "exit_code", "exitCode") ??
      readAttemptNumber(failureSemantics, "exit_code", "exitCode"),
    errorCode: readAttemptString(payload, "error_code", "errorCode"),
    errorMessage: readAttemptString(payload, "error_message", "errorMessage"),
    outputPreview,
    failureSummary:
      readAttemptString(failureSemantics, "summary") ??
      readAttemptString(payload, "top_diagnostic_summary"),
    failureKind: readAttemptString(failureSemantics, "kind"),
    suggestedRecovery: readAttemptString(failureSemantics, "suggested_recovery", "suggestedRecovery"),
    createdAt:
      typeof event.createdAt === "number" && Number.isFinite(event.createdAt)
        ? Math.floor(event.createdAt)
        : null,
  };
  return attempt;
}

export function buildRuntimeRecentToolAttemptsFromEvents(params: {
  events: RuntimeRecentToolAttemptEvent[];
  limit?: number | null;
}): RuntimeRecentToolAttemptPrompt[] {
  const limit = Math.max(1, Math.min(12, Math.floor(params.limit ?? 8)));
  const attempts = params.events
    .map(normalizeRuntimeRecentToolAttempt)
    .filter((attempt): attempt is RuntimeRecentToolAttemptPrompt => Boolean(attempt));
  const failed = attempts.filter((attempt) => attempt.status === "error");
  const priorityNames = new Set(["bash", "terminal_start", "terminal_read", "computer_open_url", "computer_screenshot"]);
  const diagnostic = attempts.filter(
    (attempt) => attempt.status === "ok" && priorityNames.has(attempt.toolName),
  );
  const other = attempts.filter(
    (attempt) => attempt.status === "ok" && !priorityNames.has(attempt.toolName),
  );
  const ordered = [...failed, ...diagnostic, ...other].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
  const seen = new Set<string>();
  const out: RuntimeRecentToolAttemptPrompt[] = [];
  for (const attempt of ordered) {
    const key = [
      attempt.toolCallId,
      attempt.providerCallId,
      attempt.toolName,
      attempt.status,
      attempt.commandOrTarget,
      attempt.errorCode,
      attempt.exitCode,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(attempt);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildRuntimeTurnContextPacket(params: {
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  projectContext?: RuntimeProjectContextPrompt | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  recentToolAttempts?: Array<RuntimeRecentToolAttemptPrompt | null | undefined> | null;
  runtimeRunEvents?: Array<RuntimeContextRunEvent | null | undefined> | null;
  runtimeStop?: RuntimeTurnContextPacket["runtimeStop"];
}): RuntimeTurnContextPacket {
  const recentToolAttempts = Array.isArray(params.recentToolAttempts)
    ? params.recentToolAttempts
        .filter(
          (attempt): attempt is RuntimeRecentToolAttemptPrompt =>
            Boolean(attempt && attempt.toolName),
        )
        .slice(0, 8)
    : [];
  const projectContext = normalizeRuntimeProjectContext(params.projectContext ?? null);
  return {
    latestUserText: params.latestUserText ?? null,
    runtimeTurnEnvelope: params.runtimeTurnEnvelope ?? null,
    projectContext,
    threadWorkingState: params.threadWorkingState ?? null,
    recentToolAttempts,
    fragments: buildRuntimeContextFragmentsFromParts({
      latestUserText: params.latestUserText ?? null,
      runtimeTurnEnvelope: params.runtimeTurnEnvelope ?? null,
      projectContext,
      threadWorkingState: params.threadWorkingState ?? null,
      recentToolAttempts,
      runtimeRunEvents: params.runtimeRunEvents ?? [],
      runtimeStop: params.runtimeStop ?? null,
    }),
    runtimeStop: params.runtimeStop ?? null,
  };
}

function compactSnapshotString(value: string | null | undefined, limit: number): string | null {
  return truncatePromptSnippet(value, limit);
}

function compactSnapshotList(
  values: string[] | null | undefined,
  limit: number,
  itemLimit: number,
): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const normalized = values
    .map((value) => compactSnapshotString(value, itemLimit))
    .filter((value): value is string => Boolean(value));
  return normalized.length > 0 ? normalized.slice(0, limit) : undefined;
}

function compactThreadWorkingStateSnapshot(
  state: ThreadWorkingStatePrompt | null | undefined,
): ThreadWorkingStatePrompt | null {
  if (!state || typeof state !== "object") return null;
  const out: ThreadWorkingStatePrompt = {
    version: typeof state.version === "number" ? state.version : undefined,
    goal: compactSnapshotString(state.goal, 240) ?? undefined,
    status: compactSnapshotString(state.status, 80) as ThreadWorkingStatePrompt["status"],
    currentStep: compactSnapshotString(state.currentStep, 180) ?? undefined,
    plan: compactSnapshotList(state.plan, 6, 180),
    completedSteps: compactSnapshotList(state.completedSteps, 8, 180),
    decisions: compactSnapshotList(state.decisions, 5, 200),
    openQuestions: compactSnapshotList(state.openQuestions, 4, 200),
    focusFiles: compactSnapshotList(state.focusFiles, 8, 160),
    lastResult: compactSnapshotString(state.lastResult, 240) ?? undefined,
    verificationStatus: compactSnapshotString(
      state.verificationStatus,
      80,
    ) as ThreadWorkingStatePrompt["verificationStatus"],
    filesTouched: compactSnapshotList(state.filesTouched, 12, 160),
    filesChanged: compactSnapshotList(state.filesChanged, 12, 160) ?? [],
    verifiedFindings: compactSnapshotList(state.verifiedFindings, 8, 180) ?? [],
    recentActions: compactSnapshotList(state.recentActions, 6, 180),
    lastDiagnostic: compactSnapshotString(state.lastDiagnostic, 240) ?? undefined,
    openIssue: compactSnapshotString(state.openIssue, 240) ?? undefined,
    blocker: compactSnapshotString(state.blocker ?? state.openIssue, 240) ?? undefined,
    nextAction: compactSnapshotString(state.nextAction, 200) ?? undefined,
  };
  for (const key of Object.keys(out) as Array<keyof ThreadWorkingStatePrompt>) {
    if (out[key] === undefined || out[key] === null) {
      delete out[key];
    }
  }
  return out;
}

export function buildRuntimeTurnContextSnapshot(params: {
  packet: RuntimeTurnContextPacket;
  capturedAt?: number | null;
}): RuntimeTurnContextSnapshotV1 {
  const capturedAt =
    typeof params.capturedAt === "number" && Number.isFinite(params.capturedAt)
      ? Math.floor(params.capturedAt)
      : Date.now();
  return {
    version: 1,
    capturedAt,
    latestUserText: compactSnapshotString(params.packet.latestUserText, 500),
    runtimeTurnEnvelope: params.packet.runtimeTurnEnvelope ?? null,
    projectContext: normalizeRuntimeProjectContext(params.packet.projectContext ?? null),
    threadWorkingState: compactThreadWorkingStateSnapshot(
      params.packet.threadWorkingState,
    ),
    recentToolAttempts: params.packet.recentToolAttempts.slice(0, 6).map((attempt) => ({
      ...attempt,
      commandOrTarget: compactSnapshotString(attempt.commandOrTarget, 180),
      cwd: compactSnapshotString(attempt.cwd, 120),
      errorMessage: compactSnapshotString(attempt.errorMessage, 180),
      outputPreview: compactSnapshotString(attempt.outputPreview, 240),
      failureSummary: compactSnapshotString(attempt.failureSummary, 200),
      suggestedRecovery: compactSnapshotString(attempt.suggestedRecovery, 200),
    })),
    fragments: compactRuntimeContextFragmentsForSnapshot(params.packet.fragments),
    runtimeStop: params.packet.runtimeStop ?? null,
  };
}

export function renderRuntimeTurnContextForPrompt(
  packet: RuntimeTurnContextPacket | null | undefined,
): string | null {
  if (!packet) return null;
  const fragments = Array.isArray(packet.fragments) && packet.fragments.length > 0
    ? packet.fragments
    : buildRuntimeContextFragmentsFromParts({
        latestUserText: packet.latestUserText ?? null,
        runtimeTurnEnvelope: packet.runtimeTurnEnvelope ?? null,
        projectContext: packet.projectContext ?? null,
        threadWorkingState: packet.threadWorkingState ?? null,
        recentToolAttempts: packet.recentToolAttempts,
        runtimeStop: packet.runtimeStop ?? null,
      });
  return renderRuntimeContextFragmentsForPrompt(fragments);
}

export function renderRuntimeTurnContextForFailureFinalizer(
  packet: RuntimeTurnContextPacket | null | undefined,
): string {
  if (!packet) return "(none)";
  const rendered = joinPromptBlocks([
    packet.latestUserText && !packet.runtimeStop
      ? `Latest user message: ${truncatePromptSnippet(packet.latestUserText, 500)}`
      : null,
    renderRuntimeTurnContextForPrompt(packet),
  ]);
  return rendered || "(none)";
}
