import { internal } from "./_generated/api";
import { DAYTONA_WORKSPACE_ROOT } from "./daytonaSandboxClient";
import type { WorkspaceSandboxSession } from "./daytonaWorkspaceSession";
import {
  createDaytonaProcessSession,
  deleteDaytonaProcessSession,
  executeDaytonaProcessSessionCommand,
  findDaytonaProcessSessionCommand,
  getDaytonaProcessSession,
  getDaytonaProcessSessionCommandLogs,
  readDaytonaProcessSessionCommandExitCode,
} from "./daytonaProcessSessions";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";
import { uploadDaytonaToolboxFile } from "./daytonaToolboxFileSystem";
import { resolveCodexChatgptAuthTokens } from "./chatgptAuth";
import { hashCodexHarnessBridgeToken } from "./codexHarnessDynamicToolBridge";
import type { createPolyNetExecutionSession } from "./runtimeExecutionSession";
import type { RetrievalToolName } from "../shared/retrievalTools";
import {
  CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
  buildCodexHarnessDynamicToolSpecs,
  buildCodexHarnessDynamicToolSurfaceFingerprint,
  buildCodexHarnessMountedMcpDynamicToolSpecs,
  type CodexHarnessDynamicToolSpec,
} from "../shared/codexHarnessDynamicTools.ts";
import {
  classifyCodexHarnessReadiness,
  isCodexHarnessExecutorEnabled,
  isCodexHarnessExperimentEnabled,
  isCodexHarnessReadinessReady,
  resolveCodexHarnessExecutorDecision,
  resolveCodexHarnessProbeMode,
  resolveCodexHarnessRoute,
  type CodexHarnessProbeMode,
  type CodexHarnessReadinessStatus,
} from "../shared/codexHarnessRoute.ts";
import {
  CODEX_HARNESS_PROBE_RESULT_MARKER,
  buildCodexHarnessProbeScript,
} from "../shared/codexHarnessProbeScript.ts";
import {
  createCodexHarnessProbeStreamEventIncrementalParser,
  readCodexHarnessNextLogChunk,
  readCodexHarnessProbeStreamEvents,
  type CodexHarnessProbeStreamEvent,
} from "../shared/codexHarnessStreamEvents.ts";
import {
  CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS,
  type PreparedRuntimeAgentTurn,
  type RuntimeAgentHarness,
  type RuntimeAgentHarnessResult,
} from "../shared/runtimeAgentHarness.ts";
import type { NativeToolAwareMessage } from "../shared/nativeToolProtocol";
import type { RuntimeKernelStepRecord } from "../shared/runtimeKernelTypes";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};
type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";

type RuntimeRunEventAppender = (params: {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

type CodexHarnessProbeExecutionSession = ReturnType<typeof createPolyNetExecutionSession>;

function shellQuote(value: string): string {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore env read failures
  }
  return "";
}

function trimTrailingSlash(value: string): string {
  return String(value ?? "").replace(/\/+$/, "");
}

function resolveCodexHarnessDynamicToolBridgeUrl(): string {
  const explicit = readEnv("POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_URL");
  if (explicit) return explicit;
  const siteUrl =
    readEnv("CONVEX_SITE_URL") ||
    readEnv("VITE_CONVEX_SITE_URL") ||
    readEnv("PUBLIC_CONVEX_SITE_URL");
  return siteUrl
    ? `${trimTrailingSlash(siteUrl)}${CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE}`
    : "";
}

function createCodexHarnessBridgeToken(): string {
  return [
    "pnt_cdx",
    crypto.randomUUID().replace(/-/g, ""),
    crypto.randomUUID().replace(/-/g, ""),
  ].join("_");
}

function safeCodexHarnessProbeId(runId: string): string {
  const normalized = String(runId ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || crypto.randomUUID().replace(/-/g, "");
}

function buildCodexHarnessThreadHomePath(params: {
  userId: string;
  threadId?: string | null;
  projectId?: string | null;
}): string {
  const safeId = safeCodexHarnessProbeId(
    [
      "codex-thread",
      params.userId,
      params.threadId ?? "threadless",
      params.projectId ?? "projectless",
    ].join("-"),
  );
  return `${DAYTONA_WORKSPACE_ROOT}/.polynet/codex-harness/threads/${safeId}`;
}

const CODEX_SHADOW_USER_PROMPT_MAX_CHARS = 12000;
const CODEX_PRIMARY_RUNTIME_PROMPT_MAX_CHARS = 30000;
const CODEX_PRIMARY_RUNTIME_MODEL = "gpt-5.3-codex-spark";

function readLatestUserMessageTextForCodexShadow(messages: readonly InferenceMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  const content = String(latest?.content ?? "").trim();
  if (!content) return "";
  return content.slice(0, CODEX_SHADOW_USER_PROMPT_MAX_CHARS);
}

function nativeMessageContentToText(content: NativeToolAwareMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "text") return part.text;
      if (part.type === "image") return `[image: ${part.imageUrl}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildCodexPrimaryRuntimeInstructions(params: {
  turn: PreparedRuntimeAgentTurn;
  dynamicToolSpecs: readonly CodexHarnessDynamicToolSpec[];
}): string {
  const { turn } = params;
  const systemMessages = turn.nativeTranscript
    .filter((message): message is Extract<NativeToolAwareMessage, { role: "system" }> => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const dynamicToolNames = params.dynamicToolSpecs.map((tool) => tool.name);
  const canaryRequiresDynamicTools =
    turn.codexPrimaryCanary.forcePolyNetReadOnlyDynamicTools &&
    dynamicToolNames.includes("get_active_community_context") &&
    dynamicToolNames.includes("community_search");
  return [
    "You are the Codex app-server runtime embedded inside PolyNet.",
    "Use Codex native workspace tools when the latest user turn requires file inspection, shell execution, or workspace edits.",
    "Your filesystem authority is limited to the active Daytona workspace. Do not access secrets, credentials, or paths outside the workspace.",
    "Network access is disabled for Codex native workspace tools in this adapter slice. PolyNet platform tools, when listed, are executed only through PolyNet's dynamic bridge.",
    "Use the provided PolyNet context, conversation transcript, community lens, apps, and skills as operating context. PolyNet still owns permissions, memory, identity, billing, and community context.",
    turn.codexMcpProjection
      ? [
          "PolyNet MCP projection descriptor:",
          `version: ${turn.codexMcpProjection.version}`,
          `fingerprint: ${turn.codexMcpProjection.fingerprint}`,
          `eligible_read_only_tool_count: ${turn.codexMcpProjection.eligibleToolCount}`,
          `blocked_tool_count: ${turn.codexMcpProjection.blockedToolCount}`,
          `server_count: ${turn.codexMcpProjection.serverCount}`,
          `eligible_runtime_tool_names: ${turn.codexMcpProjection.eligibleRuntimeToolNames.join(", ") || "none"}`,
          "Use native Codex workspace tools for workspace work. Use listed PolyNet dynamic tools for PolyNet platform/community access and eligible read-only MCP app tools.",
        ].join("\n")
      : null,
    dynamicToolNames.length > 0
      ? `Available PolyNet read-only dynamic tools: ${dynamicToolNames.join(", ")}. Use community tools when active community profile or memory/search evidence is relevant. Use mounted MCP app tools when the user's connected app data is relevant.`
      : null,
    canaryRequiresDynamicTools
      ? [
          "Codex primary canary requirement:",
          "Before producing the final answer, call get_active_community_context with empty arguments.",
          `Then call community_search with query ${JSON.stringify(turn.codexPrimaryCanary.searchQuery ?? "codex primary dynamic bridge canary")}.`,
          "In the final answer, state whether both PolyNet read-only dynamic tools returned usable evidence.",
        ].join("\n")
      : null,
    "When you use tools, keep the final answer concise and mention the concrete command or file action that mattered.",
    ...systemMessages,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
}

function buildCodexPrimaryRuntimePrompt(turn: PreparedRuntimeAgentTurn): string {
  const conversationLines = turn.nativeTranscript
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return `Tool observation (${message.tool_call_id}): ${message.content}`;
      }
      const content = nativeMessageContentToText(message.content).trim();
      if (!content) return "";
      if (message.role === "assistant") return `Assistant: ${content}`;
      return `User: ${content}`;
    })
    .filter(Boolean);
  const prompt = [
    "PolyNet runtime turn context:",
    `run_id: ${turn.runId}`,
    `thread_id: ${turn.threadId ?? "none"}`,
    `project_id: ${turn.projectId ?? "none"}`,
    `community_id: ${turn.communityId ?? "none"}`,
    `requested_model_id: ${turn.requestedModelId}`,
    `active_tool_names: ${turn.activeToolNames.join(", ") || "none"}`,
    "",
    "Conversation transcript:",
    ...conversationLines,
    "",
    turn.codexPrimaryCanary.forcePolyNetReadOnlyDynamicTools
      ? [
          "Codex primary canary:",
          "This is a one-turn staging canary. Use the PolyNet read-only dynamic tools before answering:",
          "1. get_active_community_context({})",
          `2. community_search({"query": ${JSON.stringify(turn.codexPrimaryCanary.searchQuery ?? "codex primary dynamic bridge canary")}})`,
          "Then answer the latest user turn briefly.",
          "",
        ].join("\n")
      : null,
    "Produce the assistant answer for the latest user turn.",
  ].filter((part): part is string => part !== null).join("\n");
  if (prompt.length <= CODEX_PRIMARY_RUNTIME_PROMPT_MAX_CHARS) return prompt;
  return prompt.slice(prompt.length - CODEX_PRIMARY_RUNTIME_PROMPT_MAX_CHARS);
}

function buildCodexRuntimeHarnessFailure(params: {
  turn: PreparedRuntimeAgentTurn;
  status: number;
  code: string;
  message: string;
}): RuntimeAgentHarnessResult {
  return {
    ok: false,
    status: params.status,
    code: params.code,
    stopReason: "model_error",
    message: params.message,
    promptTokens: null,
    completionTokens: null,
    transcript: [...params.turn.nativeTranscript],
    stepCount: 0,
    steps: [],
  };
}

function buildCodexRuntimeHarnessSuccess(params: {
  turn: PreparedRuntimeAgentTurn;
  assistantText: string;
  steps?: RuntimeKernelStepRecord<string>[];
}): RuntimeAgentHarnessResult {
  const steps = params.steps ?? [];
  return {
    ok: true,
    assistantText: params.assistantText,
    promptTokens: null,
    completionTokens: null,
    transcript: [
      ...params.turn.nativeTranscript,
      {
        role: "assistant",
        content: params.assistantText,
      },
    ],
    stepCount: steps.length,
    steps,
    stopReason: "assistant_final",
  };
}

function sanitizeCodexHarnessProbeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeCodexHarnessProbeValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/token|authorization|secret|api[_-]?key|credential|email/i.test(key)) {
      out[key] = "<redacted>";
      continue;
    }
    out[key] = sanitizeCodexHarnessProbeValue(raw);
  }
  return out;
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readBooleanField(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)[key] === true;
}

function readNumberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRecordField(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function readRecordArrayField(value: unknown, key: string, limit: number): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .slice(0, Math.max(0, Math.floor(limit)));
}

function stringifyCodexHarnessValue(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? "");
  }
}

function readCodexNativeToolStepArguments(step: Record<string, unknown>): Record<string, unknown> {
  const rawArguments = readRecordField(step, "rawArguments") ?? readRecordField(step, "arguments");
  return rawArguments ? { ...rawArguments } : {};
}

