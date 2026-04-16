import { api, internal } from "./_generated/api";
import {
  runChatgptNativeToolCompletion,
  type ChatgptFunctionTool,
  type ChatgptToolAwareMessage,
} from "./httpChatgpt";
import { loadDaytonaConfig, type DaytonaConfig } from "./daytonaSandboxClient";
import {
  resolveWorkspaceProjectContext,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import {
  appendWorkspaceToolCallFinished,
  appendWorkspaceToolCallStarted,
} from "./daytonaRuntimeEvents";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  runAbortableWithRuntimeCancellation,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
import {
  editDaytonaWorkspaceFile,
  globDaytonaWorkspacePaths,
  grepDaytonaWorkspaceFiles,
  listDaytonaWorkspaceDirectory,
  readDaytonaWorkspaceFile,
  runDaytonaWorkspaceBash,
  sha256DaytonaWorkspaceFile,
  writeDaytonaWorkspaceFile,
} from "./daytonaWorkspaceTools";
import { executeWebResearch } from "./webResearchTools";
import { runOpenRouterNativeToolCompletion } from "./openRouterNativeTransport";
import {
  type RetrievalToolName,
  isComputerUseToolName,
  requiresWorkspaceSandbox,
} from "../shared/retrievalTools";
import {
  getNativeToolCompletionToolCalls,
  type NativeToolAwareCompletionSuccess,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol";
import {
  type NativeToolExecutionResult,
} from "../shared/nativeToolLoop";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelBudget,
  type RuntimeKernelFailure,
  type RuntimeKernelFailureInput,
  type RuntimeKernelSuccess,
} from "../shared/runtimeKernelTypes";
import {
  buildCommunityOverlayRuntimeState,
  type CommunityOverlayMountedTool,
  type CommunityOverlaySelectedSkill,
  type CommunityOverlaySkillInventory,
} from "../shared/communityOverlayRuntime";
import { extractExplicitSkillMentions } from "../shared/communitySkillRuntime";
import {
  buildOpenAiFunctionTools,
  buildResponsesApiFunctionTools,
  normalizeToolArguments as normalizeRegistryToolArguments,
  type ResponsesApiFunctionTool,
} from "../shared/toolRegistry";
import {
  buildWorkspaceRuntimeSystemPrompt,
  type RuntimeCommunityPromptFields,
  type ThreadWorkingStatePrompt,
} from "../shared/runtimePrompt";
import { createRuntimeReasoningSummaryEmitter } from "./runtimeReasoningSummaryEvents";
import { parseProviderModelRef } from "./httpInferenceConfig";
import { runOpenAiNativeToolCompletion } from "./openAiNativeToolCompletion";
import { logStructuredError, summarizeErrorForLog } from "./errorLogging";
import { createPolyNetExecutionSession } from "./runtimeExecutionSession";
import {
  type RuntimeMountedMcpTool,
} from "./runtimeMcpManager";
import {
  normalizeResolveMountedToolsArguments,
  RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
} from "./runtimeMountedToolExposure";
import {
  classifyRuntimeToolSchedule,
  type RuntimeToolSchedulePlan,
} from "../shared/runtimeToolPolicy";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};

type RuntimeAgentLoopSuccess = RuntimeKernelSuccess<string>;
type RuntimeAgentLoopFailure = RuntimeKernelFailure<string>;
type RuntimeAgentLoopFailureInput = RuntimeKernelFailureInput;

type OpenAiCompatibleFunctionTool = ReturnType<
  typeof buildOpenAiFunctionTools
>[number];
type ChatgptCompatibleFunctionTool = ChatgptFunctionTool;
type JsonSchema = Record<string, unknown> | boolean;

type RuntimeInferenceSource = "free" | "platform" | "chatgpt" | "user_key";
const CHAT_TOOLS_RUNTIME_KERNEL_BUDGET: RuntimeKernelBudget =
  DEFAULT_RUNTIME_KERNEL_BUDGET;
const RUNTIME_PARALLEL_READ_TOOLS_FLAG =
  "RUNTIME_PARALLEL_READ_TOOLS_ENABLED";
const RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 240,
    },
    scope: {
      type: "string",
      enum: ["user", "community", "any"],
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 8,
    },
  },
};

function readRuntimeBooleanFlag(name: string, defaultValue: boolean): boolean {
  try {
    const rawValue = (globalThis as any)?.process?.env?.[name];
    if (typeof rawValue !== "string" || !rawValue.trim()) return defaultValue;
    const value = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
  } catch {
    // Convex runtime may not expose process.env; keep the safe default.
  }
  return defaultValue;
}

type RuntimeToolBatchExecutionMode = "serial" | "parallel";

type RuntimeToolBatchTelemetryRecord = {
  providerCallId: string;
  toolName: string;
  index: number;
  iteration: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  durationMs: number | null;
  status: NativeToolExecutionResult["status"] | null;
  errorCode: string | null;
  madeProgress: boolean | null;
  repeatedCallCount: number | null;
  consecutiveFailureCount: number | null;
  consecutiveNoProgressCount: number | null;
};

type ActiveRuntimeToolBatchTelemetry = {
  startingIteration: number;
  batchCallCount: number;
  isBatch: boolean;
  remainingToolBudget: number;
  parallelReadToolsEnabled: boolean;
  scheduledAtMs: number;
  schedule: RuntimeToolSchedulePlan;
  actualExecutionMode: RuntimeToolBatchExecutionMode;
  completedToolCount: number;
  recordsByCallId: Map<string, RuntimeToolBatchTelemetryRecord>;
};

