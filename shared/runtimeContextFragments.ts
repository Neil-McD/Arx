import type {
  RuntimeWorkspaceTerminalPrompt,
  ThreadWorkingStatePrompt,
} from "./runtimePrompt.ts";
import {
  renderProjectContextForPrompt,
  type RuntimeProjectContextPrompt,
} from "./projectContext.ts";
import {
  renderRuntimeTurnEnvelopeForPrompt,
  type RuntimeTurnEnvelopeV1,
} from "./runtimeTurnEnvelope.ts";
import { runtimeCommunityContextReceiptTarget } from "./runtimeCommunityContextReceipt.ts";

export const RUNTIME_CONTEXT_FRAGMENT_RENDER_BUDGET_CHARS = 12_000;

export type RuntimeContextFragmentKind =
  | "turn_envelope"
  | "project_context"
  | "working_state"
  | "action_ledger"
  | "active_terminals"
  | "recent_background_process_events"
  | "recent_tool_attempts"
  | "runtime_stop";

export type RuntimeContextFragmentSource =
  | "runtime_turn_envelope"
  | "cloud_project"
  | "thread_working_state"
  | "runtime_run_events"
  | "workspace_terminals";

export type RuntimeContextFragmentPriority = "critical" | "high" | "normal" | "low";

export type RuntimeContextFragmentV1 = {
  version: 1;
  id: string;
  kind: RuntimeContextFragmentKind;
  source: RuntimeContextFragmentSource;
  ordinal: number;
  priority: RuntimeContextFragmentPriority;
  title: string;
  body: string;
  budget: {
    maxChars: number;
    usedChars: number;
    truncated: boolean;
  };
  redaction: {
    applied: boolean;
    rules: string[];
  };
  createdAt?: number | null;
};

export type RuntimeContextRunEvent = {
  seq?: number | null;
  eventType: string;
  eventKey?: string | null;
  payload: unknown;
  createdAt?: number | null;
};

