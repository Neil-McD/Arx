import type {
  RuntimeWorkspaceTerminalPrompt,
  ThreadWorkingStatePrompt,
} from "./runtimePrompt.ts";
import {
  normalizeRuntimeProjectContext,
  type RuntimeProjectContextPrompt,
} from "./projectContext.ts";
import { deriveRuntimePreviewDiagnosis } from "./runtimePreviewDiagnostics.ts";
import {
  buildRuntimeContextFragmentsFromParts,
  compactRuntimeContextFragmentsForSnapshot,
  renderRuntimeContextFragmentsForPrompt,
  type RuntimeContextFragmentV1,
  type RuntimeContextRunEvent,
} from "./runtimeContextFragments.ts";
import type { RuntimeTurnEnvelopeV1 } from "./runtimeTurnEnvelope.ts";

export type RuntimeTurnContextPacket = {
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  projectContext?: RuntimeProjectContextPrompt | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[];
  recentBackgroundProcessEvents: RuntimeBackgroundProcessEventPrompt[];
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
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[];
  recentBackgroundProcessEvents: RuntimeBackgroundProcessEventPrompt[];
  recentToolAttempts: RuntimeRecentToolAttemptPrompt[];
  fragments?: RuntimeContextFragmentV1[];
  runtimeStop: RuntimeTurnContextPacket["runtimeStop"];
};