function readCodexPrimaryNativeToolSteps(
  probeResult: Record<string, unknown> | null,
): RuntimeKernelStepRecord<string>[] {
  return readRecordArrayField(probeResult, "nativeToolSteps", 50).map((step, index) => {
    const providerCallId =
      readStringField(step, "id") ??
      readStringField(step, "providerCallId") ??
      `codex-native-tool-${index + 1}`;
    const toolName =
      readStringField(step, "toolName") ??
      readStringField(step, "tool_name") ??
      readStringField(step, "name") ??
      "codex_native_tool";
    const rawArguments = readCodexNativeToolStepArguments(step);
    const status = readStringField(step, "status");
    const completed = readBooleanField(step, "completed");
    const isError = status === "failed" || status === "blocked";
    const outputPreview = readStringField(step, "outputPreview");
    const outputSha256 = readStringField(step, "outputSha256");
    return {
      iteration: index + 1,
      providerCallId,
      toolName,
      rawArguments,
      normalizedArgs: rawArguments,
      toolSignature: `${toolName}:${stringifyCodexHarnessValue(rawArguments).slice(0, 1000)}`,
      repeatedCallCount: 0,
      ...(completed ? { toolResultStatus: isError ? "error" : "ok" } : {}),
      ...(isError ? { toolResultErrorCode: "codex_native_tool_error" } : {}),
      ...(outputSha256 ? { toolResultSignature: outputSha256 } : {}),
      ...(completed ? { madeProgress: !isError } : {}),
      ...(outputPreview ? { outputPreview } : {}),
      ...(status === "blocked" ? { blocked: true } : {}),
    };
  });
}

function readCodexHarnessProbeResult(outputText: string): Record<string, unknown> | null {
  const lines = String(outputText ?? "").split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = String(lines[index] ?? "").trim();
    if (!line.startsWith(CODEX_HARNESS_PROBE_RESULT_MARKER)) continue;
    const raw = line.slice(CODEX_HARNESS_PROBE_RESULT_MARKER.length).trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function summarizeCodexHarnessStreamEvents(
  events: readonly CodexHarnessProbeStreamEvent[],
): Record<string, unknown> {
  const countsByType: Record<string, number> = {};
  let assistantDeltaEvents = 0;
  let assistantDeltaChars = 0;
  let reasoningDeltaEvents = 0;
  let toolOutputDeltaEvents = 0;
  let toolOutputDeltaChars = 0;
  let firstStreamEventLatencyMs: number | null = null;
  let lastStreamEventLatencyMs: number | null = null;
  let firstAssistantDeltaLatencyMs: number | null = null;
  for (const event of events) {
    const type = readStringField(event, "type") ?? "unknown";
    countsByType[type] = (countsByType[type] ?? 0) + 1;
    const elapsedMs = readNumberField(event, "elapsed_ms");
    if (elapsedMs !== null) {
      if (firstStreamEventLatencyMs === null) {
        firstStreamEventLatencyMs = elapsedMs;
      }
      lastStreamEventLatencyMs = elapsedMs;
    }
    const deltaChars =
      readNumberField(event, "delta_chars") ??
      (typeof event.delta === "string" ? event.delta.length : 0);
    if (type === "assistant_delta") {
      assistantDeltaEvents += 1;
      assistantDeltaChars += deltaChars;
      if (firstAssistantDeltaLatencyMs === null && elapsedMs !== null) {
        firstAssistantDeltaLatencyMs = elapsedMs;
      }
    } else if (type === "reasoning_delta") {
      reasoningDeltaEvents += 1;
    } else if (type === "tool_output_delta") {
      toolOutputDeltaEvents += 1;
      toolOutputDeltaChars += deltaChars;
    }
  }
  return {
    captured_stream_events: events.length,
    counts_by_type: countsByType,
    assistant_delta_events: assistantDeltaEvents,
    assistant_delta_chars: assistantDeltaChars,
    first_stream_event_latency_ms: firstStreamEventLatencyMs,
    last_stream_event_latency_ms: lastStreamEventLatencyMs,
    first_assistant_delta_latency_ms: firstAssistantDeltaLatencyMs,
    reasoning_delta_events: reasoningDeltaEvents,
    tool_output_delta_events: toolOutputDeltaEvents,
    tool_output_delta_chars: toolOutputDeltaChars,
    raw_delta_storage_policy: "assistant_delta_live_only_audit_metadata_only",
  };
}

function sanitizeCodexHarnessStreamEventForAudit(
  event: CodexHarnessProbeStreamEvent,
  fallbackSequence: number,
): Record<string, unknown> {
  const rawDelta = typeof event.delta === "string" ? event.delta : "";
  return sanitizeCodexHarnessProbeValue({
    sequence: readNumberField(event, "sequence") ?? fallbackSequence,
    elapsed_ms: readNumberField(event, "elapsed_ms"),
    type: readStringField(event, "type") ?? "unknown",
    method: readStringField(event, "method"),
    tool_name: readStringField(event, "tool_name"),
    status: readStringField(event, "status"),
    thread_id_present: readBooleanField(event, "thread_id_present"),
    turn_id_present: readBooleanField(event, "turn_id_present"),
    item_id_present: readBooleanField(event, "item_id_present"),
    item_count: readNumberField(event, "item_count"),
    delta_chars: readNumberField(event, "delta_chars") ?? (rawDelta ? rawDelta.length : null),
    raw_delta_present: rawDelta.length > 0,
  }) as Record<string, unknown>;
}

async function emitCodexHarnessStreamEventAudit(params: {
  appendRunEvent: RuntimeRunEventAppender;
  runId: string;
  source: string;
  events: readonly CodexHarnessProbeStreamEvent[];
}): Promise<void> {
  if (params.events.length === 0) return;
  await emitCodexHarnessProbeEvent({
    appendRunEvent: params.appendRunEvent,
    runId: params.runId,
    eventType: "codex_harness_stream_event_summary",
    eventKeySuffix: `${params.source}_1`,
    payload: {
      source: params.source,
      ...summarizeCodexHarnessStreamEvents(params.events),
    },
  });
  for (const [index, event] of params.events.slice(0, 40).entries()) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_stream_event",
      eventKeySuffix: `${params.source}_${index + 1}`,
      payload: {
        source: params.source,
        ...sanitizeCodexHarnessStreamEventForAudit(event, index + 1),
      },
    });
  }
}

const CODEX_HARNESS_STREAMING_COMMAND_STDOUT_MAX_CHARS = 2_000_000;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
}

function tailText(value: string, maxChars: number): string {
  const normalized = String(value ?? "");
  const max = Math.max(1, Math.floor(maxChars));
  if (normalized.length <= max) return normalized;
  return normalized.slice(normalized.length - max);
}

function wrapCodexHarnessProcessSessionCommand(command: string): string {
  return `sh -lc ${shellQuote(command)}`;
}

function buildCodexHarnessStreamEventDedupeKey(
  event: CodexHarnessProbeStreamEvent,
  fallbackSequence: number,
): string {
  const sequence = readNumberField(event, "sequence");
  if (sequence !== null) return `sequence:${sequence}`;
  return [
    "fallback",
    fallbackSequence,
    readStringField(event, "type") ?? "unknown",
    readStringField(event, "method") ?? "unknown",
    readNumberField(event, "elapsed_ms") ?? "elapsed_unknown",
    readNumberField(event, "delta_chars") ?? "delta_unknown",
  ].join(":");
}

async function executeCodexHarnessStreamingCommand(params: {
  session: WorkspaceSandboxSession;
  runId: string;
  command: string;
  cwd: string;
  timeoutSeconds: number;
  onStreamEvent?: (event: CodexHarnessProbeStreamEvent) => Promise<void> | void;
}): Promise<
  | {
      ok: true;
      stdout: string;
      exitCode: number;
      commandId: string;
      processSessionId: string;
      streamEventCount: number;
      firstStreamEventLatencyMs: number | null;
      lastStreamEventLatencyMs: number | null;
      logPollCount: number;
      malformedStreamEventLineCount: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const processSessionId = `codex-stream-${safeCodexHarnessProbeId(params.runId)}-${crypto.randomUUID().replace(/-/g, "")}`;
  const created = await createDaytonaProcessSession({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: processSessionId,
  });
  if (created.ok !== true) return created;

  const parser = createCodexHarnessProbeStreamEventIncrementalParser({
    eventLimit: 5000,
  });
  const seenStreamEventKeys = new Set<string>();
  const startedAt = Date.now();
  const timeoutMs = Math.max(1, Math.floor(params.timeoutSeconds)) * 1000;
  const deadlineMs = startedAt + timeoutMs;
  let stdoutText = "";
  let previousLogText = "";
  let commandId = "";
  let streamEventCount = 0;
  let firstStreamEventLatencyMs: number | null = null;
  let lastStreamEventLatencyMs: number | null = null;
  let logPollCount = 0;

  const emitParsedStreamEvents = async (
    parsedEvents: readonly CodexHarnessProbeStreamEvent[],
  ): Promise<void> => {
    for (const event of parsedEvents) {
      const eventKey = buildCodexHarnessStreamEventDedupeKey(event, streamEventCount + 1);
      if (seenStreamEventKeys.has(eventKey)) continue;
      seenStreamEventKeys.add(eventKey);
      streamEventCount += 1;
      const elapsed =
        readNumberField(event, "elapsed_ms") ?? Math.max(0, Date.now() - startedAt);
      if (firstStreamEventLatencyMs === null) {
        firstStreamEventLatencyMs = elapsed;
      }
      lastStreamEventLatencyMs = elapsed;
      await params.onStreamEvent?.(event);
    }
  };

  const processStdout = async (nextStdout: string, flush: boolean): Promise<void> => {
    const normalized = String(nextStdout ?? "");
    const { chunk, strategy } = readCodexHarnessNextLogChunk({
      previousLogText,
      nextLogText: normalized,
    });
    if (strategy === "reset" && previousLogText) {
      await flushBufferedStreamEvents();
    }
    previousLogText = normalized;
    stdoutText = tailText(normalized, CODEX_HARNESS_STREAMING_COMMAND_STDOUT_MAX_CHARS);
    const parsedEvents = parser.push(chunk, { flush });
    await emitParsedStreamEvents(parsedEvents);
  };

  const flushBufferedStreamEvents = async (): Promise<void> => {
    await emitParsedStreamEvents(parser.push("", { flush: true }));
  };

  try {
    const executed = await executeDaytonaProcessSessionCommand({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      sessionId: created.sessionId,
      command: wrapCodexHarnessProcessSessionCommand(params.command),
      cwd: params.cwd,
      runAsync: true,
    });
    if (executed.ok !== true) return executed;
    commandId = executed.commandId;
    await processStdout(executed.outputText, false);

    while (Date.now() < deadlineMs) {
      const logs = await getDaytonaProcessSessionCommandLogs({
        config: params.session.config,
        toolboxProxyUrl: params.session.toolboxProxyUrl,
        sandboxId: params.session.providerSandboxId,
        sessionId: created.sessionId,
        commandId,
      });
      if (logs.ok !== true) {
        return {
          ok: false,
          status: logs.status,
          code: logs.code,
          message: logs.message,
          details: {
            ...(logs.details ?? {}),
            process_session_id_present: Boolean(created.sessionId),
            command_id_present: Boolean(commandId),
            stream_event_count: streamEventCount,
            stdout_chars: stdoutText.length,
          },
        };
      }
      logPollCount += 1;
      await processStdout(logs.stdout || logs.output, false);

      const processSession = await getDaytonaProcessSession({
        config: params.session.config,
        toolboxProxyUrl: params.session.toolboxProxyUrl,
        sandboxId: params.session.providerSandboxId,
        sessionId: created.sessionId,
      });
      if (processSession.ok !== true) {
        return {
          ok: false,
          status: processSession.status,
          code: processSession.code,
          message: processSession.message,
          details: {
            ...(processSession.details ?? {}),
            process_session_id_present: Boolean(created.sessionId),
            command_id_present: Boolean(commandId),
            stream_event_count: streamEventCount,
            stdout_chars: stdoutText.length,
          },
        };
      }
      const command = findDaytonaProcessSessionCommand(processSession.session, commandId);
      if (!command) {
        return {
          ok: false,
          status: 503,
          code: "codex_streaming_command_missing",
          message: "Daytona process session no longer lists the Codex streaming command.",
          details: {
            process_session_id_present: Boolean(created.sessionId),
            command_id_present: Boolean(commandId),
            stream_event_count: streamEventCount,
            stdout_chars: stdoutText.length,
          },
        };
      }
      const exitCode = readDaytonaProcessSessionCommandExitCode(command);
      if (exitCode !== null) {
        const finalLogs = await getDaytonaProcessSessionCommandLogs({
          config: params.session.config,
          toolboxProxyUrl: params.session.toolboxProxyUrl,
          sandboxId: params.session.providerSandboxId,
          sessionId: created.sessionId,
          commandId,
        });
        if (finalLogs.ok === true) {
          logPollCount += 1;
          await processStdout(finalLogs.stdout || finalLogs.output, true);
        } else {
          await flushBufferedStreamEvents();
        }
        return {
          ok: true,
          stdout: stdoutText,
          exitCode,
          commandId,
          processSessionId: created.sessionId,
          streamEventCount,
          firstStreamEventLatencyMs,
          lastStreamEventLatencyMs,
          logPollCount,
          malformedStreamEventLineCount: parser.getMalformedLineCount(),
        };
      }
      await sleepMs(500);
    }

    await flushBufferedStreamEvents();
    return {
      ok: false,
      status: 504,
      code: "codex_streaming_command_timeout",
      message: `Codex streaming command timed out after ${Math.floor(timeoutMs / 1000)}s.`,
      details: {
        process_session_id_present: Boolean(created.sessionId),
        command_id_present: Boolean(commandId),
        stream_event_count: streamEventCount,
        first_stream_event_latency_ms: firstStreamEventLatencyMs,
        last_stream_event_latency_ms: lastStreamEventLatencyMs,
        log_poll_count: logPollCount,
        malformed_stream_event_line_count: parser.getMalformedLineCount(),
        stdout_chars: stdoutText.length,
      },
    };
  } finally {
    try {
      await deleteDaytonaProcessSession({
        config: params.session.config,
        toolboxProxyUrl: params.session.toolboxProxyUrl,
        sandboxId: params.session.providerSandboxId,
        sessionId: created.sessionId,
      });
    } catch {
      // Best-effort cleanup; Daytona process sessions are not product truth.
    }
  }
}