export type RuntimeContextStopFragmentInput = {
  status: "error" | "cancelled";
  reason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
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
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function truncateBlock(value: string, maxChars: number): { body: string; truncated: boolean } {
  const normalized = String(value ?? "").trim();
  const limit = Math.max(0, Math.floor(maxChars));
  if (!normalized || limit <= 0) return { body: "", truncated: normalized.length > 0 };
  if (normalized.length <= limit) return { body: normalized, truncated: false };
  const suffix = "\n[truncated]";
  if (limit <= suffix.length) {
    return {
      body: normalized.slice(0, limit),
      truncated: true,
    };
  }
  const take = Math.max(0, limit - suffix.length);
  return {
    body: `${normalized.slice(0, take).trimEnd()}${suffix}`,
    truncated: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  return asRecord(asRecord(value)?.[key]);
}

function readString(value: unknown, limit = 240): string | null {
  return truncatePromptSnippet(typeof value === "string" ? value : String(value ?? ""), limit);
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function compactList(
  values: readonly unknown[] | null | undefined,
  limit: number,
  itemLimit: number,
): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    const normalized = readString(value, itemLimit);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function redactRuntimeContextText(value: string): {
  text: string;
  applied: boolean;
  rules: string[];
} {
  let text = String(value ?? "");
  const rules: string[] = [];
  const applyRule = (rule: string, pattern: RegExp, replacement: string): void => {
    const next = text.replace(pattern, replacement);
    if (next !== text && !rules.includes(rule)) rules.push(rule);
    text = next;
  };
  applyRule("jwt", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted_jwt]");
  applyRule("api_key", /\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted_api_key]");
  applyRule("bearer", /Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  applyRule(
    "secret_assignment",
    /(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|x-api-key|secret)["']?\s*[:=]\s*["']?[^"',}\s]+/gi,
    "$1:[redacted]",
  );
  return { text, applied: rules.length > 0, rules };
}

function createRuntimeContextFragment(params: {
  id: string;
  kind: RuntimeContextFragmentKind;
  source: RuntimeContextFragmentSource;
  ordinal: number;
  priority: RuntimeContextFragmentPriority;
  title: string;
  body: string | null | undefined;
  maxChars: number;
  createdAt?: number | null;
}): RuntimeContextFragmentV1 | null {
  const body = normalizePromptBlock(params.body);
  if (!body) return null;
  const redacted = redactRuntimeContextText(body);
  const bounded = truncateBlock(redacted.text, params.maxChars);
  if (!bounded.body) return null;
  return {
    version: 1,
    id: params.id,
    kind: params.kind,
    source: params.source,
    ordinal: Math.floor(params.ordinal),
    priority: params.priority,
    title: params.title,
    body: bounded.body,
    budget: {
      maxChars: Math.floor(params.maxChars),
      usedChars: bounded.body.length,
      truncated: bounded.truncated,
    },
    redaction: {
      applied: redacted.applied,
      rules: redacted.rules,
    },
    createdAt:
      typeof params.createdAt === "number" && Number.isFinite(params.createdAt)
        ? Math.floor(params.createdAt)
        : null,
  };
}

function buildWorkingStatePrompt(raw: ThreadWorkingStatePrompt | null | undefined): string | null {
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

function buildActiveTerminalsPrompt(
  activeBackgroundTerminals: RuntimeWorkspaceTerminalPrompt[],
): string | null {
  const active = activeBackgroundTerminals.filter(
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
    const previewTransportStatus = truncatePromptSnippet(terminal.previewTransportStatus, 40);
    const previewInspectionStatus = truncatePromptSnippet(terminal.previewInspectionStatus, 60);
    const previewRenderStatus = truncatePromptSnippet(terminal.previewRenderStatus, 60);
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

function buildRecentBackgroundProcessEventsPrompt(events: Array<{
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
}>): string | null {
  const rows = events.filter((event) => event.terminalId && event.command);
  if (rows.length === 0) return null;
  const lines = ["RECENT_BACKGROUND_PROCESS_EVENTS"];
  for (const event of rows.slice(0, 6)) {
    const parts = [
      event.completionReason ? `reason=${truncatePromptSnippet(event.completionReason, 80)}` : null,
      event.cwd ? `cwd=${truncatePromptSnippet(event.cwd, 80)}` : null,
      typeof event.previewPort === "number" ? `port=${event.previewPort}` : null,
      event.previewStatus ? `preview=${truncatePromptSnippet(event.previewStatus, 80)}` : null,
      typeof event.exitCode === "number" ? `exit=${event.exitCode}` : null,
      event.healthSummary ? `health=${truncatePromptSnippet(event.healthSummary, 140)}` : null,
      event.outputTail ? `output=${truncatePromptSnippet(event.outputTail, 220)}` : null,
    ].filter(Boolean);
    lines.push(
      `- ${event.terminalId}: ${event.status}; command=${truncatePromptSnippet(event.command, 140) ?? "(unknown command)"}${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`,
    );
  }
  lines.push(
    "Treat these as recent lifecycle events from managed background terminals. A completed preview server invalidates older live-preview assumptions unless a newer active process for the same app exists.",
  );
  return lines.join("\n");
}

function buildRecentToolAttemptsPrompt(attempts: Array<{
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
}>): string | null {
  const rows = attempts.filter((attempt) => attempt.toolName);
  if (rows.length === 0) return null;
  const lines = ["RECENT_TOOL_ATTEMPTS"];
  for (const attempt of rows.slice(0, 8)) {
    const parts = [
      attempt.commandOrTarget ? `target=${truncatePromptSnippet(attempt.commandOrTarget, 140)}` : null,
      attempt.cwd ? `cwd=${truncatePromptSnippet(attempt.cwd, 80)}` : null,
      typeof attempt.exitCode === "number" ? `exit=${attempt.exitCode}` : null,
      attempt.errorCode ? `error_code=${truncatePromptSnippet(attempt.errorCode, 80)}` : null,
      attempt.failureKind ? `failure_kind=${truncatePromptSnippet(attempt.failureKind, 80)}` : null,
      attempt.errorMessage ? `error=${truncatePromptSnippet(attempt.errorMessage, 140)}` : null,
      attempt.failureSummary ? `failure=${truncatePromptSnippet(attempt.failureSummary, 180)}` : null,
      attempt.suggestedRecovery ? `recovery=${truncatePromptSnippet(attempt.suggestedRecovery, 180)}` : null,
      attempt.outputPreview ? `output=${truncatePromptSnippet(attempt.outputPreview, 220)}` : null,
    ].filter(Boolean);
    lines.push(
      `- ${attempt.toolName} ${attempt.status}${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`,
    );
  }
  lines.push(
    "Treat these as recent operational evidence from actual tool calls. Do not say exact failed tool calls are unavailable when they are listed here.",
  );
  return lines.join("\n");
}

function buildRuntimeStopPrompt(params: {
  latestUserText?: string | null;
  runtimeStop?: RuntimeContextStopFragmentInput | null;
}): string | null {
  if (!params.runtimeStop) return null;
  return [
    "RUNTIME_STOP",
    params.latestUserText ? `Latest user message: ${truncatePromptSnippet(params.latestUserText, 500)}` : null,
    `Status: ${params.runtimeStop.status}`,
    `Reason: ${truncatePromptSnippet(params.runtimeStop.reason, 160) ?? "(none)"}`,
    `Error code: ${truncatePromptSnippet(params.runtimeStop.errorCode, 160) ?? "(none)"}`,
    `Error message: ${truncatePromptSnippet(params.runtimeStop.errorMessage, 260) ?? "(none)"}`,
  ].filter(Boolean).join("\n");
}

function normalizeEventSeq(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normalizeEventTime(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

export function sortRuntimeContextRunEvents(
  events: Array<RuntimeContextRunEvent | null | undefined> | null | undefined,
): RuntimeContextRunEvent[] {
  return (Array.isArray(events) ? events : [])
    .filter((event): event is RuntimeContextRunEvent => Boolean(event?.eventType))
    .slice()
    .sort((a, b) => {
      const aSeq = normalizeEventSeq(a.seq);
      const bSeq = normalizeEventSeq(b.seq);
      if (aSeq !== null && bSeq !== null && aSeq !== bSeq) return aSeq - bSeq;
      if (aSeq !== null && bSeq === null) return -1;
      if (aSeq === null && bSeq !== null) return 1;
      const createdDelta = normalizeEventTime(a.createdAt) - normalizeEventTime(b.createdAt);
      if (createdDelta !== 0) return createdDelta;
      const eventTypeDelta = String(a.eventType).localeCompare(String(b.eventType));
      if (eventTypeDelta !== 0) return eventTypeDelta;
      return String(a.eventKey ?? "").localeCompare(String(b.eventKey ?? ""));
    });
}

function readToolTarget(payload: Record<string, unknown>, toolName: string): string | null {
  const receiptTarget = runtimeCommunityContextReceiptTarget(payload);
  if (receiptTarget) return receiptTarget;
  const args = asRecord(payload.args);
  const details = asRecord(payload.details);
  const failureSemantics = asRecord(payload.failure_semantics);
  if (toolName === "bash") {
    return readString(failureSemantics?.command ?? args?.command ?? details?.command, 180);
  }
  if (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "sha256") {
    return readString(args?.path, 180);
  }
  if (toolName === "grep" || toolName === "glob") {
    return readString(args?.pattern ?? args?.query ?? args?.path, 180);
  }
  if (toolName === "computer_open_url") {
    return readString(args?.url ?? details?.url ?? details?.target_url, 180);
  }
  return readString(args?.path ?? args?.url ?? args?.query ?? args?.command, 180);
}

function buildActionLedgerLine(event: RuntimeContextRunEvent): string | null {
  const payload = asRecord(event.payload) ?? {};
  const seq = normalizeEventSeq(event.seq);
  const seqLabel = seq === null ? "unsequenced" : `seq=${seq}`;
  const eventType = String(event.eventType ?? "").trim();
  if (
    eventType === "assistant_text_delta" ||
    eventType === "reasoning_summary_text_delta" ||
    eventType === "tool_call_output_delta" ||
    eventType === "codex_reasoning_text_delta"
  ) {
    return null;
  }
  if (eventType === "run_started") {
    const parts = [
      readString(payload.lane, 80) ? `lane=${readString(payload.lane, 80)}` : null,
      readString(payload.execution_mode, 80) ? `mode=${readString(payload.execution_mode, 80)}` : null,
      readString(payload.engine_id, 120) ? `engine=${readString(payload.engine_id, 120)}` : null,
      readString(payload.model_id, 120) ? `model=${readString(payload.model_id, 120)}` : null,
    ].filter(Boolean);
    return `- ${seqLabel} run_started${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`;
  }
  if (eventType === "runtime_context_resolved") {
    const capabilities = compactList(
      Array.isArray(payload.capability_families) ? payload.capability_families : [],
      6,
      80,
    );
    const parts = [
      payload.community_id ? "community_lens=present" : "community_lens=none",
      payload.project_id ? "project=present" : "project=none",
      readString(payload.harness_profile, 100) ? `harness=${readString(payload.harness_profile, 100)}` : null,
      capabilities.length > 0 ? `capabilities=${capabilities.join(",")}` : null,
    ].filter(Boolean);
    return `- ${seqLabel} runtime_context_resolved; ${parts.join("; ")}`;
  }
  if (eventType === "tool_policy_resolved") {
    const allowedToolNames = Array.isArray(payload.allowed_tool_names) ? payload.allowed_tool_names : [];
    return `- ${seqLabel} tool_policy_resolved; allowed_tools=${allowedToolNames.length}`;
  }
  if (eventType === "tool_call_started" || eventType === "tool_call_finished") {
    const toolName = readString(payload.tool_name, 120) ?? "unknown_tool";
    const target = readToolTarget(payload, toolName);
    const status = readString(payload.status, 60);
    const exitCode = readNumber(payload.exit_code ?? readRecord(payload, "details")?.exit_code);
    const errorCode = readString(payload.error_code, 100);
    const diagnostic = readString(payload.top_diagnostic_summary, 180);
    const failure = readString(readRecord(payload, "failure_semantics")?.summary, 180);
    const parts = [
      status ? `status=${status}` : null,
      target ? `target=${target}` : null,
      typeof exitCode === "number" ? `exit=${exitCode}` : null,
      errorCode ? `error_code=${errorCode}` : null,
      diagnostic ? `diagnostic=${diagnostic}` : null,
      failure ? `failure=${failure}` : null,
    ].filter(Boolean);
    return `- ${seqLabel} ${eventType}; tool=${toolName}${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`;
  }
  if (eventType === "runtime_diagnostics_detected") {
    const toolName = readString(payload.tool_name, 120);
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    const firstDiagnostic = asRecord(diagnostics[0]);
    const diagnostic = readString(
      firstDiagnostic
        ? [firstDiagnostic.file, firstDiagnostic.line, firstDiagnostic.code, firstDiagnostic.message]
            .filter(Boolean)
            .join(":")
        : readRecord(payload, "failure_semantics")?.summary,
      220,
    );
    return `- ${seqLabel} runtime_diagnostics_detected${toolName ? `; tool=${toolName}` : ""}${diagnostic ? `; diagnostic=${diagnostic}` : ""}`;
  }
  if (eventType === "agent_loop_stopped") {
    const parts = [
      readString(payload.status, 60) ? `status=${readString(payload.status, 60)}` : null,
      readString(payload.stop_reason, 100) ? `reason=${readString(payload.stop_reason, 100)}` : null,
      typeof readNumber(payload.step_count) === "number" ? `steps=${readNumber(payload.step_count)}` : null,
      readString(payload.error_code, 100) ? `error_code=${readString(payload.error_code, 100)}` : null,
    ].filter(Boolean);
    return `- ${seqLabel} agent_loop_stopped${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`;
  }
  if (eventType === "agent_loop_internal_error") {
    const message = readString(payload.error_message, 180);
    const name = readString(payload.error_name, 100);
    return `- ${seqLabel} agent_loop_internal_error${name ? `; name=${name}` : ""}${message ? `; message=${message}` : ""}`;
  }
  if (eventType === "run_finished") {
    const parts = [
      readString(payload.status, 60) ? `status=${readString(payload.status, 60)}` : null,
      readString(payload.reason, 100) ? `reason=${readString(payload.reason, 100)}` : null,
      readString(payload.error_code, 100) ? `error_code=${readString(payload.error_code, 100)}` : null,
    ].filter(Boolean);
    return `- ${seqLabel} run_finished${parts.length > 0 ? `; ${parts.join("; ")}` : ""}`;
  }
  if (eventType.endsWith("_resolved")) {
    return `- ${seqLabel} ${eventType}`;
  }
  return null;
}

export function buildActionLedgerPromptFromRuntimeRunEvents(params: {
  events?: Array<RuntimeContextRunEvent | null | undefined> | null;
  limit?: number | null;
}): string | null {
  const limit = Math.max(1, Math.min(30, Math.floor(params.limit ?? 16)));
  const lines = sortRuntimeContextRunEvents(params.events)
    .map(buildActionLedgerLine)
    .filter((line): line is string => Boolean(line))
    .slice(-limit);
  if (lines.length === 0) return null;
  return [
    "ACTION_LEDGER",
    "Deterministic projection from runtimeRunEvents:",
    ...lines,
    "Use this as operational continuity from prior tool and runtime events. It is a compact projection, not the raw transcript.",
  ].join("\n");
}

export function buildRuntimeContextFragmentsFromParts(params: {
  latestUserText?: string | null;
  runtimeTurnEnvelope?: RuntimeTurnEnvelopeV1 | null;
  projectContext?: RuntimeProjectContextPrompt | null;
  threadWorkingState?: ThreadWorkingStatePrompt | null;
  activeBackgroundTerminals?: RuntimeWorkspaceTerminalPrompt[] | null;
  recentBackgroundProcessEvents?: Array<{
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
  }> | null;
  recentToolAttempts?: Array<{
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
  }> | null;
  runtimeRunEvents?: Array<RuntimeContextRunEvent | null | undefined> | null;
  runtimeStop?: RuntimeContextStopFragmentInput | null;
}): RuntimeContextFragmentV1[] {
  const fragments = [
    createRuntimeContextFragment({
      id: "runtime_turn_envelope:v1",
      kind: "turn_envelope",
      source: "runtime_turn_envelope",
      ordinal: 10,
      priority: "critical",
      title: "Runtime turn envelope",
      body: renderRuntimeTurnEnvelopeForPrompt(params.runtimeTurnEnvelope),
      maxChars: 1_600,
    }),
    createRuntimeContextFragment({
      id: "project_context:v1",
      kind: "project_context",
      source: "cloud_project",
      ordinal: 15,
      priority: "high",
      title: "Project context",
      body: renderProjectContextForPrompt(params.projectContext),
      maxChars: 5_000,
    }),
    createRuntimeContextFragment({
      id: "thread_working_state:v1",
      kind: "working_state",
      source: "thread_working_state",
      ordinal: 20,
      priority: "high",
      title: "Thread working state",
      body: buildWorkingStatePrompt(params.threadWorkingState),
      maxChars: 2_800,
    }),
    createRuntimeContextFragment({
      id: "runtime_action_ledger:v1",
      kind: "action_ledger",
      source: "runtime_run_events",
      ordinal: 30,
      priority: "high",
      title: "Runtime action ledger",
      body: buildActionLedgerPromptFromRuntimeRunEvents({
        events: params.runtimeRunEvents,
      }),
      maxChars: 2_800,
    }),
    createRuntimeContextFragment({
      id: "active_terminals:v1",
      kind: "active_terminals",
      source: "workspace_terminals",
      ordinal: 40,
      priority: "high",
      title: "Active workspace terminals",
      body: buildActiveTerminalsPrompt(params.activeBackgroundTerminals ?? []),
      maxChars: 2_800,
    }),
    createRuntimeContextFragment({
      id: "recent_background_process_events:v1",
      kind: "recent_background_process_events",
      source: "workspace_terminals",
      ordinal: 50,
      priority: "normal",
      title: "Recent background process events",
      body: buildRecentBackgroundProcessEventsPrompt(params.recentBackgroundProcessEvents ?? []),
      maxChars: 1_800,
    }),
    createRuntimeContextFragment({
      id: "recent_tool_attempts:v1",
      kind: "recent_tool_attempts",
      source: "runtime_run_events",
      ordinal: 60,
      priority: "high",
      title: "Recent tool attempts",
      body: buildRecentToolAttemptsPrompt(params.recentToolAttempts ?? []),
      maxChars: 2_800,
    }),
    createRuntimeContextFragment({
      id: "runtime_stop:v1",
      kind: "runtime_stop",
      source: "runtime_run_events",
      ordinal: 70,
      priority: "critical",
      title: "Runtime stop",
      body: buildRuntimeStopPrompt({
        latestUserText: params.latestUserText,
        runtimeStop: params.runtimeStop,
      }),
      maxChars: 1_200,
    }),
  ].filter((fragment): fragment is RuntimeContextFragmentV1 => Boolean(fragment));
  return sortRuntimeContextFragments(fragments);
}

const fragmentKindOrder: RuntimeContextFragmentKind[] = [
  "turn_envelope",
  "project_context",
  "working_state",
  "action_ledger",
  "active_terminals",
  "recent_background_process_events",
  "recent_tool_attempts",
  "runtime_stop",
];

export function sortRuntimeContextFragments(
  fragments: Array<RuntimeContextFragmentV1 | null | undefined> | null | undefined,
): RuntimeContextFragmentV1[] {
  return (Array.isArray(fragments) ? fragments : [])
    .filter(
      (fragment): fragment is RuntimeContextFragmentV1 =>
        Boolean(fragment?.version === 1 && fragment.body),
    )
    .slice()
    .sort((a, b) => {
      if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
      const kindDelta = fragmentKindOrder.indexOf(a.kind) - fragmentKindOrder.indexOf(b.kind);
      if (kindDelta !== 0) return kindDelta;
      return a.id.localeCompare(b.id);
    });
}

function renderPriorityOrder(priority: RuntimeContextFragmentPriority): number {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

export function renderRuntimeContextFragmentsForPrompt(
  fragments: Array<RuntimeContextFragmentV1 | null | undefined> | null | undefined,
  options?: { maxChars?: number | null },
): string | null {
  const sorted = sortRuntimeContextFragments(fragments);
  if (sorted.length === 0) return null;
  const maxChars = Math.max(
    1,
    Math.floor(options?.maxChars ?? RUNTIME_CONTEXT_FRAGMENT_RENDER_BUDGET_CHARS),
  );
  const full = joinPromptBlocks(sorted.map((fragment) => fragment.body));
  if (full.length <= maxChars) return full;

  const selected = new Map<string, string>();
  let used = 0;
  const byRenderPriority = sorted
    .slice()
    .sort((a, b) => renderPriorityOrder(a.priority) - renderPriorityOrder(b.priority) || a.ordinal - b.ordinal);
  for (const fragment of byRenderPriority) {
    const separatorCost = selected.size > 0 ? 2 : 0;
    const remaining = maxChars - used - separatorCost;
    if (remaining <= 0) continue;
    const bounded = truncateBlock(fragment.body, remaining);
    if (!bounded.body) continue;
    selected.set(fragment.id, bounded.body);
    used += separatorCost + bounded.body.length;
  }
  const rendered = joinPromptBlocks(
    sorted.map((fragment) => selected.get(fragment.id) ?? null),
  );
  return rendered || null;
}

export function compactRuntimeContextFragmentsForSnapshot(
  fragments: Array<RuntimeContextFragmentV1 | null | undefined> | null | undefined,
): RuntimeContextFragmentV1[] {
  return sortRuntimeContextFragments(fragments)
    .slice(0, 12)
    .map((fragment) => {
      const compact = createRuntimeContextFragment({
        id: fragment.id,
        kind: fragment.kind,
        source: fragment.source,
        ordinal: fragment.ordinal,
        priority: fragment.priority,
        title: fragment.title,
        body: fragment.body,
        maxChars: Math.min(fragment.budget.maxChars, 1_200),
        createdAt: fragment.createdAt,
      });
      if (!compact) return null;
      const rules = Array.from(
        new Set([
          ...fragment.redaction.rules,
          ...compact.redaction.rules,
        ]),
      );
      return {
        ...compact,
        redaction: {
          applied: fragment.redaction.applied || compact.redaction.applied,
          rules,
        },
      };
    })
    .filter((fragment): fragment is RuntimeContextFragmentV1 => Boolean(fragment));
}