function summarizeToolBatchBlockerReasons(
  schedule: RuntimeToolSchedulePlan,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of schedule.calls) {
    for (const reason of call.reasons) {
      if (reason === "parallel_safe_read_only") continue;
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function buildToolBatchTelemetryPayload(params: {
  runId: string;
  harnessName: "chat_tools";
  telemetry: ActiveRuntimeToolBatchTelemetry;
  terminalStopReason?: string | null;
  terminalFailureCode?: string | null;
  pendingToolCallId?: string | null;
}): Record<string, unknown> {
  const records = [...params.telemetry.recordsByCallId.values()].sort(
    (left, right) => left.index - right.index,
  );
  const durationValues = records
    .map((record) => record.durationMs)
    .filter((value): value is number => typeof value === "number");
  const startedAtValues = records
    .map((record) => record.startedAtMs)
    .filter((value): value is number => typeof value === "number");
  const finishedAtValues = records
    .map((record) => record.finishedAtMs)
    .filter((value): value is number => typeof value === "number");
  const batchStartedAtMs =
    startedAtValues.length > 0
      ? Math.min(...startedAtValues)
      : params.telemetry.scheduledAtMs;
  const batchFinishedAtMs =
    finishedAtValues.length > 0
      ? Math.max(...finishedAtValues)
      : params.telemetry.scheduledAtMs;
  const batchWallTimeMs = Math.max(0, batchFinishedAtMs - batchStartedAtMs);
  const serialDurationEstimateMs = durationValues.reduce(
    (sum, value) => sum + value,
    0,
  );
  const estimatedParallelSavingsMs =
    params.telemetry.actualExecutionMode === "parallel"
      ? Math.max(0, serialDurationEstimateMs - batchWallTimeMs)
      : 0;
  const statusCounts: Record<string, number> = {};
  for (const record of records) {
    const status = record.status ?? "unknown";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return {
    run_id: params.runId,
    harness_name: params.harnessName,
    starting_iteration: params.telemetry.startingIteration,
    batch_call_count: params.telemetry.batchCallCount,
    completed_tool_count: params.telemetry.completedToolCount,
    batch_completed:
      params.telemetry.completedToolCount >= params.telemetry.batchCallCount,
    is_batch: params.telemetry.isBatch,
    remaining_tool_budget: params.telemetry.remainingToolBudget,
    parallel_read_tools_enabled: params.telemetry.parallelReadToolsEnabled,
    schedule_decision: params.telemetry.schedule.decision,
    schedule_execution_mode: params.telemetry.schedule.executionMode,
    schedule_reason: params.telemetry.schedule.reason,
    actual_execution_mode: params.telemetry.actualExecutionMode,
    parallel_eligible_call_count: params.telemetry.schedule.summary.parallelEligible,
    parallel_blocker_reason_counts: summarizeToolBatchBlockerReasons(
      params.telemetry.schedule,
    ),
    batch_scheduled_at_ms: params.telemetry.scheduledAtMs,
    batch_started_at_ms: batchStartedAtMs,
    batch_finished_at_ms: batchFinishedAtMs,
    batch_wall_time_ms: batchWallTimeMs,
    serial_duration_estimate_ms: serialDurationEstimateMs,
    estimated_parallel_savings_ms: estimatedParallelSavingsMs,
    tool_status_counts: statusCounts,
    tools: records.map((record) => ({
      provider_call_id: record.providerCallId,
      tool_name: record.toolName,
      index: record.index,
      iteration: record.iteration,
      started_at_ms: record.startedAtMs,
      finished_at_ms: record.finishedAtMs,
      duration_ms: record.durationMs,
      status: record.status,
      error_code: record.errorCode,
      made_progress: record.madeProgress,
      repeated_call_count: record.repeatedCallCount,
      consecutive_failure_count: record.consecutiveFailureCount,
      consecutive_no_progress_count: record.consecutiveNoProgressCount,
    })),
    terminal_stop_reason: params.terminalStopReason ?? null,
    terminal_failure_code: params.terminalFailureCode ?? null,
    pending_tool_call_id: params.pendingToolCallId ?? null,
  };
}

type RuntimeMountedCommunityAppTool = {
  community_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type RuntimeMountedUserPlatformAppTool = {
  user_platform_app_mount_id: string;
  developer_app_id: string;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

type RuntimeCommunitySkillInventory = {
  community_skill_attachment_id: string;
  skill_package_id: string;
  name: string;
  mention_token: string;
  description: string | null;
};

type RuntimeSelectedCommunitySkill = RuntimeCommunitySkillInventory & {
  instructions_md: string;
};

function normalizeMountedToolSchema(
  value: unknown,
): Record<string, unknown> | boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {
    type: "object",
    additionalProperties: true,
    properties: {},
  };
}

function normalizeRuntimeMountedCommunityAppTools(
  value: unknown,
): RuntimeMountedCommunityAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedCommunityAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      community_app_mount_id: String(record.community_app_mount_id ?? "").trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "Community app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(record.input_schema),
      risk_level: riskLevel,
    });
  }
  return tools;
}

function normalizeRuntimeMountedUserPlatformAppTools(
  value: unknown,
): RuntimeMountedUserPlatformAppTool[] {
  if (!Array.isArray(value)) return [];
  const tools: RuntimeMountedUserPlatformAppTool[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const namespacedToolName = String(
      record.namespaced_tool_name ?? "",
    ).trim();
    const toolName = String(record.tool_name ?? "").trim();
    if (!namespacedToolName || !toolName || seen.has(namespacedToolName)) {
      continue;
    }
    seen.add(namespacedToolName);
    const riskLevel =
      record.risk_level === "write" || record.risk_level === "sensitive"
        ? record.risk_level
        : "read";
    tools.push({
      user_platform_app_mount_id: String(
        record.user_platform_app_mount_id ?? "",
      ).trim(),
      developer_app_id: String(record.developer_app_id ?? "").trim(),
      app_name: String(record.app_name ?? "").trim() || "My app",
      endpoint_url: String(record.endpoint_url ?? "").trim(),
      auth_type: String(record.auth_type ?? "").trim(),
      tool_name: toolName,
      namespaced_tool_name: namespacedToolName,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      input_schema: normalizeMountedToolSchema(record.input_schema),
      risk_level: riskLevel,
    });
  }
  return tools;
}

function normalizeRuntimeCommunitySkillInventory(
  value: unknown,
): RuntimeCommunitySkillInventory[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeCommunitySkillInventory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    if (!mentionToken || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
    });
  }
  return skills;
}

function normalizeRuntimeSelectedCommunitySkills(
  value: unknown,
): RuntimeSelectedCommunitySkill[] {
  if (!Array.isArray(value)) return [];
  const skills: RuntimeSelectedCommunitySkill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) continue;
    const mentionToken = String(record.mention_token ?? "").trim().toLowerCase();
    const instructionsMd =
      typeof record.instructions_md === "string"
        ? record.instructions_md.trim()
        : "";
    if (!mentionToken || !instructionsMd || seen.has(mentionToken)) continue;
    seen.add(mentionToken);
    skills.push({
      community_skill_attachment_id: String(
        record.community_skill_attachment_id ?? "",
      ).trim(),
      skill_package_id: String(record.skill_package_id ?? "").trim(),
      name: String(record.name ?? "").trim() || mentionToken,
      mention_token: mentionToken,
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      instructions_md: instructionsMd,
    });
  }
  return skills;
}

function buildMountedAppOpenAiTools(
  mountedTools: RuntimeMountedMcpTool[],
): OpenAiCompatibleFunctionTool[] {
  return mountedTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.runtime_tool_name,
      description: buildMountedAppToolDescription(tool),
      parameters: normalizeMountedToolSchema(tool.input_schema),
      strict: true,
    },
  }));
}

function buildMountedAppResponsesTools(
  mountedTools: RuntimeMountedMcpTool[],
): ResponsesApiFunctionTool[] {
  return mountedTools.map((tool) => ({
    type: "function",
    name: tool.runtime_tool_name,
    description: buildMountedAppToolDescription(tool),
    parameters: normalizeMountedToolSchema(tool.input_schema),
    strict: true,
  }));
}

function buildResolveMountedToolsOpenAiTool(): OpenAiCompatibleFunctionTool {
  return {
    type: "function",
    function: {
      name: RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
      description:
        "Resolve connected personal or community app tools by search query. Use this before calling a mounted app tool that is not yet exposed.",
      parameters: RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA,
      strict: true,
    },
  };
}

function buildResolveMountedToolsResponsesTool(): ResponsesApiFunctionTool {
  return {
    type: "function",
    name: RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
    description:
      "Resolve connected personal or community app tools by search query. Use this before calling a mounted app tool that is not yet exposed.",
    parameters: RESOLVE_MOUNTED_TOOLS_INPUT_SCHEMA,
    strict: true,
  };
}

function buildMountedAppToolDescription(tool: RuntimeMountedMcpTool): string {
  const baseDescription =
    tool.description ||
    `Run ${tool.tool_name} on ${
      tool.scope === "user" ? "your" : "the active community"
    } ${tool.app_name} app.`;
  if (tool.scope === "user" && tool.risk_level !== "read") {
    return `[Approval required for write or sensitive actions] ${baseDescription}`;
  }
  return baseDescription;
}

function buildUserPlatformMountedAppsPromptBlock(
  mountedTools: RuntimeMountedMcpTool[],
): string {
  if (mountedTools.length === 0) return "";
  return [
    "",
    "Your connected app tools stay available across communities, but they are exposed lazily.",
    "Use `resolve_mounted_tools` with a short query when you need a connected personal app tool.",
    "Resolved personal app tools use the `me__` prefix when they are exposed to the model.",
    "Personal app tools that are marked write or sensitive require an approval flow and will refuse execution until that flow ships. Read tools can run directly.",
  ].join("\n");
}