export type RuntimeBackgroundProcessEventPrompt = {
  terminalId: string;
  status: "exited" | "failed" | "stopped";
  completionReason?: RuntimeWorkspaceTerminalPrompt["completionReason"];
  command: string;
  cwd?: string | null;
  previewPort?: number | null;
  previewStatus?: RuntimeWorkspaceTerminalPrompt["previewStatus"];
  healthSummary?: string | null;
  exitCode?: number | null;
  outputTail?: string | null;
  finishedAt?: number | null;
  completionRecordedAt?: number | null;
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
  connectedAppName?: string | null;
  connectedAppScope?: string | null;
  connectedAppToolName?: string | null;
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

function normalizeTerminalStatus(
  value: unknown,
): RuntimeWorkspaceTerminalPrompt["status"] | null {
  const status = String(value ?? "").trim();
  if (
    status === "starting" ||
    status === "running" ||
    status === "exited" ||
    status === "failed" ||
    status === "stopped"
  ) {
    return status;
  }
  return null;
}

function readOptionalString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function readOptionalNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
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
  const connectedAppName = readAttemptString(params.failureSemantics, "app_name", "appName");
  const connectedAppToolName = readAttemptString(
    params.failureSemantics,
    "app_tool_name",
    "appToolName",
  );
  if (connectedAppName || connectedAppToolName) {
    return [connectedAppName, connectedAppToolName].filter(Boolean).join(".");
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
    readAttemptString(details, "output_preview", "stdout_preview", "stderr_preview");
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
    connectedAppName: readAttemptString(failureSemantics, "app_name", "appName"),
    connectedAppScope: readAttemptString(failureSemantics, "app_scope", "appScope"),
    connectedAppToolName: readAttemptString(failureSemantics, "app_tool_name", "appToolName"),
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

export function mapRuntimeWorkspaceTerminalPrompt(
  terminal: unknown,
): RuntimeWorkspaceTerminalPrompt | null {
  if (!terminal || typeof terminal !== "object") return null;
  const record = terminal as Record<string, unknown>;
  const id = String(record.id ?? record.terminal_session_id ?? "").trim();
  const command = String(record.command ?? "").trim();
  const status = normalizeTerminalStatus(record.status);
  if (!id || !command || !status) return null;
  const mapped: RuntimeWorkspaceTerminalPrompt = {
    id,
    status,
    lifecycleOwner: "project_background",
    command,
    cwd: readOptionalString(record, "cwd"),
    previewPort: readOptionalNumber(record, "preview_port", "previewPort"),
    previewPath: readOptionalString(record, "preview_path", "previewPath"),
    previewLabel: readOptionalString(record, "preview_label", "previewLabel"),
    previewStatus:
      readOptionalString(record, "preview_status", "previewStatus") as RuntimeWorkspaceTerminalPrompt["previewStatus"],
    healthStatus:
      readOptionalString(record, "health_status", "healthStatus") as RuntimeWorkspaceTerminalPrompt["healthStatus"],
    healthSummary: readOptionalString(record, "health_summary", "healthSummary"),
    lastPreviewProbeSummary: readOptionalString(
      record,
      "last_preview_probe_summary",
      "lastPreviewProbeSummary",
    ),
    lastBrowserObservationSummary: readOptionalString(
      record,
      "last_browser_observation_summary",
      "lastBrowserObservationSummary",
    ),
    previewTransportStatus: readOptionalString(
      record,
      "preview_transport_status",
      "previewTransportStatus",
    ) as RuntimeWorkspaceTerminalPrompt["previewTransportStatus"],
    previewInspectionStatus: readOptionalString(
      record,
      "preview_inspection_status",
      "previewInspectionStatus",
    ) as RuntimeWorkspaceTerminalPrompt["previewInspectionStatus"],
    previewRenderStatus: readOptionalString(
      record,
      "preview_render_status",
      "previewRenderStatus",
    ) as RuntimeWorkspaceTerminalPrompt["previewRenderStatus"],
    outputTail: readOptionalString(record, "output_tail", "outputTail"),
    exitCode: readOptionalNumber(record, "exit_code", "exitCode"),
    completionRecordedAt: readOptionalNumber(
      record,
      "completion_recorded_at",
      "completionRecordedAt",
    ),
    completionReason: readOptionalString(
      record,
      "completion_reason",
      "completionReason",
    ) as RuntimeWorkspaceTerminalPrompt["completionReason"],
  };
  const previewDiagnosis = deriveRuntimePreviewDiagnosis(mapped);
  if (previewDiagnosis) {
    mapped.previewDiagnosis = previewDiagnosis.diagnosis;
    mapped.recommendedPreviewDebugAction = previewDiagnosis.recommendedNextAction;
  }
  return mapped;
}

export function mapRuntimeBackgroundProcessEventPrompt(
  terminal: unknown,
): RuntimeBackgroundProcessEventPrompt | null {
  const mapped = mapRuntimeWorkspaceTerminalPrompt(terminal);
  if (!mapped || !mapped.command) return null;
  if (
    mapped.status !== "exited" &&
    mapped.status !== "failed" &&
    mapped.status !== "stopped"
  ) {
    return null;
  }
  return {
    terminalId: mapped.id,
    status: mapped.status,
    completionReason: mapped.completionReason ?? null,
    command: mapped.command,
    cwd: mapped.cwd ?? null,
    previewPort: mapped.previewPort ?? null,
    previewStatus: mapped.previewStatus ?? null,
    healthSummary: mapped.healthSummary ?? null,
    exitCode: mapped.exitCode ?? null,
    outputTail: mapped.outputTail ?? null,
    finishedAt: readOptionalNumber(
      (terminal && typeof terminal === "object" && !Array.isArray(terminal)
        ? (terminal as Record<string, unknown>)
        : {}) as Record<string, unknown>,
      "finished_at",
      "finishedAt",
    ),
    completionRecordedAt: mapped.completionRecordedAt ?? null,
  };
}

function withRuntimePreviewDiagnosis(
  terminal: RuntimeWorkspaceTerminalPrompt,
): RuntimeWorkspaceTerminalPrompt {
  if (terminal.previewDiagnosis && terminal.recommendedPreviewDebugAction) {
    return terminal;
  }
  const previewDiagnosis = deriveRuntimePreviewDiagnosis(terminal);
  if (!previewDiagnosis) return terminal;
  return {
    ...terminal,
    previewDiagnosis: previewDiagnosis.diagnosis,
    recommendedPreviewDebugAction: previewDiagnosis.recommendedNextAction,
  };
}

export function buildRuntimeTurnContextPacket(params: {
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  projectContext?: RuntimeProjectContextPrompt | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals?: Array<RuntimeWorkspaceTerminalPrompt | null | undefined> | null;
  recentBackgroundProcessEvents?: Array<RuntimeBackgroundProcessEventPrompt | null | undefined> | null;
  recentToolAttempts?: Array<RuntimeRecentToolAttemptPrompt | null | undefined> | null;
  runtimeRunEvents?: Array<RuntimeContextRunEvent | null | undefined> | null;
  runtimeStop?: RuntimeTurnContextPacket["runtimeStop"];
}): RuntimeTurnContextPacket {
  const activeBackgroundTerminals = Array.isArray(params.activeBackgroundTerminals)
    ? params.activeBackgroundTerminals.filter(
        (terminal): terminal is RuntimeWorkspaceTerminalPrompt =>
          Boolean(terminal && terminal.command),
      ).map((terminal) => withRuntimePreviewDiagnosis(terminal))
    : [];
  const recentBackgroundProcessEvents = Array.isArray(params.recentBackgroundProcessEvents)
    ? params.recentBackgroundProcessEvents
        .filter(
          (event): event is RuntimeBackgroundProcessEventPrompt =>
            Boolean(event && event.terminalId && event.command),
        )
        .slice(0, 6)
    : [];
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
    activeBackgroundTerminals,
    recentBackgroundProcessEvents,
    recentToolAttempts,
    fragments: buildRuntimeContextFragmentsFromParts({
      latestUserText: params.latestUserText ?? null,
      runtimeTurnEnvelope: params.runtimeTurnEnvelope ?? null,
      projectContext,
      threadWorkingState: params.threadWorkingState ?? null,
      activeBackgroundTerminals,
      recentBackgroundProcessEvents,
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

function compactTerminalSnapshot(
  terminal: RuntimeWorkspaceTerminalPrompt,
): RuntimeWorkspaceTerminalPrompt {
  return {
    id: compactSnapshotString(terminal.id, 120) ?? terminal.id,
    status: terminal.status,
    lifecycleOwner: terminal.lifecycleOwner,
    command: compactSnapshotString(terminal.command, 180) ?? terminal.command,
    cwd: compactSnapshotString(terminal.cwd, 120),
    previewPort: terminal.previewPort,
    previewPath: compactSnapshotString(terminal.previewPath, 120),
    previewLabel: compactSnapshotString(terminal.previewLabel, 120),
    previewStatus: terminal.previewStatus,
    healthStatus: terminal.healthStatus,
    healthSummary: compactSnapshotString(terminal.healthSummary, 180),
    lastPreviewProbeSummary: compactSnapshotString(terminal.lastPreviewProbeSummary, 180),
    lastBrowserObservationSummary: compactSnapshotString(
      terminal.lastBrowserObservationSummary,
      180,
    ),
    previewTransportStatus: terminal.previewTransportStatus,
    previewInspectionStatus: terminal.previewInspectionStatus,
    previewRenderStatus: terminal.previewRenderStatus,
    previewDiagnosis: terminal.previewDiagnosis,
    recommendedPreviewDebugAction: compactSnapshotString(
      terminal.recommendedPreviewDebugAction,
      180,
    ),
    outputTail: compactSnapshotString(terminal.outputTail, 240),
    exitCode: terminal.exitCode,
    completionRecordedAt: terminal.completionRecordedAt,
    completionReason: terminal.completionReason,
  };
}

function compactBackgroundProcessEventSnapshot(
  event: RuntimeBackgroundProcessEventPrompt,
): RuntimeBackgroundProcessEventPrompt {
  return {
    terminalId: compactSnapshotString(event.terminalId, 120) ?? event.terminalId,
    status: event.status,
    completionReason: event.completionReason,
    command: compactSnapshotString(event.command, 180) ?? event.command,
    cwd: compactSnapshotString(event.cwd, 120),
    previewPort: event.previewPort,
    previewStatus: event.previewStatus,
    healthSummary: compactSnapshotString(event.healthSummary, 180),
    exitCode: event.exitCode,
    outputTail: compactSnapshotString(event.outputTail, 240),
    finishedAt: event.finishedAt,
    completionRecordedAt: event.completionRecordedAt,
  };
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
    activeBackgroundTerminals: params.packet.activeBackgroundTerminals
      .slice(0, 3)
      .map(compactTerminalSnapshot),
    recentBackgroundProcessEvents: params.packet.recentBackgroundProcessEvents
      .slice(0, 4)
      .map(compactBackgroundProcessEventSnapshot),
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
        activeBackgroundTerminals: packet.activeBackgroundTerminals,
        recentBackgroundProcessEvents: packet.recentBackgroundProcessEvents,
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
