import type {
  RuntimeWorkspaceTerminalPrompt,
  ThreadWorkingStatePrompt,
} from "./runtimePrompt.ts";
import { deriveRuntimePreviewDiagnosis } from "./runtimePreviewDiagnostics.ts";

export type RuntimeTurnContextPacket = {
  latestUserText?: string | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[];
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
  threadWorkingState: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[];
  runtimeStop: RuntimeTurnContextPacket["runtimeStop"];
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
  };
  const previewDiagnosis = deriveRuntimePreviewDiagnosis(mapped);
  if (previewDiagnosis) {
    mapped.previewDiagnosis = previewDiagnosis.diagnosis;
    mapped.recommendedPreviewDebugAction = previewDiagnosis.recommendedNextAction;
  }
  return mapped;
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
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals?: Array<RuntimeWorkspaceTerminalPrompt | null | undefined> | null;
  runtimeStop?: RuntimeTurnContextPacket["runtimeStop"];
}): RuntimeTurnContextPacket {
  return {
    latestUserText: params.latestUserText ?? null,
    threadWorkingState: params.threadWorkingState ?? null,
    activeBackgroundTerminals: Array.isArray(params.activeBackgroundTerminals)
      ? params.activeBackgroundTerminals.filter(
          (terminal): terminal is RuntimeWorkspaceTerminalPrompt =>
            Boolean(terminal && terminal.command),
        ).map((terminal) => withRuntimePreviewDiagnosis(terminal))
      : [],
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
    threadWorkingState: compactThreadWorkingStateSnapshot(
      params.packet.threadWorkingState,
    ),
    activeBackgroundTerminals: params.packet.activeBackgroundTerminals
      .slice(0, 3)
      .map(compactTerminalSnapshot),
    runtimeStop: params.packet.runtimeStop ?? null,
  };
}

function buildThreadWorkingStatePrompt(packet: RuntimeTurnContextPacket): string | null {
  const raw = packet.threadWorkingState;
  if (!raw || typeof raw !== "object") return null;
  const goal = truncatePromptSnippet(raw.goal, 240);
  const status = truncatePromptSnippet(raw.status, 80);
  const currentStep = truncatePromptSnippet(raw.currentStep, 240);
  const plan = Array.isArray(raw.plan)
    ? raw.plan.map((value) => truncatePromptSnippet(value, 180)).filter(Boolean)
    : [];
  const completedSteps = Array.isArray(raw.completedSteps)
    ? raw.completedSteps.map((value) => truncatePromptSnippet(value, 180)).filter(Boolean)
    : [];
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.map((value) => truncatePromptSnippet(value, 200)).filter(Boolean)
    : [];
  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.map((value) => truncatePromptSnippet(value, 200)).filter(Boolean)
    : [];
  const focusFiles = Array.isArray(raw.focusFiles)
    ? raw.focusFiles.map((value) => truncatePromptSnippet(value, 120)).filter(Boolean)
    : [];
  const lastResult = truncatePromptSnippet(raw.lastResult, 260);
  const verificationStatus = truncatePromptSnippet(raw.verificationStatus, 80);
  const filesTouched = Array.isArray(raw.filesTouched)
    ? raw.filesTouched.map((value) => truncatePromptSnippet(value, 120)).filter(Boolean)
    : [];
  const filesChanged = Array.isArray(raw.filesChanged)
    ? raw.filesChanged.map((value) => truncatePromptSnippet(value, 120)).filter(Boolean)
    : [];
  const verifiedFindings = Array.isArray(raw.verifiedFindings)
    ? raw.verifiedFindings.map((value) => truncatePromptSnippet(value, 180)).filter(Boolean)
    : [];
  const recentActions = Array.isArray(raw.recentActions)
    ? raw.recentActions.slice(-6).map((value) => truncatePromptSnippet(value, 180)).filter(Boolean)
    : [];
  const lastDiagnostic = truncatePromptSnippet(raw.lastDiagnostic, 260);
  const openIssue = truncatePromptSnippet(raw.openIssue ?? raw.blocker, 260);
  const nextAction = truncatePromptSnippet(raw.nextAction, 240);
  if (
    !goal &&
    !status &&
    !currentStep &&
    plan.length === 0 &&
    completedSteps.length === 0 &&
    decisions.length === 0 &&
    openQuestions.length === 0 &&
    focusFiles.length === 0 &&
    !lastResult &&
    !verificationStatus &&
    filesTouched.length === 0 &&
    filesChanged.length === 0 &&
    verifiedFindings.length === 0 &&
    recentActions.length === 0 &&
    !lastDiagnostic &&
    !openIssue &&
    !nextAction
  ) {
    return null;
  }
  return [
    "THREAD_WORKING_STATE",
    `Goal: ${goal || "(none)"}`,
    `Status: ${status || "(none)"}`,
    `Current step: ${currentStep || "(none)"}`,
    `Plan: ${plan.length > 0 ? plan.join(" | ") : "(none)"}`,
    `Completed steps: ${completedSteps.length > 0 ? completedSteps.join(" | ") : "(none)"}`,
    `Decisions: ${decisions.length > 0 ? decisions.join(" | ") : "(none)"}`,
    `Open questions: ${openQuestions.length > 0 ? openQuestions.join(" | ") : "(none)"}`,
    `Focus files: ${focusFiles.length > 0 ? focusFiles.join(", ") : "(none)"}`,
    `Last verified result: ${lastResult || "(none)"}`,
    `Verification: ${verificationStatus || "(none)"}`,
    `Files touched: ${filesTouched.length > 0 ? filesTouched.join(", ") : "(none)"}`,
    `Files changed: ${filesChanged.length > 0 ? filesChanged.join(", ") : "(none)"}`,
    `Verified findings: ${verifiedFindings.length > 0 ? verifiedFindings.join(" | ") : "(none)"}`,
    `Last diagnostic: ${lastDiagnostic || "(none)"}`,
    `Recent actions: ${recentActions.length > 0 ? recentActions.join(" | ") : "(none)"}`,
    `Blocker: ${openIssue || "(none)"}`,
    `Next action: ${nextAction || "(none)"}`,
    "Treat this as compact continuity from prior verified work. Re-read files when exact current contents matter.",
  ].join("\n");
}