function mapMountedToolsToOverlayRuntime(
  mountedTools: RuntimeMountedCommunityAppTool[],
): CommunityOverlayMountedTool[] {
  return mountedTools.map((tool) => ({
    namespacedToolName: tool.namespaced_tool_name,
    toolName: tool.tool_name,
    appName: tool.app_name,
    description: tool.description,
  }));
}

function mapCommunitySkillsToOverlayRuntime(
  attachedSkills: RuntimeCommunitySkillInventory[],
): CommunityOverlaySkillInventory[] {
  return attachedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
  }));
}

function mapSelectedCommunitySkillsToOverlayRuntime(
  selectedSkills: RuntimeSelectedCommunitySkill[],
): CommunityOverlaySelectedSkill[] {
  return selectedSkills.map((skill) => ({
    name: skill.name,
    mentionToken: skill.mention_token,
    description: skill.description,
    instructionsMd: skill.instructions_md,
  }));
}

function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function readFailureOutputPreview(details: unknown): string {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (!record) return "";
  const preferred = String(record.output_preview ?? "").trim();
  if (preferred) return preferred;
  const responseText = String(record.response_text ?? "").trim();
  if (responseText) return responseText;
  return "";
}

function summarizeToolArgsForLog(
  toolName: string,
  normalizedArgs: unknown,
): Record<string, unknown> {
  const record =
    normalizedArgs &&
    typeof normalizedArgs === "object" &&
    !Array.isArray(normalizedArgs)
      ? (normalizedArgs as Record<string, unknown>)
      : null;
  if (!record) return { toolName };
  const summary: Record<string, unknown> = {
    toolName,
    argKeys: Object.keys(record).sort(),
  };
  if (typeof record.path === "string" && record.path.trim()) {
    summary.path = record.path.trim().slice(0, 1024);
  }
  if (typeof record.cwd === "string" && record.cwd.trim()) {
    summary.cwd = record.cwd.trim().slice(0, 1024);
  }
  if (typeof record.offset === "number" && Number.isFinite(record.offset)) {
    summary.offset = Math.max(0, Math.floor(record.offset));
  }
  if (typeof record.limit === "number" && Number.isFinite(record.limit)) {
    summary.limit = Math.max(0, Math.floor(record.limit));
  }
  if (typeof record.preview_path === "string" && record.preview_path.trim()) {
    summary.previewPath = record.preview_path.trim().slice(0, 1024);
  }
  if (
    typeof record.preview_port === "number" &&
    Number.isFinite(record.preview_port)
  ) {
    summary.previewPort = Math.max(0, Math.floor(record.preview_port));
  }
  if (typeof record.command === "string") {
    summary.hasCommand = true;
  }
  return summary;
}

async function executeRetrievalHarnessTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  projectId?: string | null;
  runId: string;
  communityId: string | null;
  toolName: RetrievalToolName;
  args: Record<string, unknown>;
  workspaceSession?: WorkspaceSandboxSession | null;
  signal?: AbortSignal;
}): Promise<NativeToolExecutionResult> {
  let normalizedArgs: Record<string, unknown>;
  try {
    normalizedArgs = normalizeRegistryToolArguments(params.toolName, params.args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "invalid_tool_args",
      errorMessage: message || "Invalid tool arguments.",
    };
  }

  if (params.toolName === "community_search") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_search requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runAction(
        internal.communityArchive.searchCommunityKnowledgeInternal as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          query: String(normalizedArgs.query ?? "").trim(),
        },
      );
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        const reasonCode = String(
          (payload as { reason_code?: unknown } | null)?.reason_code ?? "",
        ).trim();
        const message = String(
          (payload as { message?: unknown } | null)?.message ?? "",
        ).trim();
        return {
          status: "error",
          exitCode: null,
          outputText: formatJsonToolOutput(payload),
          errorCode: reasonCode || "community_search_failed",
          errorMessage: message || "Community search failed.",
        };
      }
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_search_failed",
        errorMessage: message || "Community search failed.",
      };
    }
  }

  if (params.toolName === "community_write") {
    if (!params.communityId) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_required",
        errorMessage: "community_write requires an active community context.",
      };
    }
    try {
      const payload = await params.ctx.runMutation(
        api.community.publishCommunityAiFeedAgentPost as any,
        {
          userId: params.userId,
          authSubject: params.authSubject ?? undefined,
          communityId: params.communityId,
          postType: String(normalizedArgs.post_type ?? "observation"),
          title:
            typeof normalizedArgs.title === "string"
              ? normalizedArgs.title
              : undefined,
          body: String(normalizedArgs.body ?? ""),
          evidence: Array.isArray(normalizedArgs.evidence)
            ? normalizedArgs.evidence.map((value) => String(value ?? ""))
            : [],
        },
      );
      return {
        status: "ok",
        exitCode: 0,
        outputText: formatJsonToolOutput(payload),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "community_write_failed",
        errorMessage: message || "Community write failed.",
      };
    }
  }

  if (params.toolName === "web_research") {
    const result = await executeWebResearch({
      action:
        String(normalizedArgs.action ?? "").trim() === "find_in_page"
          ? "find_in_page"
          : String(normalizedArgs.action ?? "").trim() === "open_page"
            ? "open_page"
            : "search",
      query:
        typeof normalizedArgs.query === "string"
          ? normalizedArgs.query
          : undefined,
      url:
        typeof normalizedArgs.url === "string" ? normalizedArgs.url : undefined,
    });
    if (!result.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: String(result.outputPreview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
      details:
        Array.isArray(result.webSources) && result.webSources.length > 0
          ? { web_sources: result.webSources }
          : null,
    };
  }

  if (
    params.toolName === "list_dir" ||
    params.toolName === "read" ||
    params.toolName === "glob" ||
    params.toolName === "grep" ||
    params.toolName === "sha256" ||
    params.toolName === "write" ||
    params.toolName === "edit" ||
    params.toolName === "bash"
  ) {
    const workspaceSession = params.workspaceSession ?? null;
    const projectId = String(
      params.projectId ?? workspaceSession?.projectId ?? "",
    ).trim();
    if (!projectId || !workspaceSession) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "project_required",
        errorMessage: `${params.toolName} requires a bound project workspace.`,
      };
    }
    const result =
      params.toolName === "list_dir"
        ? await listDaytonaWorkspaceDirectory({
            config: workspaceSession.config,
            toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
            sandboxId: workspaceSession.providerSandboxId,
            relPath: String(normalizedArgs.path ?? ".") || ".",
            signal: params.signal,
          })
        : params.toolName === "read"
          ? await readDaytonaWorkspaceFile({
              config: workspaceSession.config,
              toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
              sandboxId: workspaceSession.providerSandboxId,
              relPath: String(normalizedArgs.path ?? "").trim(),
              offset:
                typeof normalizedArgs.offset === "number"
                  ? normalizedArgs.offset
                  : undefined,
              limit:
                typeof normalizedArgs.limit === "number"
                  ? normalizedArgs.limit
                  : undefined,
              signal: params.signal,
            })
          : params.toolName === "glob"
            ? await globDaytonaWorkspacePaths({
                config: workspaceSession.config,
                toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                sandboxId: workspaceSession.providerSandboxId,
                pattern: String(normalizedArgs.pattern ?? "").trim(),
                relPath:
                  typeof normalizedArgs.path === "string"
                    ? normalizedArgs.path
                    : undefined,
                signal: params.signal,
              })
            : params.toolName === "grep"
              ? await grepDaytonaWorkspaceFiles({
                  config: workspaceSession.config,
                  toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                  sandboxId: workspaceSession.providerSandboxId,
                  pattern: String(normalizedArgs.pattern ?? "").trim(),
                  relPath:
                    typeof normalizedArgs.path === "string"
                      ? normalizedArgs.path
                      : undefined,
                  signal: params.signal,
                })
              : params.toolName === "sha256"
                ? await sha256DaytonaWorkspaceFile({
                    config: workspaceSession.config,
                    toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                    sandboxId: workspaceSession.providerSandboxId,
                    relPath: String(normalizedArgs.path ?? "").trim(),
                    signal: params.signal,
                  })
                : params.toolName === "write"
                  ? await writeDaytonaWorkspaceFile({
                      config: workspaceSession.config,
                      toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                      sandboxId: workspaceSession.providerSandboxId,
                      relPath: String(normalizedArgs.path ?? "").trim(),
                      content: String(normalizedArgs.content ?? ""),
                      signal: params.signal,
                    })
                  : params.toolName === "edit"
                    ? await editDaytonaWorkspaceFile({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        relPath: String(normalizedArgs.path ?? "").trim(),
                        oldText: String(normalizedArgs.old_text ?? ""),
                        newText: String(normalizedArgs.new_text ?? ""),
                        replaceAll: normalizedArgs.replace_all === true,
                        signal: params.signal,
                      })
                    : await runDaytonaWorkspaceBash({
                        config: workspaceSession.config,
                        toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
                        sandboxId: workspaceSession.providerSandboxId,
                        command: String(normalizedArgs.command ?? ""),
                        relPath:
                          typeof normalizedArgs.cwd === "string"
                            ? normalizedArgs.cwd
                            : undefined,
                        signal: params.signal,
                      });
    if (!result.ok) {
      return {
        status: "error",
        exitCode: null,
        outputText: String(result.details?.output_preview ?? ""),
        errorCode: result.code,
        errorMessage: result.message,
      };
    }
    return {
      status: "ok",
      exitCode: result.exitCode,
      outputText: result.outputText || "(no output)",
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "tool_not_allowed",
    errorMessage: `${params.toolName} is not active in this run's capability profile.`,
  };
}