async function emitCodexHarnessProbeEvent(params: {
  appendRunEvent: RuntimeRunEventAppender;
  runId: string;
  eventType: string;
  eventKeySuffix: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await params.appendRunEvent({
    eventType: params.eventType,
    eventKey: `${params.runId}:${params.eventType}:${params.eventKeySuffix}`,
    payload: sanitizeCodexHarnessProbeValue({
      run_id: params.runId,
      ...params.payload,
    }) as Record<string, unknown>,
  });
}

async function emitCodexHarnessReadinessEvent(params: {
  appendRunEvent: RuntimeRunEventAppender;
  runId: string;
  probeMode: CodexHarnessProbeMode;
  status: CodexHarnessReadinessStatus;
  code?: string | null;
  message?: string | null;
  stage?: string | null;
  latencyMs?: number | null;
  evidence?: Record<string, unknown>;
}): Promise<void> {
  await params.appendRunEvent({
    eventType: "codex_harness_readiness",
    eventKey: `${params.runId}:codex_harness_readiness:${params.probeMode}`,
    payload: sanitizeCodexHarnessProbeValue({
      run_id: params.runId,
      probe_mode: params.probeMode,
      status: params.status,
      ready: isCodexHarnessReadinessReady(params.status),
      code: params.code ?? null,
      message: params.message ?? null,
      stage: params.stage ?? null,
      latency_ms: params.latencyMs ?? null,
      ...(params.evidence ?? {}),
    }) as Record<string, unknown>,
  });
}

async function revokeCodexHarnessBridgeSessionBestEffort(params: {
  ctx: any;
  bridgeSessionId: string;
  revokedReason: string;
}): Promise<void> {
  const bridgeSessionId = String(params.bridgeSessionId ?? "").trim();
  if (!bridgeSessionId) return;
  try {
    await params.ctx.runMutation(
      (internal as any).codexHarnessDynamicToolBridge
        .revokeCodexHarnessBridgeSessionInternal,
      {
        bridgeSessionId,
        revokedReason: params.revokedReason,
        nowMs: Date.now(),
      },
    );
  } catch {
    // Best-effort cleanup; expiry still limits the bridge session.
  }
}

async function releaseCodexHarnessThreadBindingLockBestEffort(params: {
  ctx: any;
  bindingKey: string;
  runId: string;
}): Promise<Record<string, unknown> | null> {
  const bindingKey = String(params.bindingKey ?? "").trim();
  const runId = String(params.runId ?? "").trim();
  if (!bindingKey || !runId) return null;
  try {
    return (await params.ctx.runMutation(
      (internal as any).codexHarnessThreadBindings
        .releaseCodexHarnessThreadBindingLockInternal,
      {
        bindingKey,
        runId,
        nowMs: Date.now(),
      },
    )) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function cleanupCodexHarnessProbeFilesBestEffort(params: {
  session: WorkspaceSandboxSession;
  authPath: string;
  scriptPath: string;
  shadowPromptPath?: string | null;
  extraPaths?: string[];
}): Promise<void> {
  try {
    const extraPaths = [
      params.shadowPromptPath,
      ...(params.extraPaths ?? []),
    ]
      .filter((path): path is string => Boolean(path))
      .map((path) => ` ${shellQuote(path)}`)
      .join("");
    await executeDaytonaCommand({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      command: `rm -f ${shellQuote(params.authPath)} ${shellQuote(params.scriptPath)}${extraPaths}`,
      timeoutSeconds: 10,
      allowNonZero: true,
    });
  } catch {
    // Best-effort cleanup; the auth file contains only a short-lived access token.
  }
}

export function buildCodexAppServerRuntimeAgentHarness(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  runId: string;
  projectId?: string | null;
  preparedTurn: PreparedRuntimeAgentTurn;
  executionSession: CodexHarnessProbeExecutionSession;
  appendRunEvent: RuntimeRunEventAppender;
  emitLiveAssistantDelta?: (delta: string) => Promise<boolean> | boolean;
}): RuntimeAgentHarness {
  return {
    ...CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS,
    execute: async () => {
      const startedAt = Date.now();
      const turn = params.preparedTurn;
      const requestedPlatformDynamicToolSpecs = buildCodexHarnessDynamicToolSpecs(
        turn.fixedAllowedToolNames,
      );
      const requestedMountedMcpDynamicToolSpecs =
        buildCodexHarnessMountedMcpDynamicToolSpecs({
          mountedTools: params.executionSession.getMountedTools(),
          eligibleRuntimeToolNames:
            turn.codexMcpProjection?.eligibleRuntimeToolNames ?? [],
        });
      const requestedDynamicToolSpecs = [
        ...requestedPlatformDynamicToolSpecs,
        ...requestedMountedMcpDynamicToolSpecs,
      ];
      const dynamicToolBridgeUrl = resolveCodexHarnessDynamicToolBridgeUrl();
      const activeDynamicToolSpecs = dynamicToolBridgeUrl
        ? requestedDynamicToolSpecs
        : [];
      const activeMountedMcpDynamicToolSpecs = dynamicToolBridgeUrl
        ? requestedMountedMcpDynamicToolSpecs
        : [];
      const codexDynamicToolSurface =
        await buildCodexHarnessDynamicToolSurfaceFingerprint({
          dynamicToolSpecs: activeDynamicToolSpecs,
          codexMcpProjection:
            activeMountedMcpDynamicToolSpecs.length > 0
              ? turn.codexMcpProjection
              : null,
        });
      const instructions = buildCodexPrimaryRuntimeInstructions({
        turn,
        dynamicToolSpecs: activeDynamicToolSpecs,
      });
      const runtimePrompt = buildCodexPrimaryRuntimePrompt(turn);
      await emitCodexHarnessProbeEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        eventType: "codex_harness_primary_started",
        eventKeySuffix: "1",
        payload: {
          status: "started",
          project_id: params.projectId ?? null,
          execution_placement: CODEX_APP_SERVER_RUNTIME_AGENT_HARNESS.executionPlacement,
          auth_bridge: "chatgpt_subscription",
          model: CODEX_PRIMARY_RUNTIME_MODEL,
          prompt_chars: runtimePrompt.length,
          instruction_chars: instructions.length,
          tool_projection: "codex_native_workspace_tools_v0",
          platform_tool_projection:
            activeDynamicToolSpecs.length > 0
              ? "polynet_readonly_dynamic_tools_v1"
              : "none",
          combined_tool_projection:
            activeDynamicToolSpecs.length > 0
              ? "codex_native_workspace_tools_v0_plus_polynet_readonly_dynamic_tools_v1"
              : "codex_native_workspace_tools_v0",
          codex_mcp_projection: turn.codexMcpProjection,
          codex_mcp_projection_execution:
            activeMountedMcpDynamicToolSpecs.length > 0
              ? "read_only_dynamic_bridge_v0"
              : "descriptor_only",
          codex_dynamic_tool_surface: codexDynamicToolSurface,
          dynamic_tool_bridge_configured: Boolean(dynamicToolBridgeUrl),
          dynamic_tool_requested_names: requestedDynamicToolSpecs.map((tool) => tool.name),
          dynamic_platform_tool_requested_names:
            requestedPlatformDynamicToolSpecs.map((tool) => tool.name),
          dynamic_mcp_tool_requested_names:
            requestedMountedMcpDynamicToolSpecs.map((tool) => tool.name),
          dynamic_tool_active_names: activeDynamicToolSpecs.map((tool) => tool.name),
          dynamic_mcp_tool_active_names:
            activeMountedMcpDynamicToolSpecs.map((tool) => tool.name),
          sandbox_policy: "workspace_write_no_network",
          approval_policy: "never",
        },
      });

      const auth = await resolveCodexChatgptAuthTokens({
        ctx: params.ctx,
        userId: params.userId,
      });
      if (!auth.ok) {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "auth_error",
          payload: {
            status: "error",
            code: auth.code,
            message: auth.message,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: auth.status,
          code: auth.code,
          message: auth.message,
        });
      }

      const workspace = await params.executionSession.ensureWorkspaceForTool({
        toolName: "codex_primary_harness",
      });
      if (!workspace.ok) {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "workspace_error",
          payload: {
            status: "error",
            code: workspace.code,
            message: workspace.message,
            details: (workspace as { details?: Record<string, unknown> | null }).details ?? null,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: workspace.status,
          code: workspace.code,
          message: workspace.message,
        });
      }

      const session = workspace.session;
      let bridgeSessionId = "";
      let bridgeSessionCreated = false;
      let bindingLockKey = "";
      let bindingLockAcquired = false;
      try {
      const safeId = safeCodexHarnessProbeId(`${params.runId}-primary`);
      const codexThreadHomePath = buildCodexHarnessThreadHomePath({
        userId: params.userId,
        threadId: turn.threadId,
        projectId: params.projectId,
      });
      const codexThreadBindingDecision = (await params.ctx.runQuery(
        (internal as any).codexHarnessThreadBindings
          .resolveCodexHarnessThreadBindingForTurnInternal,
        {
          userId: params.userId,
          threadId: turn.threadId ?? undefined,
          projectId: params.projectId ?? undefined,
          codexHomePath: codexThreadHomePath,
          codexMcpProjectionFingerprint:
            turn.codexMcpProjection?.fingerprint ?? undefined,
          codexDynamicToolSurfaceFingerprint:
            codexDynamicToolSurface.fingerprint,
        },
      )) as Record<string, unknown>;
      const bindingAction =
        readStringField(codexThreadBindingDecision, "action") ?? "disabled";
      const bindingReason =
        readStringField(codexThreadBindingDecision, "reason") ?? null;
      const resolvedBindingKey = readStringField(
        codexThreadBindingDecision,
        "bindingKey",
      );
      const bindingCodexHomePath =
        readStringField(codexThreadBindingDecision, "codexHomePath") ??
        codexThreadHomePath;
      const resumeCodexThreadId =
        bindingAction === "resume"
          ? readStringField(codexThreadBindingDecision, "codexThreadId") ?? ""
          : "";
      await emitCodexHarnessProbeEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        eventType: "codex_thread_binding_resolved",
        eventKeySuffix: "1",
        payload: {
          action: bindingAction,
          reason: bindingReason,
          binding_key_present: Boolean(
            readStringField(codexThreadBindingDecision, "bindingKey"),
          ),
          resume_thread_id_present: Boolean(resumeCodexThreadId),
          codex_home_persistent: Boolean(bindingCodexHomePath),
          projection_fingerprint:
            turn.codexMcpProjection?.fingerprint ?? null,
          projection_version: turn.codexMcpProjection?.version ?? null,
          dynamic_tool_surface_fingerprint:
            codexDynamicToolSurface.fingerprint,
          dynamic_tool_surface_version: codexDynamicToolSurface.version,
          previous_codex_thread_id_present: Boolean(
            readStringField(codexThreadBindingDecision, "previousCodexThreadId"),
          ),
          previous_dynamic_tool_surface_fingerprint_present: Boolean(
            readStringField(
              codexThreadBindingDecision,
              "previousCodexDynamicToolSurfaceFingerprint",
            ),
          ),
          duplicate_binding_count:
            readNumberField(codexThreadBindingDecision, "duplicateBindingCount") ?? 0,
        },
      });
      if (bindingAction === "rotate") {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_mcp_projection_fingerprint_changed",
          eventKeySuffix: "1",
          payload: {
            previous_fingerprint:
              readStringField(
                codexThreadBindingDecision,
                "previousCodexMcpProjectionFingerprint",
              ) ?? null,
            current_fingerprint:
              turn.codexMcpProjection?.fingerprint ?? null,
            dynamic_tool_surface_fingerprint:
              codexDynamicToolSurface.fingerprint,
            dynamic_tool_surface_version: codexDynamicToolSurface.version,
            previous_dynamic_tool_surface_fingerprint:
              readStringField(
                codexThreadBindingDecision,
                "previousCodexDynamicToolSurfaceFingerprint",
              ) ?? null,
            previous_codex_thread_id_present: Boolean(
              readStringField(codexThreadBindingDecision, "previousCodexThreadId"),
            ),
          },
        });
      }
      if (
        bindingAction !== "disabled" &&
        resolvedBindingKey &&
        turn.threadId &&
        params.projectId
      ) {
        bindingLockKey = resolvedBindingKey;
        const lockResult = (await params.ctx.runMutation(
          (internal as any).codexHarnessThreadBindings
            .acquireCodexHarnessThreadBindingLockInternal,
          {
            bindingKey: resolvedBindingKey,
            userId: params.userId,
            threadId: turn.threadId,
            projectId: params.projectId,
            runId: params.runId,
            nowMs: Date.now(),
            ttlMs: 5 * 60 * 1000,
          },
        )) as Record<string, unknown>;
        bindingLockAcquired = readBooleanField(lockResult, "acquired") === true;
        if (!bindingLockAcquired) {
          const blockingRunId = readStringField(lockResult, "blockingRunId");
          await emitCodexHarnessProbeEvent({
            appendRunEvent: params.appendRunEvent,
            runId: params.runId,
            eventType: "codex_thread_binding_lock_conflict",
            eventKeySuffix: "1",
            payload: {
              status: "blocked",
              code: "codex_thread_binding_locked",
              reason: readStringField(lockResult, "reason") ?? "binding_locked",
              binding_key_present: true,
              blocking_run_id_present: Boolean(blockingRunId),
              lock_expires_at: readNumberField(lockResult, "expiresAt"),
              duplicate_lock_count:
                readNumberField(lockResult, "duplicateLockCount") ?? 0,
            },
          });
          await emitCodexHarnessProbeEvent({
            appendRunEvent: params.appendRunEvent,
            runId: params.runId,
            eventType: "codex_harness_primary_completed",
            eventKeySuffix: "binding_lock_conflict",
            payload: {
              status: "error",
              code: "codex_thread_binding_locked",
              message: "Another Codex turn is already using this PolyNet thread/project binding.",
              binding_action: bindingAction,
              binding_key_present: true,
              blocking_run_id_present: Boolean(blockingRunId),
              lock_expires_at: readNumberField(lockResult, "expiresAt"),
              latency_ms: Date.now() - startedAt,
            },
          });
          return buildCodexRuntimeHarnessFailure({
            turn,
            status: 409,
            code: "codex_thread_binding_locked",
            message: "Another Codex turn is already using this PolyNet thread/project binding.",
          });
        }
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_thread_binding_lock_acquired",
          eventKeySuffix: "1",
          payload: {
            status: "ok",
            reason: readStringField(lockResult, "reason") ?? "lock_acquired",
            binding_key_present: true,
            lock_expires_at: readNumberField(lockResult, "expiresAt"),
            duplicate_lock_count:
              readNumberField(lockResult, "duplicateLockCount") ?? 0,
            repaired_duplicate_lock_count:
              readNumberField(lockResult, "repairedDuplicateLockCount") ?? 0,
          },
        });
      }
      bridgeSessionId =
        activeDynamicToolSpecs.length > 0
          ? `codex-bridge-${safeId}-${crypto.randomUUID().replace(/-/g, "")}`
          : "";
      const bridgeToken =
        activeDynamicToolSpecs.length > 0 ? createCodexHarnessBridgeToken() : "";
      if (activeDynamicToolSpecs.length > 0) {
        await params.ctx.runMutation(
          (internal as any).codexHarnessDynamicToolBridge
            .createCodexHarnessBridgeSessionInternal,
          {
            bridgeSessionId,
            tokenHash: await hashCodexHarnessBridgeToken(bridgeToken),
            userId: params.userId,
            authSubject: params.authSubject ?? undefined,
            runId: params.runId,
            threadId: turn.threadId ?? undefined,
            projectId: params.projectId ?? undefined,
            communityId: turn.communityId ?? undefined,
            allowedToolNames: activeDynamicToolSpecs.map((tool) => tool.name),
            expiresAt: Date.now() + 10 * 60 * 1000,
            nowMs: Date.now(),
          },
        );
        bridgeSessionCreated = true;
      }
      const authPath = `/tmp/polynet-codex-auth-${safeId}.json`;
      const bridgeConfigPath = activeDynamicToolSpecs.length > 0
        ? `/tmp/polynet-codex-bridge-${safeId}.json`
        : "";
      const scriptPath = `/tmp/polynet-codex-primary-${safeId}.mjs`;
      const promptPath = `/tmp/polynet-codex-primary-prompt-${safeId}.txt`;
      const instructionsPath = `/tmp/polynet-codex-primary-instructions-${safeId}.txt`;
      const authPayload = JSON.stringify({
        type: auth.auth.type,
        accessToken: auth.auth.accessToken,
        chatgptAccountId: auth.auth.chatgptAccountId,
        chatgptPlanType: auth.auth.chatgptPlanType,
      });
      const bridgeConfigPayload = activeDynamicToolSpecs.length > 0
        ? JSON.stringify({
            bridgeUrl: dynamicToolBridgeUrl,
            bridgeToken,
            bridgeSessionId,
            bridgeRunId: params.runId,
          })
        : "";

      const scriptUpload = await uploadDaytonaToolboxFile({
        config: session.config,
        toolboxProxyUrl: session.toolboxProxyUrl,
        sandboxId: session.providerSandboxId,
        path: scriptPath,
        content: buildCodexHarnessProbeScript(),
        mimeType: "text/javascript",
        fileName: "codex-primary.mjs",
      });
      if (!scriptUpload.ok) {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "script_upload_error",
          payload: {
            status: "error",
            code: scriptUpload.code,
            message: scriptUpload.message,
            details: scriptUpload.details ?? null,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code: scriptUpload.code,
          message: scriptUpload.message,
        });
      }

      const promptUpload = await uploadDaytonaToolboxFile({
        config: session.config,
        toolboxProxyUrl: session.toolboxProxyUrl,
        sandboxId: session.providerSandboxId,
        path: promptPath,
        content: runtimePrompt,
        mimeType: "text/plain",
        fileName: "codex-primary-prompt.txt",
      });
      if (!promptUpload.ok) {
        await cleanupCodexHarnessProbeFilesBestEffort({
          session,
          authPath,
          scriptPath,
          shadowPromptPath: promptPath,
          extraPaths: [instructionsPath, bridgeConfigPath],
        });
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "prompt_upload_error",
          payload: {
            status: "error",
            code: promptUpload.code,
            message: promptUpload.message,
            details: promptUpload.details ?? null,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code: promptUpload.code,
          message: promptUpload.message,
        });
      }

      const instructionsUpload = await uploadDaytonaToolboxFile({
        config: session.config,
        toolboxProxyUrl: session.toolboxProxyUrl,
        sandboxId: session.providerSandboxId,
        path: instructionsPath,
        content: instructions,
        mimeType: "text/plain",
        fileName: "codex-primary-instructions.txt",
      });
      if (!instructionsUpload.ok) {
        await cleanupCodexHarnessProbeFilesBestEffort({
          session,
          authPath,
          scriptPath,
          shadowPromptPath: promptPath,
          extraPaths: [instructionsPath, bridgeConfigPath],
        });
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "instructions_upload_error",
          payload: {
            status: "error",
            code: instructionsUpload.code,
            message: instructionsUpload.message,
            details: instructionsUpload.details ?? null,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code: instructionsUpload.code,
          message: instructionsUpload.message,
        });
      }

      const authUpload = await uploadDaytonaToolboxFile({
        config: session.config,
        toolboxProxyUrl: session.toolboxProxyUrl,
        sandboxId: session.providerSandboxId,
        path: authPath,
        content: authPayload,
        mimeType: "application/json",
        fileName: "codex-auth.json",
      });
      if (authUpload.ok !== true) {
        await cleanupCodexHarnessProbeFilesBestEffort({
          session,
          authPath,
          scriptPath,
          shadowPromptPath: promptPath,
          extraPaths: [instructionsPath, bridgeConfigPath],
        });
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "auth_upload_error",
          payload: {
            status: "error",
            code: authUpload.code,
            message: authUpload.message,
            details: authUpload.details ?? null,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code: authUpload.code,
          message: authUpload.message,
        });
      }

      if (bridgeConfigPath) {
        const bridgeConfigUpload = await uploadDaytonaToolboxFile({
          config: session.config,
          toolboxProxyUrl: session.toolboxProxyUrl,
          sandboxId: session.providerSandboxId,
          path: bridgeConfigPath,
          content: bridgeConfigPayload,
          mimeType: "application/json",
          fileName: "codex-bridge.json",
        });
        if (bridgeConfigUpload.ok !== true) {
          await cleanupCodexHarnessProbeFilesBestEffort({
            session,
            authPath,
            scriptPath,
            shadowPromptPath: promptPath,
            extraPaths: [instructionsPath, bridgeConfigPath],
          });
          await emitCodexHarnessProbeEvent({
            appendRunEvent: params.appendRunEvent,
            runId: params.runId,
            eventType: "codex_harness_primary_completed",
            eventKeySuffix: "bridge_config_upload_error",
            payload: {
              status: "error",
              code: bridgeConfigUpload.code,
              message: bridgeConfigUpload.message,
              details: bridgeConfigUpload.details ?? null,
              latency_ms: Date.now() - startedAt,
            },
          });
          return buildCodexRuntimeHarnessFailure({
            turn,
            status: 502,
            code: bridgeConfigUpload.code,
            message: bridgeConfigUpload.message,
          });
        }
      }

      const command = [
        `chmod 600 ${shellQuote(authPath)} ${shellQuote(promptPath)} ${shellQuote(instructionsPath)}${bridgeConfigPath ? ` ${shellQuote(bridgeConfigPath)}` : ""} 2>/dev/null || true`,
        [
          `POLYNET_CODEX_AUTH_FILE=${shellQuote(authPath)}`,
          "POLYNET_CODEX_PROBE_TIMEOUT_MS=65000",
          "POLYNET_CODEX_EXECUTION_MODE=primary_turn",
          "POLYNET_CODEX_EXECUTION_SMOKE=0",
          `POLYNET_CODEX_EXECUTION_MODEL=${shellQuote(CODEX_PRIMARY_RUNTIME_MODEL)}`,
          `POLYNET_CODEX_RUNTIME_PROMPT_FILE=${shellQuote(promptPath)}`,
          `POLYNET_CODEX_RUNTIME_INSTRUCTIONS_FILE=${shellQuote(instructionsPath)}`,
          `POLYNET_CODEX_HOME_DIR=${shellQuote(bindingCodexHomePath)}`,
          `POLYNET_CODEX_RESUME_THREAD_ID=${shellQuote(resumeCodexThreadId)}`,
          `POLYNET_CODEX_DYNAMIC_TOOLS_JSON=${shellQuote(JSON.stringify(activeDynamicToolSpecs))}`,
          `POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_FILE=${shellQuote(bridgeConfigPath)}`,
          `node ${shellQuote(scriptPath)}`,
        ].join(" "),
        "primary_status=$?",
        `rm -f ${shellQuote(authPath)} ${shellQuote(scriptPath)} ${shellQuote(promptPath)} ${shellQuote(instructionsPath)}${bridgeConfigPath ? ` ${shellQuote(bridgeConfigPath)}` : ""}`,
        'exit "$primary_status"',
      ].join("; ");
      const streamEvents: CodexHarnessProbeStreamEvent[] = [];
      let liveStreamDeltaEvents = 0;
      let liveStreamDeltaChars = 0;
      let liveStreamDeltaEmitFailures = 0;
      const executed = await executeCodexHarnessStreamingCommand({
        session,
        runId: params.runId,
        command,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 80,
        onStreamEvent: async (event) => {
          streamEvents.push(event);
          if (
            turn.stream === true &&
            readStringField(event, "type") === "assistant_delta"
          ) {
            const delta = readStringField(event, "delta") ?? "";
            if (!delta || !params.emitLiveAssistantDelta) return;
            try {
              const emitted = await params.emitLiveAssistantDelta(delta);
              if (emitted === true) {
                liveStreamDeltaEvents += 1;
                liveStreamDeltaChars += delta.length;
              } else {
                liveStreamDeltaEmitFailures += 1;
              }
            } catch {
              liveStreamDeltaEmitFailures += 1;
            }
          }
        },
      });

      if (executed.ok !== true) {
        await cleanupCodexHarnessProbeFilesBestEffort({
          session,
          authPath,
          scriptPath,
          shadowPromptPath: promptPath,
          extraPaths: [instructionsPath, bridgeConfigPath],
        });
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "command_error",
          payload: {
            status: "error",
            code: executed.code,
            message: executed.message,
            details: executed.details ?? null,
            streaming_transport: "daytona_process_session_log_polling_v0",
            live_stream_delta_events: liveStreamDeltaEvents,
            live_stream_delta_chars: liveStreamDeltaChars,
            live_stream_delta_emit_failures: liveStreamDeltaEmitFailures,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code: executed.code,
          message: executed.message,
        });
      }

      await emitCodexHarnessStreamEventAudit({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        source: "primary_turn",
        events: streamEvents,
      });
      const probeResult = readCodexHarnessProbeResult(executed.stdout);
      const finalText = readStringField(probeResult, "executionFinalText");
      const nativeToolSteps = readCodexPrimaryNativeToolSteps(probeResult);
      if (!probeResult || probeResult.ok !== true || !finalText) {
        const code = readStringField(probeResult, "errorCode") ?? "codex_primary_failed";
        const message =
          readStringField(probeResult, "errorMessage") ??
          "Codex primary harness did not return a usable assistant answer.";
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_completed",
          eventKeySuffix: "error",
          payload: {
            status: "error",
            code,
            message,
            stage: readStringField(probeResult, "stage"),
            exit_code: executed.exitCode,
            stdout_chars: String(executed.stdout ?? "").length,
            streaming_transport: "daytona_process_session_log_polling_v0",
            stream_event_count: executed.streamEventCount,
            live_stream_delta_events: liveStreamDeltaEvents,
            live_stream_delta_chars: liveStreamDeltaChars,
            live_stream_delta_emit_failures: liveStreamDeltaEmitFailures,
            first_stream_event_latency_ms: executed.firstStreamEventLatencyMs,
            last_stream_event_latency_ms: executed.lastStreamEventLatencyMs,
            log_poll_count: executed.logPollCount,
            malformed_stream_event_line_count:
              executed.malformedStreamEventLineCount,
            latency_ms: Date.now() - startedAt,
          },
        });
        return buildCodexRuntimeHarnessFailure({
          turn,
          status: 502,
          code,
          message,
        });
      }

      for (const [index, step] of nativeToolSteps.entries()) {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_tool_event",
          eventKeySuffix: String(index + 1),
          payload: {
            sequence: index + 1,
            provider_call_id: step.providerCallId,
            tool_name: step.toolName,
            raw_arguments: step.rawArguments,
            status: step.toolResultStatus ?? "started",
            output_preview: step.outputPreview ?? null,
            blocked: step.blocked ?? false,
          },
        });
      }
      for (const [index, toolCall] of readRecordArrayField(
        probeResult,
        "dynamicToolCalls",
        25,
      ).entries()) {
        await emitCodexHarnessProbeEvent({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          eventType: "codex_harness_primary_dynamic_tool_event",
          eventKeySuffix: String(index + 1),
          payload: {
            sequence: index + 1,
            call_id: readStringField(toolCall, "callId"),
            tool_name: readStringField(toolCall, "toolName"),
            status: readStringField(toolCall, "status"),
            success: readBooleanField(toolCall, "success"),
            args_present: readBooleanField(toolCall, "argsPresent"),
            output_chars: readNumberField(toolCall, "outputChars"),
            output_sha256: readStringField(toolCall, "outputSha256"),
            error_code: readStringField(toolCall, "errorCode"),
          },
        });
      }

      const observedCodexThreadId = readStringField(probeResult, "codexThreadId");
      const observedThreadLifecycle =
        readStringField(probeResult, "codexThreadLifecycleAction") ?? "started";
      const codexSessionArchivePersisted = readBooleanField(
        probeResult,
        "codexSessionArchivePersisted",
      );
      if (
        bindingAction !== "disabled" &&
        resolvedBindingKey &&
        observedCodexThreadId &&
        turn.threadId &&
        params.projectId &&
        turn.codexMcpProjection?.fingerprint
      ) {
        if (codexSessionArchivePersisted !== true) {
          await emitCodexHarnessProbeEvent({
            appendRunEvent: params.appendRunEvent,
            runId: params.runId,
            eventType: "codex_thread_binding_persist_skipped",
            eventKeySuffix: "session_archive_missing",
            payload: {
              code: "codex_session_archive_not_persisted",
              message: "Codex thread binding was not updated because the session archive was not persisted.",
              binding_key_present: Boolean(resolvedBindingKey),
              codex_thread_id_present: true,
              observed_codex_thread_id: observedCodexThreadId,
              projection_fingerprint: turn.codexMcpProjection.fingerprint,
              projection_version: turn.codexMcpProjection.version,
              dynamic_tool_surface_fingerprint:
                codexDynamicToolSurface.fingerprint,
              dynamic_tool_surface_version: codexDynamicToolSurface.version,
              codex_session_archive_strategy: "sessions_tar_v0",
              codex_session_archive_error_message: readStringField(
                probeResult,
                "codexSessionArchiveErrorMessage",
              ),
            },
          });
        } else {
          const lifecycleAction =
            bindingAction === "resume" && observedThreadLifecycle === "resumed"
              ? "resumed"
              : bindingAction === "create"
                ? "created"
                : "rotated";
          const rotatedReason =
            observedThreadLifecycle === "resume_failed_started"
              ? "resume_failed"
              : bindingAction === "rotate"
                ? (bindingReason ?? "dynamic_tool_surface_fingerprint_changed")
                : undefined;
          try {
            const persistResult = (await params.ctx.runMutation(
              (internal as any).codexHarnessThreadBindings
                .upsertCodexHarnessThreadBindingAfterRunInternal,
              {
                bindingKey: resolvedBindingKey,
                userId: params.userId,
                threadId: turn.threadId,
                projectId: params.projectId,
                codexThreadId: observedCodexThreadId,
                codexHomePath: bindingCodexHomePath,
                codexMcpProjectionVersion: turn.codexMcpProjection.version,
                codexMcpProjectionFingerprint:
                  turn.codexMcpProjection.fingerprint,
                codexDynamicToolSurfaceVersion:
                  codexDynamicToolSurface.version,
                codexDynamicToolSurfaceFingerprint:
                  codexDynamicToolSurface.fingerprint,
                runId: params.runId,
                providerSandboxId: session.providerSandboxId,
                projectVolumeId: session.projectVolumeId ?? undefined,
                lifecycleAction,
                previousCodexThreadId:
                  readStringField(
                    codexThreadBindingDecision,
                    "previousCodexThreadId",
                  ) ?? undefined,
                previousCodexMcpProjectionFingerprint:
                  readStringField(
                    codexThreadBindingDecision,
                    "previousCodexMcpProjectionFingerprint",
                  ) ?? undefined,
                previousCodexDynamicToolSurfaceFingerprint:
                  readStringField(
                    codexThreadBindingDecision,
                    "previousCodexDynamicToolSurfaceFingerprint",
                  ) ?? undefined,
                rotatedReason,
                nowMs: Date.now(),
              },
            )) as Record<string, unknown>;
            await emitCodexHarnessProbeEvent({
              appendRunEvent: params.appendRunEvent,
              runId: params.runId,
              eventType:
                lifecycleAction === "resumed"
                  ? "codex_thread_binding_resumed"
                  : lifecycleAction === "rotated"
                    ? "codex_thread_binding_rotated"
                    : "codex_thread_binding_created",
              eventKeySuffix: "1",
              payload: {
                lifecycle_action: lifecycleAction,
                binding_key_present: Boolean(resolvedBindingKey),
                codex_thread_id_present: true,
                observed_codex_thread_id: observedCodexThreadId,
                resume_requested_codex_thread_id: resumeCodexThreadId || null,
                duplicate_binding_count:
                  readNumberField(persistResult, "duplicateBindingCount") ?? 0,
                repaired_duplicate_binding_count:
                  readNumberField(persistResult, "repairedDuplicateBindingCount") ?? 0,
                previous_codex_thread_id_present: Boolean(
                  readStringField(
                    codexThreadBindingDecision,
                    "previousCodexThreadId",
                  ),
                ),
                projection_fingerprint:
                  turn.codexMcpProjection.fingerprint,
                projection_version: turn.codexMcpProjection.version,
                dynamic_tool_surface_fingerprint:
                  codexDynamicToolSurface.fingerprint,
                dynamic_tool_surface_version: codexDynamicToolSurface.version,
                rotated_reason: rotatedReason ?? null,
                resume_attempted: readBooleanField(
                  probeResult,
                  "codexThreadResumeAttempted",
                ),
                resume_failed: readBooleanField(
                  probeResult,
                  "codexThreadResumeFailed",
                ),
                resume_thread_id_matched: readBooleanField(
                  probeResult,
                  "codexThreadResumeThreadIdMatched",
                ),
                resume_error_message: readStringField(
                  probeResult,
                  "codexThreadResumeErrorMessage",
                ),
                codex_session_archive_strategy: "sessions_tar_v0",
                codex_session_archive_present: readBooleanField(
                  probeResult,
                  "codexSessionArchivePresent",
                ),
                codex_session_archive_restored: readBooleanField(
                  probeResult,
                  "codexSessionArchiveRestored",
                ),
                codex_session_archive_persisted: readBooleanField(
                  probeResult,
                  "codexSessionArchivePersisted",
                ),
                codex_session_archive_error_message: readStringField(
                  probeResult,
                  "codexSessionArchiveErrorMessage",
                ),
              },
            });
          } catch (error) {
            await emitCodexHarnessProbeEvent({
              appendRunEvent: params.appendRunEvent,
              runId: params.runId,
              eventType: "codex_thread_binding_persist_failed",
              eventKeySuffix: "1",
              payload: {
                code: "codex_thread_binding_persist_failed",
                message: error instanceof Error ? error.message : String(error),
                binding_key_present: Boolean(resolvedBindingKey),
                codex_thread_id_present: true,
                observed_codex_thread_id: observedCodexThreadId,
              },
            });
          }
        }
      }

      await emitCodexHarnessProbeEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        eventType: "codex_harness_primary_completed",
        eventKeySuffix: "ok",
        payload: {
          status: "ok",
          model: readStringField(probeResult, "executionModel") ?? CODEX_PRIMARY_RUNTIME_MODEL,
          codex_version: readStringField(probeResult, "codexVersion"),
          thread_id_present: Boolean(readStringField(probeResult, "codexThreadId")),
          observed_codex_thread_id: observedCodexThreadId,
          dynamic_tool_surface_fingerprint:
            codexDynamicToolSurface.fingerprint,
          dynamic_tool_surface_version: codexDynamicToolSurface.version,
          thread_lifecycle_action: observedThreadLifecycle,
          thread_resume_attempted: readBooleanField(probeResult, "codexThreadResumeAttempted"),
          thread_resume_failed: readBooleanField(probeResult, "codexThreadResumeFailed"),
          thread_resume_thread_id_matched: readBooleanField(probeResult, "codexThreadResumeThreadIdMatched"),
          resume_requested_codex_thread_id: resumeCodexThreadId || null,
          thread_resume_error_message: readStringField(probeResult, "codexThreadResumeErrorMessage"),
          codex_home_persistent: readBooleanField(probeResult, "codexHomePersistent"),
          codex_home_runtime_isolated: readBooleanField(probeResult, "codexHomeRuntimeIsolated"),
          codex_session_archive_strategy: "sessions_tar_v0",
          codex_session_archive_present: readBooleanField(probeResult, "codexSessionArchivePresent"),
          codex_session_archive_restored: readBooleanField(probeResult, "codexSessionArchiveRestored"),
          codex_session_archive_persisted: readBooleanField(probeResult, "codexSessionArchivePersisted"),
          codex_session_archive_error_message: readStringField(probeResult, "codexSessionArchiveErrorMessage"),
          binding_action: bindingAction,
          turn_id_present: Boolean(readStringField(probeResult, "codexTurnId")),
          native_tool_step_count: nativeToolSteps.length,
          sandbox_policy_type: readStringField(probeResult, "sandboxPolicyType"),
          sandbox_policy_network_access: readBooleanField(
            probeResult,
            "sandboxPolicyNetworkAccess",
          ),
          sandbox_policy_writable_root_count: readNumberField(
            probeResult,
            "sandboxPolicyWritableRootCount",
          ),
          sandbox_policy_exclude_tmpdir_env_var: readBooleanField(
            probeResult,
            "sandboxPolicyExcludeTmpdirEnvVar",
          ),
          sandbox_policy_exclude_slash_tmp: readBooleanField(
            probeResult,
            "sandboxPolicyExcludeSlashTmp",
          ),
          dynamic_tool_bridge_configured: readBooleanField(probeResult, "dynamicToolBridgeConfigured"),
          dynamic_tool_request_count: readNumberField(probeResult, "dynamicToolCallRequestCount"),
          dynamic_tool_response_count: readNumberField(probeResult, "dynamicToolCallResponseCount"),
          dynamic_tool_failure_count: readNumberField(probeResult, "dynamicToolCallFailureCount"),
          tool_started_events: readNumberField(readRecordField(probeResult, "adapterSummary"), "toolStartedEvents"),
          tool_completed_events: readNumberField(readRecordField(probeResult, "adapterSummary"), "toolCompletedEvents"),
          output_chars: finalText.length,
          output_sha256: readStringField(probeResult, "executionFinalTextSha256"),
          prompt_chars: readNumberField(probeResult, "runtimePromptChars"),
          streaming_transport: "daytona_process_session_log_polling_v0",
          stream_event_count: executed.streamEventCount,
          live_stream_delta_events: liveStreamDeltaEvents,
          live_stream_delta_chars: liveStreamDeltaChars,
          live_stream_delta_emit_failures: liveStreamDeltaEmitFailures,
          first_stream_event_latency_ms: executed.firstStreamEventLatencyMs,
          last_stream_event_latency_ms: executed.lastStreamEventLatencyMs,
          log_poll_count: executed.logPollCount,
          malformed_stream_event_line_count:
            executed.malformedStreamEventLineCount,
          latency_ms: Date.now() - startedAt,
        },
      });
      return buildCodexRuntimeHarnessSuccess({
        turn,
        assistantText: finalText,
        steps: nativeToolSteps,
      });
      } finally {
        if (bindingLockAcquired) {
          const releaseResult =
            await releaseCodexHarnessThreadBindingLockBestEffort({
              ctx: params.ctx,
              bindingKey: bindingLockKey,
              runId: params.runId,
            });
          try {
            await emitCodexHarnessProbeEvent({
              appendRunEvent: params.appendRunEvent,
              runId: params.runId,
              eventType: "codex_thread_binding_lock_released",
              eventKeySuffix: "1",
              payload: {
                status:
                  readBooleanField(releaseResult, "released") === true
                    ? "ok"
                    : "unknown",
                reason:
                  readStringField(releaseResult, "reason") ??
                  "release_best_effort",
                binding_key_present: Boolean(bindingLockKey),
                duplicate_lock_count:
                  readNumberField(releaseResult, "duplicateLockCount") ?? 0,
                released_lock_row_count:
                  readNumberField(releaseResult, "releasedRowCount") ?? 0,
              },
            });
          } catch {
            // Best-effort audit event; lock expiry is the fallback.
          }
        }
        if (bridgeSessionCreated) {
          await revokeCodexHarnessBridgeSessionBestEffort({
            ctx: params.ctx,
            bridgeSessionId,
            revokedReason: "codex_primary_turn_finished",
          });
        }
      }
    },
  };
}