function buildWorkspaceProcessContextPrompt(packet: RuntimeTurnContextPacket): string | null {
  const active = packet.activeBackgroundTerminals.filter(
    (row) => row && typeof row.command === "string",
  );
  if (active.length === 0) return null;
  const lines: string[] = ["WORKSPACE_PROCESS_CONTEXT", "Active background processes:"];
  for (const terminal of active.slice(0, 3)) {
    const command = truncatePromptSnippet(terminal.command, 120) ?? "(unknown command)";
    const cwd = truncatePromptSnippet(terminal.cwd, 80);
    const tail = truncatePromptSnippet(terminal.outputTail, 140);
    const lifecycleOwner = truncatePromptSnippet(terminal.lifecycleOwner, 40);
    const healthStatus = truncatePromptSnippet(terminal.healthStatus, 40);
    const healthSummary = truncatePromptSnippet(terminal.healthSummary, 120);
    const previewProcessStatus = truncatePromptSnippet(terminal.previewStatus, 60);
    const previewTransportStatus = truncatePromptSnippet(
      terminal.previewTransportStatus,
      40,
    );
    const previewInspectionStatus = truncatePromptSnippet(
      terminal.previewInspectionStatus,
      60,
    );
    const previewRenderStatus = truncatePromptSnippet(
      terminal.previewRenderStatus,
      60,
    );
    const previewParts = [
      typeof terminal.previewPort === "number" ? `port=${terminal.previewPort}` : null,
      terminal.previewPath ? `path=${truncatePromptSnippet(terminal.previewPath, 80)}` : null,
      terminal.previewLabel ? `label=${truncatePromptSnippet(terminal.previewLabel, 80)}` : null,
      previewTransportStatus ? `transport=${previewTransportStatus}` : null,
      previewInspectionStatus ? `inspection=${previewInspectionStatus}` : null,
      previewRenderStatus ? `render=${previewRenderStatus}` : null,
    ].filter(Boolean);
    const previewProbe = truncatePromptSnippet(terminal.lastPreviewProbeSummary, 120);
    const browserObservation = truncatePromptSnippet(terminal.lastBrowserObservationSummary, 120);
    const previewDiagnosis = truncatePromptSnippet(terminal.previewDiagnosis, 80);
    const recommendedPreviewDebugAction = truncatePromptSnippet(
      terminal.recommendedPreviewDebugAction,
      160,
    );
    lines.push(
      `- ${terminal.id}: ${terminal.status}${lifecycleOwner ? `; lifecycle=${lifecycleOwner}` : ""}${healthStatus ? `; health=${healthStatus}` : ""}${healthSummary ? `; health_summary=${healthSummary}` : ""}; command=${command}${cwd ? `; cwd=${cwd}` : ""}${previewProcessStatus ? `; preview_process=${previewProcessStatus}` : ""}${previewParts.length > 0 ? `; ${previewParts.join("; ")}` : ""}${previewDiagnosis ? `; preview_diagnosis=${previewDiagnosis}` : ""}${recommendedPreviewDebugAction ? `; recommended_preview_debug_action=${recommendedPreviewDebugAction}` : ""}${browserObservation ? `; browser_observation=${browserObservation}` : ""}${previewProbe ? `; preview_probe=${previewProbe}` : ""}${tail ? `; recent_output=${tail}` : ""}`,
    );
  }
  lines.push(
    "Treat active background process rows as canonical live workspace truth. Reuse an existing process when it is still relevant, and stop idle processes when the task no longer needs them.",
    "For preview debugging, follow the evidence order: terminal health, preview transport/render probe, browser/computer observation, then app root/runtime/CSS diagnosis.",
    "Treat preview_process as process/transport availability only; app render truth comes from transport, inspection, render, preview_diagnosis, browser_observation, and preview_probe fields.",
    "If the process is still running but render is blank_suspected or preview_diagnosis is runtime_error_suspected, inspect frontend render/console/root-mount/import/CSS causes before restarting the terminal.",
  );
  return lines.join("\n");
}

export function renderRuntimeTurnContextForPrompt(
  packet: RuntimeTurnContextPacket | null | undefined,
): string | null {
  if (!packet) return null;
  return joinPromptBlocks([
    buildThreadWorkingStatePrompt(packet),
    buildWorkspaceProcessContextPrompt(packet),
  ]);
}

export function renderRuntimeTurnContextForFailureFinalizer(
  packet: RuntimeTurnContextPacket | null | undefined,
): string {
  if (!packet) return "(none)";
  const rendered = joinPromptBlocks([
    packet.latestUserText
      ? `Latest user message: ${truncatePromptSnippet(packet.latestUserText, 500)}`
      : null,
    packet.runtimeStop
      ? [
          "RUNTIME_STOP",
          `Status: ${packet.runtimeStop.status}`,
          `Reason: ${truncatePromptSnippet(packet.runtimeStop.reason, 160) ?? "(none)"}`,
          `Error code: ${truncatePromptSnippet(packet.runtimeStop.errorCode, 160) ?? "(none)"}`,
          `Error message: ${truncatePromptSnippet(packet.runtimeStop.errorMessage, 260) ?? "(none)"}`,
        ].join("\n")
      : null,
    renderRuntimeTurnContextForPrompt(packet),
  ]);
  return rendered || "(none)";
}