async function runProviderNativeToolCompletion(params: {
  ctx: any;
  userId: string;
  requestedModelId: string;
  inferenceSource: RuntimeInferenceSource;
  modelRef: string;
  messages: NativeToolAwareMessage[];
  maxTokens: number;
  openRouterTools: OpenAiCompatibleFunctionTool[];
  responsesApiTools: ChatgptCompatibleFunctionTool[];
  apiKeyOverride?: string | null;
  parallelToolCalls?: boolean;
  onReasoningSummaryTextDelta?: (params: {
    delta: string;
    summaryIndex: number;
  }) => Promise<void> | void;
  onReasoningSummaryPartAdded?: (params: {
    summaryIndex: number;
  }) => Promise<void> | void;
  signal?: AbortSignal;
}): Promise<
  NativeToolAwareCompletionSuccess<string> | RuntimeAgentLoopFailureInput
> {
  if (params.inferenceSource === "chatgpt") {
    return runChatgptNativeToolCompletion({
      ctx: params.ctx,
      userId: params.userId,
      modelId: params.requestedModelId,
      messages: params.messages as ChatgptToolAwareMessage[],
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      parallelToolCalls: params.parallelToolCalls,
      onReasoningSummaryTextDelta: params.onReasoningSummaryTextDelta,
      onReasoningSummaryPartAdded: params.onReasoningSummaryPartAdded,
      signal: params.signal,
    });
  }
  const parsedProviderRef = parseProviderModelRef(params.modelRef);
  if (
    params.inferenceSource === "platform" &&
    parsedProviderRef?.provider === "openai"
  ) {
    return runOpenAiNativeToolCompletion({
      modelId: parsedProviderRef.providerModel,
      messages: params.messages,
      maxTokens: params.maxTokens,
      tools: params.responsesApiTools,
      parallelToolCalls: params.parallelToolCalls,
      signal: params.signal,
    });
  }
  return runOpenRouterNativeToolCompletion({
    modelRef: params.modelRef,
    messages: params.messages,
    maxTokens: params.maxTokens,
    tools: params.openRouterTools,
    apiKeyOverride: params.apiKeyOverride,
    parallelToolCalls: params.parallelToolCalls,
    signal: params.signal,
  });
}