export async function executeCodexHarnessProbeIfSelected(params: {
  ctx: any;
  userId: string;
  runId: string;
  projectId?: string | null;
  inferenceSource: RuntimeInferenceSource;
  allowedToolNames: readonly RetrievalToolName[];
  messages: readonly InferenceMessage[];
  stream: boolean;
  executionSession: CodexHarnessProbeExecutionSession;
  appendRunEvent: RuntimeRunEventAppender;
}): Promise<void> {
  const route = resolveCodexHarnessRoute({
    experimentEnabled: isCodexHarnessExperimentEnabled(),
    runtimeExecutionMode: "agentic",
    inferenceSource: params.inferenceSource,
    projectId: params.projectId,
    allowedToolNames: params.allowedToolNames,
  });
  if (!route.selected) return;
  const probeMode = resolveCodexHarnessProbeMode();
  if (probeMode === "off") return;
  const executionSmokeRequested = probeMode === "execution_canary";
  const shadowTurnRequested = probeMode === "shadow_turn";
  const toolCallCanaryRequested = probeMode === "tool_call_canary";
  if (shadowTurnRequested) {
    const executorDecision = resolveCodexHarnessExecutorDecision({
      route,
      executorEnabled: isCodexHarnessExecutorEnabled(),
      runtimeExecutionMode: "agentic",
      stream: params.stream,
      probeMode,
    });
    if (!executorDecision.selected) return;
  }
  const codexTurnRequested = executionSmokeRequested || shadowTurnRequested || toolCallCanaryRequested;
  const shadowUserPrompt = shadowTurnRequested
    ? readLatestUserMessageTextForCodexShadow(params.messages)
    : "";

  if (shadowTurnRequested && !shadowUserPrompt) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_shadow_completed",
      eventKeySuffix: "missing_prompt",
      payload: {
        status: "error",
        code: "codex_shadow_prompt_missing",
        message: "Codex shadow turn did not receive a latest user message.",
        stage: "shadow_prompt",
        completed: false,
        output_present: false,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: "not_ready",
      code: "codex_shadow_prompt_missing",
      message: "Codex shadow turn did not receive a latest user message.",
      stage: "shadow_prompt",
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
        shadow_turn_requested: true,
      },
    });
    return;
  }

  const safeId = safeCodexHarnessProbeId(params.runId);
  const toolCanaryFileName = toolCallCanaryRequested
    ? `.polynet-codex-tool-canary-${safeId}.txt`
    : "";
  const toolCanaryExpectedText = toolCallCanaryRequested
    ? `POLYNET_CODEX_TOOL_CANARY_${safeId}`
    : "";

  const probeStartedAt = Date.now();
  await emitCodexHarnessProbeEvent({
    appendRunEvent: params.appendRunEvent,
    runId: params.runId,
    eventType: "codex_harness_probe_started",
    eventKeySuffix: "1",
    payload: {
      project_id: params.projectId ?? null,
      execution_placement: route.executionPlacement,
      auth_bridge: route.authBridge,
      codex_home_placement: route.codexHomePlacement,
      probe_mode: probeMode,
      execution_smoke_requested: executionSmokeRequested,
      shadow_turn_requested: shadowTurnRequested,
      tool_call_canary_requested: toolCallCanaryRequested,
      tool_call_canary_file_name: toolCallCanaryRequested ? toolCanaryFileName : null,
      codex_turn_requested: codexTurnRequested,
      shadow_user_prompt_chars: shadowTurnRequested ? shadowUserPrompt.length : null,
      shadow_user_prompt_truncated:
        shadowTurnRequested && shadowUserPrompt.length >= CODEX_SHADOW_USER_PROMPT_MAX_CHARS,
    },
  });

  const auth = await resolveCodexChatgptAuthTokens({
    ctx: params.ctx,
    userId: params.userId,
  });
  if (!auth.ok) {
    const latencyMs = Date.now() - probeStartedAt;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "auth_error",
      payload: {
        status: "error",
        code: auth.code,
        message: auth.message,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: classifyCodexHarnessReadiness({
        code: auth.code,
        stage: "auth_bridge",
        authApplied: false,
      }),
      code: auth.code,
      message: auth.message,
      stage: "auth_bridge",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
        auth_bridge: route.authBridge,
      },
    });
    return;
  }

  const workspace = await params.executionSession.ensureWorkspaceForTool({
    toolName: "codex_harness_probe",
  });
  if (!workspace.ok) {
    const latencyMs = Date.now() - probeStartedAt;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "workspace_error",
      payload: {
        status: "error",
        code: workspace.code,
        message: workspace.message,
        details: (workspace as { details?: Record<string, unknown> | null }).details ?? null,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: "not_ready",
      code: workspace.code,
      message: workspace.message,
      stage: "workspace",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
      },
    });
    return;
  }

  const session = workspace.session;
  const authPath = `/tmp/polynet-codex-auth-${safeId}.json`;
  const scriptPath = `/tmp/polynet-codex-probe-${safeId}.mjs`;
  const shadowPromptPath = shadowTurnRequested
    ? `/tmp/polynet-codex-shadow-prompt-${safeId}.txt`
    : null;
  const authPayload = JSON.stringify({
    type: auth.auth.type,
    accessToken: auth.auth.accessToken,
    chatgptAccountId: auth.auth.chatgptAccountId,
    chatgptPlanType: auth.auth.chatgptPlanType,
  });

  const scriptUpload = await uploadDaytonaToolboxFile({
    config: session.config,
    toolboxProxyUrl: session.toolboxProxyUrl,
    sandboxId: session.providerSandboxId,
    path: scriptPath,
    content: buildCodexHarnessProbeScript(),
    mimeType: "text/javascript",
    fileName: "codex-probe.mjs",
  });
  if (!scriptUpload.ok) {
    const latencyMs = Date.now() - probeStartedAt;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "script_upload_error",
      payload: {
        status: "error",
        code: scriptUpload.code,
        message: scriptUpload.message,
        details: scriptUpload.details ?? null,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: "not_ready",
      code: scriptUpload.code,
      message: scriptUpload.message,
      stage: "script_upload",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
      },
    });
    return;
  }

  if (shadowPromptPath) {
    const shadowPromptUpload = await uploadDaytonaToolboxFile({
      config: session.config,
      toolboxProxyUrl: session.toolboxProxyUrl,
      sandboxId: session.providerSandboxId,
      path: shadowPromptPath,
      content: shadowUserPrompt,
      mimeType: "text/plain",
      fileName: "codex-shadow-prompt.txt",
    });
    if (!shadowPromptUpload.ok) {
      const latencyMs = Date.now() - probeStartedAt;
      await cleanupCodexHarnessProbeFilesBestEffort({ session, authPath, scriptPath, shadowPromptPath });
      await emitCodexHarnessProbeEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        eventType: "codex_harness_probe_completed",
        eventKeySuffix: "shadow_prompt_upload_error",
        payload: {
          status: "error",
          code: shadowPromptUpload.code,
          message: shadowPromptUpload.message,
          details: shadowPromptUpload.details ?? null,
          latency_ms: latencyMs,
        },
      });
      await emitCodexHarnessReadinessEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        probeMode,
        status: "not_ready",
        code: shadowPromptUpload.code,
        message: shadowPromptUpload.message,
        stage: "shadow_prompt_upload",
        latencyMs,
        evidence: {
          route_reason: route.reason,
          execution_placement: route.executionPlacement,
          shadow_turn_requested: true,
        },
      });
      return;
    }
  }

  const authUpload = await uploadDaytonaToolboxFile({
    config: session.config,
    toolboxProxyUrl: session.toolboxProxyUrl,
    sandboxId: session.providerSandboxId,
    path: authPath,
    content: authPayload,
    mimeType: "application/json",
    fileName: "codex-auth.json",
  });
  if (!authUpload.ok) {
    const latencyMs = Date.now() - probeStartedAt;
    await cleanupCodexHarnessProbeFilesBestEffort({ session, authPath, scriptPath, shadowPromptPath });
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "auth_upload_error",
      payload: {
        status: "error",
        code: authUpload.code,
        message: authUpload.message,
        details: authUpload.details ?? null,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: "not_ready",
      code: authUpload.code,
      message: authUpload.message,
      stage: "auth_upload",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
      },
    });
    return;
  }

  if (executionSmokeRequested) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_execution_started",
      eventKeySuffix: "1",
      payload: {
        status: "started",
        project_id: params.projectId ?? null,
        execution_placement: route.executionPlacement,
        auth_bridge: route.authBridge,
        expected_text: "polynet codex execution ok",
        model: "gpt-5.3-codex-spark",
      },
    });
  }
  if (shadowTurnRequested) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_shadow_started",
      eventKeySuffix: "1",
      payload: {
        status: "started",
        project_id: params.projectId ?? null,
        execution_placement: route.executionPlacement,
        auth_bridge: route.authBridge,
        model: "gpt-5.3-codex-spark",
        user_message_chars: shadowUserPrompt.length,
        user_message_truncated: shadowUserPrompt.length >= CODEX_SHADOW_USER_PROMPT_MAX_CHARS,
        redaction_policy: "prompt_file_input_output_hash_only",
      },
    });
  }
  if (toolCallCanaryRequested) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_tool_call_started",
      eventKeySuffix: "1",
      payload: {
        status: "started",
        project_id: params.projectId ?? null,
        execution_placement: route.executionPlacement,
        auth_bridge: route.authBridge,
        model: "gpt-5.3-codex-spark",
        file_name: toolCanaryFileName,
        expected_chars: toolCanaryExpectedText.length,
        redaction_policy: "hash_and_length_only",
      },
    });
  }

  const command = [
    `chmod 600 ${shellQuote(authPath)} 2>/dev/null || true`,
    shadowPromptPath ? `chmod 600 ${shellQuote(shadowPromptPath)} 2>/dev/null || true` : null,
    toolCallCanaryRequested
      ? `printf %s ${shellQuote(toolCanaryExpectedText)} > ${shellQuote(toolCanaryFileName)} && chmod 600 ${shellQuote(toolCanaryFileName)} 2>/dev/null || true`
      : null,
    [
      `POLYNET_CODEX_AUTH_FILE=${shellQuote(authPath)}`,
      `POLYNET_CODEX_PROBE_TIMEOUT_MS=${codexTurnRequested ? "65000" : "20000"}`,
      `POLYNET_CODEX_EXECUTION_MODE=${shellQuote(probeMode)}`,
      `POLYNET_CODEX_EXECUTION_SMOKE=${executionSmokeRequested ? "1" : "0"}`,
      `POLYNET_CODEX_EXECUTION_EXPECTED=${shellQuote("polynet codex execution ok")}`,
      `POLYNET_CODEX_EXECUTION_MODEL=${shellQuote("gpt-5.3-codex-spark")}`,
      `POLYNET_CODEX_SHADOW_PROMPT_FILE=${shellQuote(shadowPromptPath ?? "")}`,
      `POLYNET_CODEX_TOOL_CANARY_FILE=${shellQuote(toolCallCanaryRequested ? toolCanaryFileName : "")}`,
      `POLYNET_CODEX_TOOL_CANARY_EXPECTED=${shellQuote(toolCallCanaryRequested ? toolCanaryExpectedText : "")}`,
      `POLYNET_CODEX_SHADOW_INSTRUCTIONS=${shellQuote([
        "You are PolyNet's read-only shadow Codex executor.",
        "Answer the user's latest turn as a hidden diagnostic run.",
        "Do not use tools, inspect files, run shell commands, or mutate workspace state.",
        "Do not include secrets or credentials.",
        "Keep the answer concise.",
      ].join(" "))}`,
      `node ${shellQuote(scriptPath)}`,
    ].join(" "),
    "probe_status=$?",
    `rm -f ${shellQuote(authPath)} ${shellQuote(scriptPath)}${shadowPromptPath ? ` ${shellQuote(shadowPromptPath)}` : ""}${toolCallCanaryRequested ? ` ${shellQuote(toolCanaryFileName)}` : ""}`,
    'exit "$probe_status"',
  ].filter(Boolean).join("; ");
  const executed = await executeDaytonaCommand({
    config: session.config,
    toolboxProxyUrl: session.toolboxProxyUrl,
    sandboxId: session.providerSandboxId,
    command,
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: codexTurnRequested ? 80 : 35,
    allowNonZero: true,
  });

  if (!executed.ok) {
    const latencyMs = Date.now() - probeStartedAt;
    await cleanupCodexHarnessProbeFilesBestEffort({
      session,
      authPath,
      scriptPath,
      shadowPromptPath,
      extraPaths: toolCallCanaryRequested ? [toolCanaryFileName] : [],
    });
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "command_error",
      payload: {
        status: "error",
        code: executed.code,
        message: executed.message,
        details: executed.details ?? null,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: classifyCodexHarnessReadiness({
        code: "codex_probe_command_error",
      }),
      code: "codex_probe_command_error",
      message: executed.message,
      stage: "daytona_command",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
        toolbox_error_code: executed.code,
      },
    });
    return;
  }

  const streamEvents = readCodexHarnessProbeStreamEvents(executed.stdout);
  if (codexTurnRequested) {
    await emitCodexHarnessStreamEventAudit({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      source: probeMode,
      events: streamEvents,
    });
  }
  const probeResult = readCodexHarnessProbeResult(executed.stdout);
  if (!probeResult) {
    const latencyMs = Date.now() - probeStartedAt;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_probe_completed",
      eventKeySuffix: "parse_error",
      payload: {
        status: "error",
        code: "codex_probe_result_missing",
        message: "Codex harness probe did not return a parseable result marker.",
        exit_code: executed.exitCode,
        stdout_chars: String(executed.stdout ?? "").length,
        latency_ms: latencyMs,
      },
    });
    await emitCodexHarnessReadinessEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      probeMode,
      status: classifyCodexHarnessReadiness({
        code: "codex_probe_result_missing",
      }),
      code: "codex_probe_result_missing",
      message: "Codex harness probe did not return a parseable result marker.",
      stage: "parse_result",
      latencyMs,
      evidence: {
        route_reason: route.reason,
        execution_placement: route.executionPlacement,
        exit_code: executed.exitCode,
      },
    });
    return;
  }

  if (readBooleanField(probeResult, "appServerStarted")) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_app_server_started",
      eventKeySuffix: "1",
      payload: {
        codex_path_present: readBooleanField(probeResult, "codexPathPresent"),
        codex_version: readStringField(probeResult, "codexVersion"),
        server_info: probeResult.serverInfo ?? null,
        user_agent: readStringField(probeResult, "userAgent"),
      },
    });
  }
  if (readBooleanField(probeResult, "authApplied")) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_auth_applied",
      eventKeySuffix: "1",
      payload: {
        auth_type: "chatgptAuthTokens",
        account_id_present: Boolean(auth.auth.chatgptAccountId),
        plan_type_present: Boolean(auth.auth.chatgptPlanType),
        access_token_expires_at: auth.auth.accessTokenExpiresAt ?? null,
      },
    });
  }
  if (readBooleanField(probeResult, "accountResolved")) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_account_resolved",
      eventKeySuffix: "1",
      payload: {
        account: probeResult.account ?? null,
      },
    });
  }
  if (readBooleanField(probeResult, "rateLimitsPresent")) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_rate_limits_updated",
      eventKeySuffix: "1",
      payload: {
        rate_limits: probeResult.notificationRateLimits ?? probeResult.rateLimits ?? null,
      },
    });
  }
  if (codexTurnRequested && readBooleanField(probeResult, "codexThreadStarted")) {
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_thread_started",
      eventKeySuffix: "1",
      payload: {
        thread_id_present: Boolean(readStringField(probeResult, "codexThreadId")),
        model: readStringField(probeResult, "executionModel"),
      },
    });
  }
  const probeAdapterSummary = readRecordField(probeResult, "adapterSummary");
  if (codexTurnRequested) {
    const adapterEvents = readRecordArrayField(probeResult, "adapterEvents", 40);
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_event_adapter_summary",
      eventKeySuffix: "1",
      payload: {
        total_notifications: readNumberField(probeAdapterSummary, "totalNotifications"),
        captured_events: readNumberField(probeAdapterSummary, "capturedEvents"),
        emitted_events: adapterEvents.length,
        assistant_delta_events: readNumberField(probeAdapterSummary, "assistantDeltaEvents"),
        reasoning_delta_events: readNumberField(probeAdapterSummary, "reasoningDeltaEvents"),
        item_started_events: readNumberField(probeAdapterSummary, "itemStartedEvents"),
        tool_started_events: readNumberField(probeAdapterSummary, "toolStartedEvents"),
        turn_completed_events: readNumberField(probeAdapterSummary, "turnCompletedEvents"),
        error_events: readNumberField(probeAdapterSummary, "errorEvents"),
        method_counts: readRecordField(probeAdapterSummary, "methodCounts"),
      },
    });
    for (const [index, adapterEvent] of adapterEvents.entries()) {
      await emitCodexHarnessProbeEvent({
        appendRunEvent: params.appendRunEvent,
        runId: params.runId,
        eventType: "codex_harness_event_adapter_event",
        eventKeySuffix: String(index + 1),
        payload: {
          sequence: index + 1,
          source: "codex_app_server",
          ...adapterEvent,
        },
      });
    }
  }
  if (toolCallCanaryRequested) {
    const toolCompleted = readBooleanField(probeResult, "executionCompleted");
    const toolMatchedExpected = readBooleanField(probeResult, "toolCallCanaryMatchedExpected");
    const toolStartedEvents = readNumberField(probeAdapterSummary, "toolStartedEvents") ?? 0;
    const toolStarted = readBooleanField(probeResult, "toolCallCanaryToolStarted") || toolStartedEvents > 0;
    const toolCode = readStringField(probeResult, "errorCode");
    const toolMessage = readStringField(probeResult, "errorMessage");
    const toolReady = toolCompleted && toolMatchedExpected && toolStarted;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_tool_call_completed",
      eventKeySuffix: toolReady ? "ok" : "error",
      payload: {
        status: toolReady ? "ok" : "error",
        code: toolCode,
        message: toolMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        thread_id_present: Boolean(readStringField(probeResult, "codexThreadId")),
        turn_id_present: Boolean(readStringField(probeResult, "codexTurnId")),
        completed: toolCompleted,
        matched_expected: toolMatchedExpected,
        tool_started: toolStarted,
        tool_started_events: toolStartedEvents,
        output_chars: readNumberField(probeResult, "executionFinalTextChars"),
        output_sha256: readStringField(probeResult, "executionFinalTextSha256"),
        expected_chars: readNumberField(probeResult, "toolCanaryExpectedTextChars"),
        expected_sha256: readStringField(probeResult, "toolCanaryExpectedTextSha256"),
        file_name: readStringField(probeResult, "toolCanaryFileName") ?? toolCanaryFileName,
        redaction_policy: "hash_and_length_only",
      },
    });
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_tool_call_readiness",
      eventKeySuffix: probeMode,
      payload: {
        status: toolReady ? "ready" : "not_ready",
        ready: toolReady,
        code: toolCode,
        message: toolMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        completed: toolCompleted,
        matched_expected: toolMatchedExpected,
        tool_started: toolStarted,
        tool_started_events: toolStartedEvents,
        output_chars: readNumberField(probeResult, "executionFinalTextChars"),
        output_sha256: readStringField(probeResult, "executionFinalTextSha256"),
        redaction_policy: "hash_and_length_only",
      },
    });
  }
  if (executionSmokeRequested) {
    const executionCompleted = readBooleanField(probeResult, "executionCompleted");
    const executionMatchedExpected = readBooleanField(probeResult, "executionMatchedExpected");
    const executionCode = readStringField(probeResult, "errorCode");
    const executionMessage = readStringField(probeResult, "errorMessage");
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_execution_completed",
      eventKeySuffix: executionCompleted && executionMatchedExpected ? "ok" : "error",
      payload: {
        status: executionCompleted && executionMatchedExpected ? "ok" : "error",
        code: executionCode,
        message: executionMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        turn_id_present: Boolean(readStringField(probeResult, "codexTurnId")),
        completed: executionCompleted,
        matched_expected: executionMatchedExpected,
        final_text: readStringField(probeResult, "executionFinalText"),
      },
    });
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_execution_readiness",
      eventKeySuffix: probeMode,
      payload: {
        status: executionCompleted && executionMatchedExpected ? "ready" : "not_ready",
        ready: executionCompleted && executionMatchedExpected,
        code: executionCode,
        message: executionMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        completed: executionCompleted,
        matched_expected: executionMatchedExpected,
      },
    });
  }
  if (shadowTurnRequested) {
    const shadowCompleted = readBooleanField(probeResult, "executionCompleted");
    const shadowOutputPresent = readBooleanField(probeResult, "shadowOutputPresent");
    const shadowCode = readStringField(probeResult, "errorCode");
    const shadowMessage = readStringField(probeResult, "errorMessage");
    const shadowReady = shadowCompleted && shadowOutputPresent;
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_shadow_completed",
      eventKeySuffix: shadowReady ? "ok" : "error",
      payload: {
        status: shadowReady ? "ok" : "error",
        code: shadowCode,
        message: shadowMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        thread_id_present: Boolean(readStringField(probeResult, "codexThreadId")),
        turn_id_present: Boolean(readStringField(probeResult, "codexTurnId")),
        completed: shadowCompleted,
        output_present: shadowOutputPresent,
        output_chars: readNumberField(probeResult, "shadowOutputChars"),
        output_sha256: readStringField(probeResult, "shadowOutputSha256"),
        user_message_chars: readNumberField(probeResult, "shadowPromptChars"),
        redaction_policy: "hash_and_length_only",
      },
    });
    await emitCodexHarnessProbeEvent({
      appendRunEvent: params.appendRunEvent,
      runId: params.runId,
      eventType: "codex_harness_shadow_readiness",
      eventKeySuffix: probeMode,
      payload: {
        status: shadowReady ? "ready" : "not_ready",
        ready: shadowReady,
        code: shadowCode,
        message: shadowMessage,
        stage: readStringField(probeResult, "stage"),
        model: readStringField(probeResult, "executionModel"),
        completed: shadowCompleted,
        output_present: shadowOutputPresent,
        output_chars: readNumberField(probeResult, "shadowOutputChars"),
        output_sha256: readStringField(probeResult, "shadowOutputSha256"),
        redaction_policy: "hash_and_length_only",
      },
    });
  }

  const probeOk = probeResult.ok === true;
  const probeStage = readStringField(probeResult, "stage");
  const probeCode = readStringField(probeResult, "errorCode");
  const probeMessage = readStringField(probeResult, "errorMessage");
  const codexPathPresent = readBooleanField(probeResult, "codexPathPresent");
  const appServerStarted = readBooleanField(probeResult, "appServerStarted");
  const authApplied = readBooleanField(probeResult, "authApplied");
  const accountResolved = readBooleanField(probeResult, "accountResolved");
  const rateLimitsPresent = readBooleanField(probeResult, "rateLimitsPresent");
  const executionSmokeCompleted = readBooleanField(probeResult, "executionCompleted");
  const executionMatchedExpected = readBooleanField(probeResult, "executionMatchedExpected");
  const toolCallCanaryCompleted = readBooleanField(probeResult, "executionCompleted");
  const toolCallCanaryMatchedExpected = readBooleanField(probeResult, "toolCallCanaryMatchedExpected");
  const toolCallCanaryToolStartedEvents = readNumberField(probeAdapterSummary, "toolStartedEvents") ?? 0;
  const toolCallCanaryToolStarted =
    readBooleanField(probeResult, "toolCallCanaryToolStarted") || toolCallCanaryToolStartedEvents > 0;
  const shadowOutputPresent = readBooleanField(probeResult, "shadowOutputPresent");
  const readinessStatus = classifyCodexHarnessReadiness({
    code: probeCode,
    stage: probeStage,
    probeOk,
    codexPathPresent,
    appServerStarted,
    authApplied,
    accountResolved,
    rateLimitsPresent,
    executionSmokeRequested,
    executionSmokeCompleted,
    executionMatchedExpected,
    toolCallCanaryRequested,
    toolCallCanaryCompleted,
    toolCallCanaryMatchedExpected,
    toolCallCanaryToolStarted,
  });
  const probeElapsedMs =
    typeof probeResult.elapsedMs === "number" && Number.isFinite(probeResult.elapsedMs)
      ? Math.floor(probeResult.elapsedMs)
      : null;
  const latencyMs = Date.now() - probeStartedAt;
  await emitCodexHarnessProbeEvent({
    appendRunEvent: params.appendRunEvent,
    runId: params.runId,
    eventType: "codex_harness_probe_completed",
    eventKeySuffix: probeOk ? "ok" : "error",
    payload: {
      status: probeOk ? "ok" : "error",
      stage: probeStage,
      code: probeCode,
      message: probeMessage,
      exit_code: executed.exitCode,
      elapsed_ms: probeElapsedMs,
      latency_ms: latencyMs,
    },
  });
  await emitCodexHarnessReadinessEvent({
    appendRunEvent: params.appendRunEvent,
    runId: params.runId,
    probeMode,
    status: readinessStatus,
    code: probeCode,
    message: probeMessage,
    stage: probeStage,
    latencyMs,
    evidence: {
      route_reason: route.reason,
      execution_placement: route.executionPlacement,
      auth_bridge: route.authBridge,
      codex_home_placement: route.codexHomePlacement,
      codex_path_present: codexPathPresent,
      app_server_started: appServerStarted,
      auth_applied: authApplied,
      account_resolved: accountResolved,
      rate_limits_present: rateLimitsPresent,
      execution_smoke_requested: executionSmokeRequested,
      execution_smoke_completed: executionSmokeRequested ? executionSmokeCompleted : false,
      execution_matched_expected: executionSmokeRequested ? executionMatchedExpected : false,
      tool_call_canary_requested: toolCallCanaryRequested,
      tool_call_canary_completed: toolCallCanaryRequested ? toolCallCanaryCompleted : false,
      tool_call_canary_matched_expected: toolCallCanaryRequested ? toolCallCanaryMatchedExpected : false,
      tool_call_canary_tool_started: toolCallCanaryRequested ? toolCallCanaryToolStarted : false,
      tool_call_canary_tool_started_events: toolCallCanaryRequested ? toolCallCanaryToolStartedEvents : 0,
      shadow_turn_requested: shadowTurnRequested,
      shadow_turn_completed: shadowTurnRequested ? executionSmokeCompleted : false,
      shadow_output_present: shadowTurnRequested ? shadowOutputPresent : false,
      shadow_output_chars: shadowTurnRequested ? readNumberField(probeResult, "shadowOutputChars") : null,
      shadow_output_sha256: shadowTurnRequested ? readStringField(probeResult, "shadowOutputSha256") : null,
      codex_version: readStringField(probeResult, "codexVersion"),
      exit_code: executed.exitCode,
      elapsed_ms: probeElapsedMs,
    },
  });
}