async function executeRetrievalAgentLoop(
  params: RuntimeCommunityPromptFields & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    maxTokens: number;
    runId: string;
    harnessName: "chat_tools";
    loopBudget: RuntimeKernelBudget;
    allowedToolNames: readonly RetrievalToolName[];
    communitySystemPrompt?: string | null;
    projectId?: string | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    authSubject?: string | null;
    workspaceSession?: WorkspaceSandboxSession | null;
    apiKeyOverride?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  const projectContext = await resolveWorkspaceProjectContext({
    ctx: params.ctx,
    projectId: params.projectId,
    authSubject: params.authSubject,
  });
  const now = new Date();
  const runtimeTimeZone = "UTC";
  const runtimeDateTimeIso = now.toISOString();
  const runtimeDateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: runtimeTimeZone,
  }).format(now);
  const terminalSnapshot =
    params.projectId && params.allowedToolNames.includes("terminal_start")
      ? await params.ctx.runAction(
          internal.workspaceTerminals
            .reconcileProjectWorkspaceTerminalsInternal as any,
          {
            ownerId: params.userId,
            projectId: params.projectId,
          },
        )
      : { active: [] };

  const mountedUserPlatformAppTools = normalizeRuntimeMountedUserPlatformAppTools(
    await params.ctx.runQuery(
      internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
      {
        userId: params.userId as any,
      },
    ),
  );
  const runtimeMountedUserPlatformAppTools: RuntimeMountedMcpTool[] =
    mountedUserPlatformAppTools.map((tool) => ({
      scope: "user",
      mount_id: tool.user_platform_app_mount_id,
      runtime_tool_name: `me__${tool.namespaced_tool_name}`,
      developer_app_id: tool.developer_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
  const mountedCommunityAppTools = params.communityId
    ? normalizeRuntimeMountedCommunityAppTools(
        await params.ctx.runQuery(
          internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal,
          {
            userId: params.userId as any,
            communityId: params.communityId as any,
          },
        ),
      )
    : [];
  const runtimeMountedCommunityAppTools: RuntimeMountedMcpTool[] =
    mountedCommunityAppTools.map((tool) => ({
      scope: "community",
      mount_id: tool.community_app_mount_id,
      runtime_tool_name: tool.namespaced_tool_name,
      developer_app_id: tool.developer_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
  const runtimeMountedTools = [
    ...runtimeMountedUserPlatformAppTools,
    ...runtimeMountedCommunityAppTools,
  ];
  const explicitCommunitySkillMentions = new Set(
    extractExplicitSkillMentions(params.messages),
  );
  const attachedCommunitySkills = params.communityId
    ? normalizeRuntimeCommunitySkillInventory(
        await params.ctx.runQuery(
          internal.communitySkillAttachments
            .listRuntimeCommunitySkillInventoryInternal,
          {
            userId: params.userId as any,
            authSubject: params.authSubject ?? undefined,
            communityId: params.communityId as any,
          },
        ),
      )
    : [];
  const selectedCommunitySkills =
    params.communityId && explicitCommunitySkillMentions.size > 0
      ? normalizeRuntimeSelectedCommunitySkills(
          await params.ctx.runQuery(
            internal.communitySkillAttachments
              .listRuntimeSelectedCommunitySkillsInternal,
            {
              userId: params.userId as any,
              authSubject: params.authSubject ?? undefined,
              communityId: params.communityId as any,
              requestedMentionTokens: Array.from(explicitCommunitySkillMentions),
            },
          ),
        )
      : [];
  const overlayRuntimeState = buildCommunityOverlayRuntimeState({
    mountedTools: mapMountedToolsToOverlayRuntime(mountedCommunityAppTools),
    attachedSkills: mapCommunitySkillsToOverlayRuntime(attachedCommunitySkills),
    selectedSkills: mapSelectedCommunitySkillsToOverlayRuntime(
      selectedCommunitySkills,
    ),
  });
  const executionSession = createPolyNetExecutionSession({
    ctx: params.ctx,
    userId: params.userId,
    authSubject: params.authSubject,
    projectId: params.projectId,
    threadId: params.threadId,
    runId: params.runId,
    mountedTools: runtimeMountedTools,
    mountedPromptSuffix: `${buildUserPlatformMountedAppsPromptBlock(
      runtimeMountedUserPlatformAppTools,
    )}${overlayRuntimeState.systemPromptSuffix}`,
    initialWorkspaceSession: params.workspaceSession ?? null,
    appendRunEvent: params.appendRunEvent,
    touchRunHeartbeat: params.touchRunHeartbeat,
    loadConnectionBundle: async ({ developerAppId }) =>
      (await params.ctx.runQuery(
        internal.appConnections.getDecryptedDeveloperAppConnectionBundleInternal,
        {
          developerAppId: developerAppId as any,
        },
      )) as {
        app: any;
        connection: any;
        secret: string | null;
      } | null,
  });

  const baseSystemPrompt = buildWorkspaceRuntimeSystemPrompt({
    loopBudget: params.loopBudget,
    allowedToolNames: params.allowedToolNames,
    harnessName: params.harnessName,
    communityId: params.communityId,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    customCommunitySystemPrompt: params.communitySystemPrompt,
    projectLabel: projectContext.label,
    projectDescription: projectContext.description,
    threadWorkingState: params.threadWorkingState,
    activeBackgroundTerminals: Array.isArray(terminalSnapshot?.active)
      ? terminalSnapshot.active.map((terminal: any) => ({
          id: String(terminal?.id ?? "").trim(),
          status: terminal?.status,
          command: String(terminal?.command ?? "").trim(),
          cwd: typeof terminal?.cwd === "string" ? terminal.cwd : null,
          outputTail:
            typeof terminal?.output_tail === "string"
              ? terminal.output_tail
              : null,
          exitCode:
            typeof terminal?.exit_code === "number" ? terminal.exit_code : null,
        }))
      : [],
    currentDateTimeIso: runtimeDateTimeIso,
    currentDateLabel: runtimeDateLabel,
    currentTimeZone: runtimeTimeZone,
  });
  const systemPrompt = `${baseSystemPrompt}${executionSession.buildPromptSuffix()}`;
  const nativeTranscript: NativeToolAwareMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  const buildActiveProviderTools = () =>
    executionSession.buildProviderTools({
      allowedToolNames: params.allowedToolNames,
      buildFixedOpenAiTools: buildOpenAiFunctionTools,
      buildFixedResponsesTools: buildResponsesApiFunctionTools,
      buildMountedOpenAiTools: buildMountedAppOpenAiTools,
      buildMountedResponsesTools: buildMountedAppResponsesTools,
      buildResolverOpenAiTool: buildResolveMountedToolsOpenAiTool,
      buildResolverResponsesTool: buildResolveMountedToolsResponsesTool,
    });
  const initialProviderTools = buildActiveProviderTools();
  const parallelReadToolsEnabled = readRuntimeBooleanFlag(
    RUNTIME_PARALLEL_READ_TOOLS_FLAG,
    true,
  );
  let reasoningSummaryStreamCount = 0;
  let reasoningSummaryPartAddedCount = 0;
  let reasoningSummaryTextDeltaCount = 0;
  let activeToolBatchTelemetry: ActiveRuntimeToolBatchTelemetry | null = null;

  const flushActiveToolBatchTelemetry = async (options: {
    terminalStopReason?: string | null;
    terminalFailureCode?: string | null;
    pendingToolCallId?: string | null;
  } = {}): Promise<void> => {
    if (!activeToolBatchTelemetry) return;
    const telemetry = activeToolBatchTelemetry;
    activeToolBatchTelemetry = null;
    try {
      await params.appendRunEvent({
        eventType: "tool_batch_telemetry",
        eventKey: `${params.runId}:tool_batch_telemetry:${telemetry.startingIteration}`,
        payload: buildToolBatchTelemetryPayload({
          runId: params.runId,
          harnessName: params.harnessName,
          telemetry,
          terminalStopReason: options.terminalStopReason ?? null,
          terminalFailureCode: options.terminalFailureCode ?? null,
          pendingToolCallId: options.pendingToolCallId ?? null,
        }),
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  };

  const markActiveBatchToolStarted = (params: {
    providerCallId: string;
    toolName: string;
    startedAtMs: number;
  }): void => {
    if (!activeToolBatchTelemetry) return;
    const record =
      activeToolBatchTelemetry.recordsByCallId.get(params.providerCallId);
    if (!record) return;
    record.toolName = params.toolName;
    record.startedAtMs = params.startedAtMs;
  };

  const markActiveBatchToolFinished = (params: {
    providerCallId: string;
    finishedAtMs: number;
  }): void => {
    if (!activeToolBatchTelemetry) return;
    const record =
      activeToolBatchTelemetry.recordsByCallId.get(params.providerCallId);
    if (!record) return;
    record.finishedAtMs = params.finishedAtMs;
    if (typeof record.startedAtMs === "number") {
      record.durationMs = Math.max(0, params.finishedAtMs - record.startedAtMs);
    }
  };

  const initializeActiveToolBatchTelemetry = (params: {
    steps: Array<{ providerCallId: string; toolName: string }>;
    startingIteration: number;
    isBatch: boolean;
    remainingToolBudget: number;
    schedule: RuntimeToolSchedulePlan;
    actualExecutionMode: RuntimeToolBatchExecutionMode;
  }): void => {
    activeToolBatchTelemetry = {
      startingIteration: params.startingIteration,
      batchCallCount: params.steps.length,
      isBatch: params.isBatch,
      remainingToolBudget: params.remainingToolBudget,
      parallelReadToolsEnabled,
      scheduledAtMs: Date.now(),
      schedule: params.schedule,
      actualExecutionMode: params.actualExecutionMode,
      completedToolCount: 0,
      recordsByCallId: new Map(
        params.steps.map((step, index) => [
          step.providerCallId,
          {
            providerCallId: step.providerCallId,
            toolName: step.toolName,
            index,
            iteration: null,
            startedAtMs: null,
            finishedAtMs: null,
            durationMs: null,
            status: null,
            errorCode: null,
            madeProgress: null,
            repeatedCallCount: null,
            consecutiveFailureCount: null,
            consecutiveNoProgressCount: null,
          },
        ]),
      ),
    };
  };
  if (runtimeMountedUserPlatformAppTools.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "platform_app_tools_resolved",
        eventKey: `${params.runId}:platform_app_tools_resolved:1`,
        payload: {
          run_id: params.runId,
          user_scope_id: params.userId ?? null,
          tools: runtimeMountedUserPlatformAppTools.map((tool) => ({
            runtime_tool_name: tool.runtime_tool_name,
            app_name: tool.app_name,
            tool_name: tool.tool_name,
            namespaced_tool_name: tool.namespaced_tool_name,
            risk_level: tool.risk_level,
          })),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (mountedCommunityAppTools.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "community_app_tools_resolved",
        eventKey: `${params.runId}:community_app_tools_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          tools: mountedCommunityAppTools.map((tool) => ({
            app_name: tool.app_name,
            tool_name: tool.tool_name,
            namespaced_tool_name: tool.namespaced_tool_name,
            risk_level: tool.risk_level,
          })),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  if (attachedCommunitySkills.length > 0) {
    try {
      await params.appendRunEvent({
        eventType: "community_skills_resolved",
        eventKey: `${params.runId}:community_skills_resolved:1`,
        payload: {
          run_id: params.runId,
          community_scope_id: params.communityId ?? null,
          skills: attachedCommunitySkills.map((skill) => ({
            skill_name: skill.name,
            skill_mention_token: skill.mention_token,
          })),
          selected_skill_mention_tokens: selectedCommunitySkills.map(
            (skill) => skill.mention_token,
          ),
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  }
  try {
    await params.appendRunEvent({
      eventType: "provider_tool_surface_resolved",
      eventKey: `${params.runId}:provider_tool_surface_resolved:initial`,
      payload: {
        run_id: params.runId,
        stage: "initial",
        fixed_allowed_tool_count: params.allowedToolNames.length,
        mounted_catalog_count:
          runtimeMountedUserPlatformAppTools.length +
          mountedCommunityAppTools.length,
        active_tool_count: initialProviderTools.activeToolNames.length,
        exposed_mounted_tool_count: initialProviderTools.activeToolNames.filter(
          (toolName) =>
            runtimeMountedUserPlatformAppTools.some(
              (tool) => tool.runtime_tool_name === toolName,
            ) ||
            runtimeMountedCommunityAppTools.some(
              (tool) => tool.runtime_tool_name === toolName,
            ),
        ).length,
        resolver_enabled: initialProviderTools.activeToolNames.includes(
          RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
        ),
        tool_policy_enforcement: "metadata_only",
        tool_policy_summary: initialProviderTools.activeToolPolicySummary,
      },
    });
  } catch {
    // Best-effort runtime evidence only.
  }
  try {
    const throwIfCancelled = async (): Promise<void> => {
      await throwIfRuntimeRunCancelled({
        ctx: params.ctx,
        ownerId: params.userId,
        runId: params.runId,
      });
    };
    const loopStartedAt = Date.now();
    const loopResult = await runNativeRuntimeKernel<string>({
      messages: nativeTranscript,
      budget: params.loopBudget,
      runCompletion: async (messages) => {
        let completion:
          | NativeToolAwareCompletionSuccess<string>
          | RuntimeAgentLoopFailureInput;
        const reasoningSummaryEmitter = createRuntimeReasoningSummaryEmitter({
          runId: params.runId,
          summaryStreamId: `${params.runId}:tool_completion:${reasoningSummaryStreamCount}`,
          appendRunEvent: params.appendRunEvent,
        });
        reasoningSummaryStreamCount += 1;
        try {
          const providerTools = buildActiveProviderTools();
          completion = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            operation: async (signal) =>
              await runProviderNativeToolCompletion({
                ctx: params.ctx,
                userId: params.userId,
                requestedModelId: params.requestedModelId,
                inferenceSource: params.inferenceSource,
                modelRef: params.modelRef,
                messages,
                maxTokens: params.maxTokens,
                openRouterTools: providerTools.openAiTools,
                responsesApiTools: providerTools.responsesTools,
                apiKeyOverride: params.apiKeyOverride,
                parallelToolCalls: parallelReadToolsEnabled,
                onReasoningSummaryPartAdded: async ({ summaryIndex }) => {
                  try {
                    reasoningSummaryPartAddedCount += 1;
                    await reasoningSummaryEmitter.onPartAdded(summaryIndex);
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                onReasoningSummaryTextDelta: async ({
                  delta,
                  summaryIndex,
                }) => {
                  if (!delta) return;
                  try {
                    reasoningSummaryTextDeltaCount += 1;
                    await reasoningSummaryEmitter.onTextDelta(
                      delta,
                      summaryIndex,
                    );
                  } catch {
                    // Best-effort UX event; do not fail the loop if summary persistence fails.
                  }
                },
                signal,
              }),
          });
          await throwIfCancelled();
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              ok: false,
              status: 409,
              code: USER_CANCELLED_RUNTIME_CODE,
              stopReason: "user_cancelled",
              message: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_provider_completion_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            projectId: params.projectId ?? undefined,
            communityId: params.communityId ?? undefined,
            inferenceSource: params.inferenceSource,
            requestedModelId: params.requestedModelId,
            modelRef: params.modelRef,
            allowedToolNames: params.allowedToolNames,
          });
          return {
            ok: false,
            status: 502,
            code: "agent_loop_provider_crash",
            stopReason: "model_error",
            message: `Provider completion crashed: ${summary.message}`,
          };
        }
        if (!completion.ok) return completion;
        const providerTools = buildActiveProviderTools();
        const unknownToolCall = getNativeToolCompletionToolCalls(completion).find(
          (toolCall) => !providerTools.activeToolNames.includes(toolCall.toolName),
        );
        if (unknownToolCall) {
          return {
            ok: false,
            status: 502,
            code: "invalid_model_output",
            stopReason: "invalid_model_output",
            message: "Provider returned an unknown tool name.",
            pendingToolCallId: unknownToolCall.providerCallId,
            pendingToolName: unknownToolCall.toolName,
          };
        }
        return completion as NativeToolAwareCompletionSuccess<string>;
      },
      normalizeToolArguments: (toolName, rawArgs) => {
        return executionSession.normalizeToolArguments({
          toolName,
          rawArgs,
          allowedToolNames: params.allowedToolNames,
          normalizeFixedToolArguments: normalizeRegistryToolArguments,
        });
      },
      onToolBatchResolved: async ({
        steps,
        isBatch,
        remainingToolBudget,
        toolStepCount,
      }) => {
        const providerToolSurface = buildActiveProviderTools();
        const schedule = classifyRuntimeToolSchedule({
          toolCalls: steps.map((step, index) => ({
            providerCallId: step.providerCallId,
            toolName: step.toolName,
            index,
          })),
          policies: providerToolSurface.activeToolPolicies,
          enableParallelReadBatches: parallelReadToolsEnabled,
        });
        const actualExecutionMode: RuntimeToolBatchExecutionMode =
          schedule.executionMode === "parallel_read_batch"
            ? "parallel"
            : "serial";
        initializeActiveToolBatchTelemetry({
          steps,
          startingIteration: toolStepCount + 1,
          isBatch,
          remainingToolBudget,
          schedule,
          actualExecutionMode,
        });
        try {
          await params.appendRunEvent({
            eventType: "tool_schedule_resolved",
            eventKey: `${params.runId}:tool_schedule_resolved:${
              toolStepCount + 1
            }:${steps.map((step) => step.providerCallId).join(":")}`,
            payload: {
              run_id: params.runId,
              harness_name: params.harnessName,
              decision: schedule.decision,
              execution_mode: schedule.executionMode,
              reason: schedule.reason,
              parallel_read_tools_enabled: parallelReadToolsEnabled,
              is_batch: isBatch,
              batch_call_count: steps.length,
              starting_iteration: toolStepCount + 1,
              remaining_tool_budget: remainingToolBudget,
              summary: schedule.summary,
              calls: schedule.calls,
            },
          });
          return {
            executionMode: actualExecutionMode,
          };
        } catch {
          // Best-effort runtime evidence only.
        }
        return { executionMode: actualExecutionMode };
      },
      executeTool: async ({ providerCallId, toolName, normalizedArgs }) => {
        markActiveBatchToolStarted({
          providerCallId,
          toolName,
          startedAtMs: Date.now(),
        });
        try {
          try {
            await throwIfCancelled();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            throw error;
          }
        if (toolName === RESOLVE_MOUNTED_TOOLS_TOOL_NAME) {
          const resolution = executionSession.resolveMountedToolExposure(
            normalizedArgs as ReturnType<typeof normalizeResolveMountedToolsArguments>,
          );
          try {
            const providerToolSurface = buildActiveProviderTools();
            await params.appendRunEvent({
              eventType: "mounted_tool_exposure_resolved",
              payload: {
                query: resolution.resolution.query,
                scope: resolution.resolution.scope,
                requested_limit: resolution.resolution.requestedLimit,
                total_catalog_count: resolution.resolution.totalCatalogCount,
                total_matched_count: resolution.resolution.totalMatchedCount,
                total_exposed_count: resolution.resolution.totalExposedCount,
                newly_exposed_tool_names:
                  resolution.resolution.newlyExposedTools.map(
                    (tool) => tool.runtime_tool_name,
                  ),
                already_exposed_tool_names:
                  resolution.resolution.alreadyExposedTools,
                remaining_exposure_capacity:
                  resolution.resolution.remainingExposureCapacity,
                active_provider_tool_count:
                  providerToolSurface.activeToolNames.length,
                tool_policy_enforcement: "metadata_only",
                tool_policy_summary:
                  providerToolSurface.activeToolPolicySummary,
              },
            });
          } catch {
            // Best-effort runtime evidence only.
          }
          return {
            status: "ok" as const,
            exitCode: 0,
            outputText: resolution.outputText,
            errorCode: null,
            errorMessage: null,
            details: {
              mounted_tool_resolution: resolution.resolution,
            },
          };
        }
        const isFixedTool = params.allowedToolNames.includes(
          toolName as RetrievalToolName,
        );
        if (!isFixedTool) {
          const mountedTool = executionSession.getMountedTool(toolName);
          if (!mountedTool) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_not_found",
              errorMessage: `${toolName} is not active for this runtime.`,
            };
          }
          if (mountedTool.scope === "user" && mountedTool.risk_level !== "read") {
            const message =
              "Personal write and sensitive app tools still require the upcoming approval flow. This tool was not executed.";
            return {
              status: "error" as const,
              exitCode: null,
              outputText: message,
              errorCode: "user_platform_app_tool_approval_required",
              errorMessage: message,
              details: {
                approval_required: true,
                user_platform_app: {
                  user_platform_app_mount_id: String(mountedTool.mount_id),
                  developer_app_id: String(mountedTool.developer_app_id),
                  app_name: mountedTool.app_name,
                  tool_name: mountedTool.tool_name,
                  namespaced_tool_name: mountedTool.namespaced_tool_name,
                  risk_level: mountedTool.risk_level,
                },
              },
            };
          }
          if (mountedTool.scope === "community" && mountedTool.risk_level !== "read") {
            if (!params.communityId) {
              return {
                status: "error" as const,
                exitCode: null,
                outputText: "",
                errorCode: "community_app_tool_not_found",
                errorMessage: `${toolName} is not active for this community lens.`,
              };
            }
            await params.ctx.runQuery(
              internal.communityAppMounts.assertCommunityManagerAccessInternal,
              {
                userId: params.userId as any,
                communityId: params.communityId as any,
              },
            );
          }
          try {
            const toolResult = await runAbortableWithRuntimeCancellation({
              ctx: params.ctx,
              ownerId: params.userId,
              runId: params.runId,
              operation: async (signal) =>
                await executionSession.executeMountedTool({
                  runtimeToolName: toolName,
                  argumentsObject: normalizedArgs,
                  signal,
                }),
            });
            await throwIfCancelled();
            return toolResult as NativeToolExecutionResult;
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_mounted_app_tool_execution_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              communityId: params.communityId ?? undefined,
              developerAppId: mountedTool.developer_app_id,
              mountedToolScope: mountedTool.scope,
              mountedToolName: mountedTool.runtime_tool_name,
              toolName,
              ...summarizeToolArgsForLog(toolName, normalizedArgs),
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "mounted_app_tool_execute_failed",
              errorMessage: `Mounted app tool execution failed: ${summary.message}`,
            };
          }
        }

        if (
          toolName === "terminal_start" ||
          toolName === "terminal_read" ||
          toolName === "terminal_write" ||
          toolName === "terminal_stop"
        ) {
          try {
            const toolResult = await executionSession.executeTerminalTool({
              toolName,
              normalizedArgs,
            });
            await throwIfCancelled();
            return toolResult;
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_terminal_tool_execution_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              communityId: params.communityId ?? undefined,
              projectId: params.projectId ?? undefined,
              ...summarizeToolArgsForLog(toolName, normalizedArgs),
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "terminal_operation_failed",
              errorMessage: `Terminal operation failed: ${summary.message}`,
            };
          }
        }

        if (isComputerUseToolName(toolName as RetrievalToolName)) {
          try {
            const toolResult = await runAbortableWithRuntimeCancellation({
              ctx: params.ctx,
              ownerId: params.userId,
              runId: params.runId,
              operation: async (signal) =>
                await executionSession.executeComputerTool({
                  toolName,
                  normalizedArgs,
                  signal,
                }),
            });
            await throwIfCancelled();
            return toolResult;
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_computer_tool_execution_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              communityId: params.communityId ?? undefined,
              projectId: params.projectId ?? undefined,
              ...summarizeToolArgsForLog(toolName, normalizedArgs),
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "computer_tool_execute_failed",
              errorMessage: `Computer tool execution failed: ${summary.message}`,
            };
          }
        }

        const needsWorkspaceSession = requiresWorkspaceSandbox(
          toolName as RetrievalToolName,
        );

        if (needsWorkspaceSession && !executionSession.hasWorkspaceSession()) {
          try {
            await throwIfCancelled();
          } catch (error) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error instanceof Error ? error.message : "Cancelled",
            };
          }
          let created: Awaited<
            ReturnType<typeof executionSession.ensureWorkspaceForTool>
          >;
          try {
            created = await executionSession.ensureWorkspaceForTool({
              toolName,
            });
          } catch (error) {
            const summary = summarizeErrorForLog(error);
            logStructuredError("agent_loop_workspace_session_create_crashed", {
              error,
              runId: params.runId,
              threadId: params.threadId ?? undefined,
              toolName,
              projectId: params.projectId ?? undefined,
              communityId: params.communityId ?? undefined,
            });
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: "workspace_session_create_failed",
              errorMessage: `Workspace session create failed: ${summary.message}`,
            };
          }
          if (!created.ok) {
            return {
              status: "error",
              exitCode: null,
              outputText: readFailureOutputPreview((created as any).details),
              errorCode: created.code,
              errorMessage: created.message,
            };
          }
          try {
            await throwIfCancelled();
          } catch (error) {
            if (isRuntimeRunCancelledError(error)) {
              return {
                status: "error",
                exitCode: null,
                outputText: "",
                errorCode: USER_CANCELLED_RUNTIME_CODE,
                errorMessage: error.message,
              };
            }
            throw error;
          }
        }

        try {
          const toolResult = await runAbortableWithRuntimeCancellation({
            ctx: params.ctx,
            ownerId: params.userId,
            runId: params.runId,
            operation: async (signal) =>
              await executeRetrievalHarnessTool({
                ctx: params.ctx,
                userId: params.userId,
                communityId: params.communityId ?? null,
                authSubject: params.authSubject,
                projectId: params.projectId,
                runId: params.runId,
                toolName: toolName as RetrievalToolName,
                args: normalizedArgs,
                workspaceSession: executionSession.getWorkspaceSession(),
                signal,
              }),
          });
          await throwIfCancelled();
          return toolResult;
        } catch (error) {
          if (isRuntimeRunCancelledError(error)) {
            return {
              status: "error",
              exitCode: null,
              outputText: "",
              errorCode: USER_CANCELLED_RUNTIME_CODE,
              errorMessage: error.message,
            };
          }
          const summary = summarizeErrorForLog(error);
          logStructuredError("agent_loop_tool_execution_crashed", {
            error,
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            communityId: params.communityId ?? undefined,
            projectId: params.projectId ?? undefined,
            ...summarizeToolArgsForLog(toolName, normalizedArgs),
          });
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "workspace_tool_execute_failed",
            errorMessage: `Workspace tool execution failed: ${summary.message}`,
          };
        }
        } finally {
          markActiveBatchToolFinished({
            providerCallId,
            finishedAtMs: Date.now(),
          });
        }
      },
      onToolStepStart: async ({ iteration, step }) => {
        if (activeToolBatchTelemetry) {
          const record =
            activeToolBatchTelemetry.recordsByCallId.get(step.providerCallId);
          if (record) {
            record.iteration = iteration;
          }
        }
        await appendWorkspaceToolCallStarted({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          communityId: params.communityId,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
        });
      },
      onToolStepFinish: async ({
        iteration,
        step,
        toolResult,
        toolResultEnvelope,
        madeProgress,
        repeatedCallCount,
        consecutiveFailureCount,
        consecutiveNoProgressCount,
      }) => {
        if (activeToolBatchTelemetry) {
          const record =
            activeToolBatchTelemetry.recordsByCallId.get(step.providerCallId);
          if (record) {
            record.iteration = iteration;
            record.status = toolResult.status;
            record.errorCode = toolResult.errorCode;
            record.madeProgress = madeProgress;
            record.repeatedCallCount = repeatedCallCount;
            record.consecutiveFailureCount = consecutiveFailureCount;
            record.consecutiveNoProgressCount = consecutiveNoProgressCount;
          }
        }
        await appendWorkspaceToolCallFinished({
          appendRunEvent: params.appendRunEvent,
          runId: params.runId,
          harnessName: params.harnessName,
          iteration,
          providerCallId: step.providerCallId,
          toolName: step.toolName,
          args: step.normalizedArgs,
          toolResult,
          toolResultEnvelope,
        });
        if (toolResult.status !== "ok") {
          console.error("tool_loop_tool_call_failed", {
            runId: params.runId,
            threadId: params.threadId ?? undefined,
            harnessName: params.harnessName,
            providerCallId: step.providerCallId,
            iteration,
            communityId: params.communityId ?? undefined,
            projectId: params.projectId ?? undefined,
            errorCode: toolResult.errorCode,
            errorMessage: toolResult.errorMessage,
            exitCode: toolResult.exitCode,
            hasOutputText: Boolean(toolResult.outputText),
            outputLength: String(toolResult.outputText ?? "").length,
            ...summarizeToolArgsForLog(step.toolName, step.normalizedArgs),
          });
        }
        if (activeToolBatchTelemetry) {
          activeToolBatchTelemetry.completedToolCount += 1;
          if (
            activeToolBatchTelemetry.completedToolCount >=
            activeToolBatchTelemetry.batchCallCount
          ) {
            await flushActiveToolBatchTelemetry();
          }
        }
      },
    });
    const loopFailure = loopResult.ok
      ? null
      : (loopResult as RuntimeKernelFailure<string>);
    let terminalFailureCode: string | null = null;
    let pendingToolCallId: string | null = null;
    let loopErrorPayload: Record<string, unknown> = {};
    if (loopFailure) {
      terminalFailureCode = loopFailure.code;
      pendingToolCallId = loopFailure.pendingToolCallId ?? null;
      loopErrorPayload = {
        error_code: loopFailure.code,
        error_message: loopFailure.message,
      };
    }
    if (activeToolBatchTelemetry) {
      await flushActiveToolBatchTelemetry({
        terminalStopReason: loopResult.stopReason,
        terminalFailureCode,
        pendingToolCallId,
      });
    }

    try {
      await params.appendRunEvent({
        eventType: "agent_loop_stopped",
        eventKey: `${params.runId}:agent_loop_stopped:1`,
        payload: {
          run_id: params.runId,
          harness: {
            kind: params.harnessName,
          },
          stop_reason: loopResult.stopReason,
          step_count: loopResult.stepCount,
          total_latency_ms: Date.now() - loopStartedAt,
          status: loopResult.ok ? "ok" : "error",
          ...loopErrorPayload,
        },
      });
    } catch {
      // Best-effort runtime evidence only.
    }
    return loopResult;
  } catch (error) {
    if (isRuntimeRunCancelledError(error)) {
      if (activeToolBatchTelemetry) {
        await flushActiveToolBatchTelemetry({
          terminalStopReason: "user_cancelled",
          terminalFailureCode: USER_CANCELLED_RUNTIME_CODE,
        });
      }
      return {
        ok: false,
        status: 409,
        code: USER_CANCELLED_RUNTIME_CODE,
        stopReason: "user_cancelled",
        message: error.message,
        promptTokens: null,
        completionTokens: null,
        transcript: [...nativeTranscript],
        stepCount: 0,
        steps: [],
      };
    }
    const summary = summarizeErrorForLog(error);
    logStructuredError("agent_loop_unhandled_crash", {
      error,
      runId: params.runId,
      threadId: params.threadId ?? undefined,
      projectId: params.projectId ?? undefined,
      communityId: params.communityId ?? undefined,
      inferenceSource: params.inferenceSource,
      requestedModelId: params.requestedModelId,
      allowedToolNames: params.allowedToolNames,
    });
    try {
      await params.appendRunEvent({
        eventType: "agent_loop_internal_error",
        eventKey: `${params.runId}:agent_loop_internal_error:1`,
        payload: {
          run_id: params.runId,
          inference_source: params.inferenceSource,
          model_id: params.requestedModelId,
          error_name: summary.name,
          error_message: summary.message,
          stack_preview: summary.stackPreview,
        },
      });
    } catch {
      // ignore best-effort debug event persistence failures
    }
    if (activeToolBatchTelemetry) {
      await flushActiveToolBatchTelemetry({
        terminalStopReason: "model_error",
        terminalFailureCode: "agent_loop_internal_error",
      });
    }
    return {
      ok: false,
      status: 502,
      code: "agent_loop_internal_error",
      stopReason: "model_error",
      message: `Agent loop crashed: ${summary.message}`,
      promptTokens: null,
      completionTokens: null,
      transcript: [...nativeTranscript],
      stepCount: 0,
      steps: [],
    };
  } finally {
    await executionSession.dispose();
  }
}

async function executeChatToolsAgentLoop(
  params: RuntimeCommunityPromptFields & {
    ctx: any;
    req: Request;
    userId: string;
    threadId?: string | null;
    authSubject?: string | null;
    projectId?: string | null;
    requestedModelId: string;
    inferenceSource: RuntimeInferenceSource;
    modelRef: string;
    messages: InferenceMessage[];
    maxTokens: number;
    runId: string;
    allowedToolNames: readonly RetrievalToolName[];
    communitySystemPrompt?: string | null;
    threadWorkingState?: ThreadWorkingStatePrompt | null;
    apiKeyOverride?: string | null;
    appendRunEvent: (params: {
      eventType: string;
      eventKey?: string;
      payload: Record<string, unknown>;
    }) => Promise<void>;
    touchRunHeartbeat?: () => Promise<void>;
  },
): Promise<RuntimeAgentLoopSuccess | RuntimeAgentLoopFailure> {
  return await executeRetrievalAgentLoop({
    ...params,
    harnessName: "chat_tools",
    loopBudget: CHAT_TOOLS_RUNTIME_KERNEL_BUDGET,
  });
}

export type { DaytonaConfig };
export {
  executeChatToolsAgentLoop,
  listDaytonaWorkspaceDirectory,
  loadDaytonaConfig,
};
