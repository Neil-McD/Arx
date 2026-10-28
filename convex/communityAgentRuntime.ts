import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import {
  buildCommunityAgentFunctionTools,
  CANONICAL_COMMUNITY_AGENT_KEY,
  COMMUNITY_AGENT_TOOL_NAMES,
  normalizeCommunityAgentToolArguments,
  type CommunityAgentToolName,
} from "../shared/communityAgentToolProtocol";
import type { NativeToolAwareCompletionSuccess } from "../shared/nativeToolProtocol";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelFailureInput,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";
import {
  COMMUNITY_AGENT_CYCLE_ROLES,
  getCommunityAgentRoleDefinition,
  isCommunityAgentRoleKey,
  type CommunityAgentRoleDefinition,
  type CommunityAgentRoleKey,
} from "../shared/communityAgentRoles";
import { buildCommunityAgentStewardPromptBundle } from "../shared/communityAgentStewardPrompt";
import { normalizeIdValue, toIsoString } from "./communityCore";
import { readCanonicalCommunityAgentContext } from "./communityAgentContext";
import { requireLiveCommunityForCognitionWrite } from "./communityCognitionLifecycle";
import { COMMUNITY_OWNER_FUNDED_MODEL_ID } from "../shared/founderInference";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { resolveCommunityInferenceModelForReceipt } from "./founderInferenceCore";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { founderInferenceBudgetFailureCode } from "./founderInferenceBudget";
import { buildRuntimeInputBudgetEvidence } from "../shared/runtimeInputBudget.ts";
import { buildRuntimeContextProjectionEvidence } from "../shared/providerContextWindow.ts";

// The steward settles every digest item in one write, so its answer grows with
// the digest, and the model's reasoning counts against the same output limit. A
// fixed 1,600-token limit cut long settlements off mid-JSON (POL-18).
const STEWARD_BASE_OUTPUT_TOKENS = 2_000;
const STEWARD_OUTPUT_TOKENS_PER_DIGEST_ITEM = 450;
const STEWARD_MAX_OUTPUT_TOKENS = 48_000;

export function stewardMaxOutputTokens(compilerWindow: unknown): number {
  const items = (compilerWindow as { latest_digest?: { items?: unknown } } | undefined)?.latest_digest?.items;
  const itemCount = Array.isArray(items) ? items.length : 0;
  return Math.min(
    STEWARD_MAX_OUTPUT_TOKENS,
    STEWARD_BASE_OUTPUT_TOKENS + Math.max(1, itemCount) * STEWARD_OUTPUT_TOKENS_PER_DIGEST_ITEM,
  );
}


const COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS = 12;
const COMMUNITY_AGENT_RUNTIME_MAX_OUTPUT_CHARS = 12_000;
const COMMUNITY_AGENT_RUNTIME_MAX_ERROR_CHARS = 500;
const COMMUNITY_AGENT_RUNNING_RUN_STALE_MS = 30 * 60 * 1000;
const internalRefs = internal as any;

type CommunityAgentTriggerType = "manual_internal" | "heartbeat" | "event";

type CommunityAgentResolvedContext = {
  communityId: any;
  communityName: string | null;
  communitySlug: string | null;
  communityOneLiner: string | null;
  communityAbout: string | null;
  sponsorUserId: any;
  communitySystemPrompt: string | null;
};

type CommunityAgentFilesystemContext = {
  communityId: any;
  agentKey: string;
  runId: string;
  heartbeatId?: string;
  compilerDigestId?: any;
  compilerDigestVersionKey?: string;
};

type CommunityAgentWakeEvidence = {
  reason: string;
  pendingTotal: number;
  pendingTraceTotal?: number;
  pendingContinuation?: number;
  pendingStandard: number;
  pendingStrong: number;
  pendingCritical: number;
  oldestPendingAt?: string;
  hasMorePending: boolean;
  countsAreLowerBound: boolean;
  compilerDigestId?: string;
  compilerDigestVersionKey?: string;
  compilerWorkItemCount?: number;
};

type CommunityAgentRunView = {
  id: string;
  community_id: string;
  agent_key: string;
  role: string | null;
  trigger_type: string;
  heartbeat_id: string | null;
  sponsor_user_id: string;
  model_id: string | null;
  status: string;
  wake_reason: string | null;
  wake_evidence: CommunityAgentWakeEvidence | null;
  stop_reason: string | null;
  tool_step_count: number;
  applied_change_request_ids: string[];
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type CommunityAgentRuntimeResult = {
  ok: boolean;
  skipped: boolean;
  run: unknown;
  stop_reason: string;
  tool_step_count: number;
  applied_change_request_ids: string[];
};

type CommunityAgentCreateRunResult = {
  created: boolean;
  skipped_reason: string | null;
  run: CommunityAgentRunView;
};

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "")
    .trim()
    .slice(0, maxLength);
}

async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeTriggerType(raw: unknown): CommunityAgentTriggerType {
  const value = boundedText(raw, 80);
  if (value === "heartbeat" || value === "event" || value === "manual_internal")
    return value;
  return "manual_internal";
}

function normalizeModelId(raw: unknown): string {
  return boundedText(raw, 128) || DEFAULT_ACTIVE_MODEL_ID;
}

const communityAgentWakeEvidenceValidator = v.object({
  reason: v.string(),
  pendingTotal: v.number(),
  pendingTraceTotal: v.optional(v.number()),
  pendingContinuation: v.optional(v.number()),
  pendingStandard: v.number(),
  pendingStrong: v.number(),
  pendingCritical: v.number(),
  oldestPendingAt: v.optional(v.string()),
  hasMorePending: v.boolean(),
  countsAreLowerBound: v.boolean(),
  compilerDigestId: v.optional(v.string()),
  compilerDigestVersionKey: v.optional(v.string()),
  compilerWorkItemCount: v.optional(v.number()),
});

function clampToolSteps(raw: unknown): number {
  const parsed = Math.floor(
    Number(raw ?? COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS),
  );
  if (!Number.isFinite(parsed)) return COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS;
  return Math.max(1, Math.min(COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS, parsed));
}

function truncateOutput(raw: unknown): string {
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (value.length <= COMMUNITY_AGENT_RUNTIME_MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, COMMUNITY_AGENT_RUNTIME_MAX_OUTPUT_CHARS - 120)}\n...[truncated community agent tool output]`;
}

function toolOk(output: unknown): RuntimeKernelToolExecutionResult {
  return {
    status: "ok",
    exitCode: 0,
    outputText: truncateOutput(output),
    errorCode: null,
    errorMessage: null,
  };
}

function toolError(error: unknown): RuntimeKernelToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "error",
    exitCode: null,
    outputText: "",
    errorCode: "community_agent_tool_failed",
    errorMessage: boundedText(
      message || "Community agent tool failed.",
      COMMUNITY_AGENT_RUNTIME_MAX_ERROR_CHARS,
    ),
  };
}

function safeParseObject(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function collectWriteActionIdsFromToolOutput(args: {
  outputText: string;
  appliedChangeRequestIds: Set<string>;
}): void {
  const parsed = safeParseObject(args.outputText);
  const operation = boundedText(parsed?.operation, 120);
  if (operation === "settle_compiler_digest_items") {
    for (const id of parsed?.result?.applied_change_request_ids ?? []) {
      const normalized = boundedText(id, 128);
      if (normalized) args.appliedChangeRequestIds.add(normalized);
    }
  }
}

function isCommunityAgentToolName(
  value: unknown,
): value is CommunityAgentToolName {
  return COMMUNITY_AGENT_TOOL_NAMES.some((toolName) => toolName === value);
}

function unsupportedToolFailure(toolName: unknown): RuntimeKernelFailureInput {
  const pendingToolName = boundedText(toolName, 120) || "unknown";
  return {
    ok: false,
    status: 502,
    code: "invalid_model_output",
    stopReason: "invalid_model_output",
    message: `Community agent returned unsupported tool call "${pendingToolName}".`,
    pendingToolName,
  };
}

function coerceCommunityAgentCompletion(
  completion:
    | NativeToolAwareCompletionSuccess<string>
    | RuntimeKernelFailureInput,
):
  | NativeToolAwareCompletionSuccess<CommunityAgentToolName>
  | RuntimeKernelFailureInput {
  if (completion.ok === false) return completion;
  if (completion.type === "assistant") return completion;
  if (completion.type === "tool_call") {
    if (!isCommunityAgentToolName(completion.toolName)) {
      return unsupportedToolFailure(completion.toolName);
    }
    return {
      ...completion,
      toolName: completion.toolName,
    };
  }
  for (const toolCall of completion.toolCalls) {
    if (!isCommunityAgentToolName(toolCall.toolName)) {
      return unsupportedToolFailure(toolCall.toolName);
    }
  }
  return {
    ...completion,
    toolCalls: completion.toolCalls.map((toolCall) => ({
      ...toolCall,
      toolName: toolCall.toolName as CommunityAgentToolName,
    })),
  };
}

async function executeCommunityAgentTool(args: {
  ctx: any;
  filesystemContext: CommunityAgentFilesystemContext;
  toolName: CommunityAgentToolName;
  normalizedArgs: Record<string, unknown>;
}): Promise<RuntimeKernelToolExecutionResult> {
  try {
    if (args.toolName === "search") {
      const result = await args.ctx.runQuery(
        internalRefs.communityAgentFilesystem
          .searchCommunityAgentFilesystemInternal as any,
        {
        context: args.filesystemContext,
        query: String(args.normalizedArgs.query ?? ""),
          limit:
            typeof args.normalizedArgs.limit === "number"
              ? args.normalizedArgs.limit
              : undefined,
        },
      );
      return toolOk(result);
    }
    if (args.toolName === "write") {
      const result = await args.ctx.runMutation(
        internalRefs.communityAgentFilesystem
          .writeCommunityAgentFilesystemInternal as any,
        {
        context: args.filesystemContext,
        operation: args.normalizedArgs.operation,
        payload: args.normalizedArgs.payload,
        },
      );
      return toolOk(result);
    }
    throw new Error("community_agent_tool_unknown");
  } catch (error) {
    return toolError(error);
  }
}

function mapRun(row: Record<string, any>): CommunityAgentRunView {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    agent_key: row.agentKey,
    role: row.role ?? null,
    trigger_type: row.triggerType,
    heartbeat_id: row.heartbeatId ?? null,
    sponsor_user_id: normalizeIdValue(row.sponsorUserId),
    model_id: row.modelId ?? null,
    status: row.status,
    wake_reason: row.wakeReason ?? null,
    wake_evidence: row.wakeEvidence ?? null,
    stop_reason: row.stopReason ?? null,
    tool_step_count: row.toolStepCount,
    applied_change_request_ids: Array.isArray(row.appliedChangeRequestIds)
      ? row.appliedChangeRequestIds.map(String)
      : [],
    error_code: row.errorCode ?? null,
    error_message: row.errorMessage ?? null,
    started_at: toIsoString(row.startedAt),
    finished_at:
      typeof row.finishedAt === "number" ? toIsoString(row.finishedAt) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const resolveCommunityAgentRunContextInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args): Promise<CommunityAgentResolvedContext> => {
    const canonicalContext = await readCanonicalCommunityAgentContext(
      ctx,
      args.communityId,
    );
    if (!canonicalContext)
      throw new Error("community_agent_runtime_community_not_found");
    const sponsorUserId = canonicalContext.ownerUserId;
    if (!sponsorUserId)
      throw new Error("community_agent_runtime_owner_required");
    const owner = await ctx.db.get(sponsorUserId as any);
    if (!owner) throw new Error("community_agent_runtime_owner_not_found");
    return {
      communityId: args.communityId,
      communityName: canonicalContext.communityName,
      communitySlug: canonicalContext.communitySlug,
      communityOneLiner: canonicalContext.communityOneLiner,
      communityAbout: canonicalContext.communityAbout,
      sponsorUserId,
      communitySystemPrompt: canonicalContext.communitySystemPrompt,
    };
  },
});

// Compact directory census for the wake message: enough for the agent to judge
// duplicates and coverage without spending tool steps on discovery.
export const summarizeCommunityDirectoryStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .take(500)) as Array<Record<string, any>>;
    const countsByType: Record<string, number> = {};
    const countsByStatus: Record<string, number> = {};
    const recentTitles: string[] = [];
    for (const row of rows) {
      const type = String(row.type ?? "unknown");
      const status = String(row.status ?? "unknown");
      countsByType[type] = (countsByType[type] ?? 0) + 1;
      countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
    }
    for (const row of rows
      .slice()
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
      .slice(0, 20)) {
      const title = boundedText(row.title, 120);
      if (title) recentTitles.push(title);
    }
    return {
      total_nodes: rows.length,
      counts_are_lower_bound: rows.length >= 500,
      counts_by_type: countsByType,
      counts_by_status: countsByStatus,
      recent_node_titles: recentTitles,
    };
  },
});

export const createCommunityAgentRunInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    triggerType: v.union(
      v.literal("manual_internal"),
      v.literal("heartbeat"),
      v.literal("event"),
    ),
    sponsorUserId: v.id("users"),
    heartbeatId: v.optional(v.string()),
    role: v.optional(v.string()),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommunityAgentCreateRunResult> => {
    const community = (await ctx.db.get(args.communityId)) as Record<
      string,
      any
    > | null;
    if (!community)
      throw new Error("community_agent_runtime_community_not_found");
    if (
      normalizeIdValue(community.ownerId) !==
      normalizeIdValue(args.sponsorUserId)
    ) {
      throw new Error("community_agent_runtime_sponsor_must_be_owner");
    }
    const nowMs = args.nowMs ?? Date.now();
    const staleCutoffMs = nowMs - COMMUNITY_AGENT_RUNNING_RUN_STALE_MS;
    const runningRows = (await ctx.db
      .query("communityAgentRuns" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "running"),
      )
      .order("desc")
      .take(20)) as Array<Record<string, any>>;
    let freshRunningRow: Record<string, any> | null = null;
    for (const row of runningRows) {
      const startedAt = Number(row.startedAt ?? row.createdAt ?? 0);
      if (startedAt >= staleCutoffMs) {
        freshRunningRow = row;
        continue;
      }
      await ctx.db.patch(row._id as any, {
        status: "error",
        stopReason: "stale_running_run_replaced",
        errorCode: "community_agent_runtime_stale_running_run",
        errorMessage:
          "Community agent run was still running after the stale-run window and was replaced by a new run.",
        finishedAt: nowMs,
        updatedAt: nowMs,
      });
    }
    if (freshRunningRow) {
      return {
        created: false,
        skipped_reason: "running_run_exists",
        run: mapRun(freshRunningRow),
      };
    }
    const id = await ctx.db.insert("communityAgentRuns" as any, {
      communityId: args.communityId,
      agentKey: CANONICAL_COMMUNITY_AGENT_KEY,
      role: boundedText(args.role, 40) || undefined,
      triggerType: args.triggerType,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      sponsorUserId: args.sponsorUserId,
      modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
      status: "running",
      toolStepCount: 0,
      appliedChangeRequestIds: [],
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    // The insert and model pin commit atomically. The funding claim must match
    // this model before any provider-capable work begins.
    const modelId = await resolveCommunityInferenceModelForReceipt(ctx, {
      communityId: args.communityId,
      surface: "community_autonomous_cognition",
      receiptKey: `community_autonomous_cognition:${normalizeIdValue(id)}`,
    });
    if (modelId !== "gpt-5.6-luna" && modelId !== "gpt-6-luna") {
      throw new Error("community_agent_runtime_model_unsupported");
    }
    await ctx.db.patch(id as any, { modelId });
    const row = (await ctx.db.get(id as any)) as Record<string, any> | null;
    if (!row) throw new Error("community_agent_runtime_create_failed");
    return {
      created: true,
      skipped_reason: null,
      run: mapRun(row),
    };
  },
});

export const recordCommunityAgentSkippedRunInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    triggerType: v.union(
      v.literal("manual_internal"),
      v.literal("heartbeat"),
      v.literal("event"),
    ),
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    compilerDigestVersionKey: v.optional(v.string()),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommunityAgentRunView> => {
    const community = (await ctx.db.get(args.communityId)) as Record<
      string,
      any
    > | null;
    if (!community)
      throw new Error("community_agent_runtime_community_not_found");
    const sponsorUserId = community.ownerId;
    if (!sponsorUserId)
      throw new Error("community_agent_runtime_owner_required");
    const owner = await ctx.db.get(sponsorUserId as any);
    if (!owner) throw new Error("community_agent_runtime_owner_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const wakeReason = boundedText(args.wakeReason, 120) || "no_trigger";
    const id = await ctx.db.insert("communityAgentRuns" as any, {
      communityId: args.communityId,
      agentKey: CANONICAL_COMMUNITY_AGENT_KEY,
      triggerType: normalizeTriggerType(args.triggerType),
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      sponsorUserId,
      modelId: args.modelId ? normalizeModelId(args.modelId) : undefined,
      status: "skipped",
      wakeReason,
      wakeEvidence: args.wakeEvidence,
      stopReason: wakeReason,
      toolStepCount: 0,
      appliedChangeRequestIds: [],
      startedAt: nowMs,
      finishedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(id as any)) as Record<string, any> | null;
    if (!row) throw new Error("community_agent_runtime_skip_create_failed");
    return mapRun(row);
  },
});

export const finishCommunityAgentRunInternal = internalMutation({
  args: {
    runId: v.id("communityAgentRuns"),
    status: v.union(v.literal("ok"), v.literal("error")),
    stopReason: v.optional(v.string()),
    toolStepCount: v.number(),
    appliedChangeRequestIds: v.array(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommunityAgentRunView> => {
    const row = (await ctx.db.get(args.runId)) as Record<string, any> | null;
    if (!row) throw new Error("community_agent_runtime_run_not_found");
    if (row.status !== "running") return mapRun(row);
    const nowMs = args.nowMs ?? Date.now();
    const status = args.status === "ok" ? "ok" : "error";
    await ctx.db.patch(args.runId, {
      status,
      stopReason: boundedText(args.stopReason, 120) || undefined,
      toolStepCount: Math.max(0, Math.floor(args.toolStepCount)),
      appliedChangeRequestIds: args.appliedChangeRequestIds
        .map((id) => boundedText(id, 128))
        .filter(Boolean)
        .slice(0, 20),
      errorCode:
        status === "error"
          ? boundedText(args.errorCode, 120) || "community_agent_runtime_failed"
          : undefined,
      errorMessage:
        status === "error"
          ? boundedText(args.errorMessage, 500) ||
            "Community agent runtime failed."
          : undefined,
      finishedAt: nowMs,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(args.runId)) as Record<
      string,
      any
    > | null;
    if (!updated) throw new Error("community_agent_runtime_run_not_found");
    return mapRun(updated);
  },
});

const RUN_EVENT_CONTENT_MAX_CHARS = 8_000;
const RUN_EVENT_MAX_SEQ = 240;
const STEWARD_CONTEXT_SNAPSHOT_SECTION_IDS = [
  "community_agent_identity",
  "steward_shared_rules",
  "steward_role_definition",
  "community_system_prompt",
] as const;
const STEWARD_CONTEXT_SNAPSHOT_SECTION_KEYS = [
  "authority",
  "chars",
  "id",
  "layer",
  "owner",
  "reason",
  "rendered",
  "slot",
  "source",
] as const;

function parseStewardContextSnapshot(snapshotJson: string): {
  messages: Array<Record<string, unknown>>;
  promptSections: Array<Record<string, unknown>>;
  sha256: string;
} | null {
  try {
    const parsed = JSON.parse(snapshotJson) as Record<string, unknown>;
    if (
      Object.keys(parsed).sort().join("|") !==
        [
          "messages",
          "prompt_sections",
          "schema",
          "sha256",
          "surface",
          "version",
        ]
          .sort()
          .join("|") ||
      parsed.version !== 1 ||
      parsed.surface !== "community_steward" ||
      parsed.schema !== "community_steward_context_snapshot_v1" ||
      typeof parsed.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.sha256) ||
      !Array.isArray(parsed.messages) ||
      parsed.messages.length !== 2 ||
      !Array.isArray(parsed.prompt_sections) ||
      parsed.prompt_sections.length !==
        STEWARD_CONTEXT_SNAPSHOT_SECTION_IDS.length
    ) {
      return null;
    }
    const messages = parsed.messages as Array<Record<string, unknown>>;
    if (
      messages.some(
        (message) =>
          !message ||
          typeof message !== "object" ||
          Array.isArray(message) ||
          Object.keys(message).sort().join("|") !== "content|role" ||
          typeof message.content !== "string",
      ) ||
      messages[0]?.role !== "system" ||
      messages[1]?.role !== "user"
    ) {
      return null;
    }
    const promptSections = parsed.prompt_sections as Array<
      Record<string, unknown>
    >;
    let systemPromptChars = 0;
    for (let index = 0; index < promptSections.length; index += 1) {
      const section = promptSections[index];
      if (
        !section ||
        typeof section !== "object" ||
        Array.isArray(section) ||
        Object.keys(section).sort().join("|") !==
          [...STEWARD_CONTEXT_SNAPSHOT_SECTION_KEYS].sort().join("|") ||
        section.id !== STEWARD_CONTEXT_SNAPSHOT_SECTION_IDS[index] ||
        !["stable", "scoped", "volatile"].includes(
          String(section.layer ?? ""),
        ) ||
        !["instruction", "context"].includes(String(section.slot ?? "")) ||
        !["platform", "user", "community", "workspace", "runtime"].includes(
          String(section.owner ?? ""),
        ) ||
        ![
          "platform_policy",
          "role_policy",
          "community_policy",
          "user_preference",
          "runtime_fact",
          "evidence",
        ].includes(String(section.authority ?? "")) ||
        typeof section.rendered !== "boolean" ||
        !Number.isSafeInteger(section.chars) ||
        Number(section.chars) < 0 ||
        (section.rendered
          ? Number(section.chars) === 0
          : Number(section.chars) !== 0) ||
        typeof section.source !== "string" ||
        typeof section.reason !== "string" ||
        "text" in section
      ) {
        return null;
      }
      systemPromptChars += Number(section.chars);
    }
    if (String(messages[0]?.content ?? "").length !== systemPromptChars) {
      return null;
    }
    return {
      messages,
      promptSections,
      sha256: parsed.sha256,
    };
  } catch {
    return null;
  }
}

export const recordCommunityAgentStewardContextSnapshotInternal =
  internalMutation({
    args: {
      communityId: v.id("communities"),
      runId: v.id("communityAgentRuns"),
      snapshotJson: v.string(),
      nowMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
      await requireLiveCommunityForCognitionWrite(ctx, args.communityId);
      const run = (await ctx.db.get(args.runId)) as Record<string, any> | null;
      if (
        !run ||
        normalizeIdValue(run.communityId) !==
          normalizeIdValue(args.communityId) ||
        run.status !== "running"
      ) {
        return {
          ok: false,
          errorCode: "community_agent_context_snapshot_run_invalid",
        };
      }
      const snapshotJson = String(args.snapshotJson ?? "");
      const parsed = parseStewardContextSnapshot(snapshotJson);
      if (
        !parsed ||
        (await sha256HexText(JSON.stringify(parsed.messages))) !== parsed.sha256
      ) {
        return {
          ok: false,
          errorCode: "community_agent_context_snapshot_invalid",
        };
      }
      const normalizedRunId = normalizeIdValue(args.runId);
      const existing = await ctx.db
        .query("communityAgentRunEvents" as any)
        .withIndex("by_run_seq", (q: any) =>
          q.eq("runId", normalizedRunId).eq("seq", 0),
        )
        .first();
      if (existing) {
        if (
          existing.kind === "context_snapshot" &&
          existing.content === snapshotJson
        ) {
          return { ok: true, duplicate: true, runId: normalizedRunId };
        }
        return {
          ok: false,
          errorCode: "community_agent_context_snapshot_conflict",
        };
      }
      await ctx.db.insert("communityAgentRunEvents" as any, {
        communityId: args.communityId,
        runId: normalizedRunId,
        seq: 0,
        kind: "context_snapshot",
        status: "captured",
        content: snapshotJson,
        createdAt: args.nowMs ?? Date.now(),
      });
      return { ok: true, duplicate: false, runId: normalizedRunId };
    },
  });

export const recordCommunityAgentRunEventsInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    runId: v.string(),
    events: v.array(
      v.object({
        seq: v.number(),
        kind: v.union(
          v.literal("system_prompt"),
          v.literal("wake_context"),
          v.literal("reasoning"),
          v.literal("assistant"),
          v.literal("tool_call"),
          v.literal("tool_result"),
          v.literal("input_budget"),
          v.literal("context_projection"),
          v.literal("final"),
          v.literal("error"),
        ),
        toolName: v.optional(v.string()),
        status: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireLiveCommunityForCognitionWrite(ctx, args.communityId);
    const nowMs = Date.now();
    for (const event of args.events) {
      const seq = Math.max(0, Math.floor(event.seq));
      // Hard cap so a pathological run cannot flood the log.
      if (seq >= RUN_EVENT_MAX_SEQ) continue;
      const row = {
        communityId: args.communityId,
        runId: boundedText(args.runId, 128),
        seq,
        kind: event.kind,
        toolName: boundedText(event.toolName, 80) || undefined,
        status: boundedText(event.status, 40) || undefined,
        errorCode: boundedText(event.errorCode, 120) || undefined,
        content: boundedText(event.content, RUN_EVENT_CONTENT_MAX_CHARS),
        createdAt: nowMs,
      };
      const existing = await ctx.db
        .query("communityAgentRunEvents" as any)
        .withIndex("by_run_seq", (q: any) =>
          q.eq("runId", row.runId).eq("seq", seq),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("communityAgentRunEvents" as any, row);
      }
    }
    return { ok: true, recorded: args.events.length };
  },
});

export const runCommunityAgentLoopInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    triggerType: v.optional(
      v.union(
        v.literal("manual_internal"),
        v.literal("heartbeat"),
        v.literal("event"),
      ),
    ),
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    compilerDigestVersionKey: v.optional(v.string()),
    role: v.optional(v.string()),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
  },
  handler: async (ctx, args): Promise<CommunityAgentRuntimeResult> => {
    const agentKey = CANONICAL_COMMUNITY_AGENT_KEY;
    const roleDefinition: CommunityAgentRoleDefinition | undefined =
      isCommunityAgentRoleKey(args.role)
      ? getCommunityAgentRoleDefinition(args.role)
      : undefined;
    const triggerType = normalizeTriggerType(args.triggerType);
    const resolved = (await ctx.runQuery(
      internalRefs.communityAgentRuntime
        .resolveCommunityAgentRunContextInternal as any,
      {
      communityId: args.communityId,
      },
    )) as CommunityAgentResolvedContext;
    const funding = await resolveCommunityInferenceFundingForAction(
      ctx,
      args.communityId,
    );
    if (funding.ok === false) {
      const skippedRun = await ctx.runMutation(
        internalRefs.communityAgentRuntime
          .recordCommunityAgentSkippedRunInternal,
        {
          communityId: args.communityId,
          triggerType,
          heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
          modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID,
          maxToolSteps: args.maxToolSteps,
          compilerDigestId: args.compilerDigestId,
          compilerDigestVersionKey: args.compilerDigestVersionKey,
          wakeReason: funding.code,
          wakeEvidence: args.wakeEvidence,
        },
      );
      return {
        ok: false,
        skipped: true,
        run: skippedRun,
        stop_reason: funding.code,
        tool_step_count: 0,
        applied_change_request_ids: [],
      };
    }
    const exactDigestId = boundedText(args.compilerDigestId, 128) || undefined;
    const exactDigestVersionKey =
      boundedText(args.compilerDigestVersionKey, 128) || undefined;
    if (Boolean(exactDigestId) !== Boolean(exactDigestVersionKey)) {
      throw new Error("community_agent_runtime_digest_identity_incomplete");
    }
    let exactCompilerWindow: unknown;
    if (exactDigestId && exactDigestVersionKey) {
      const exact = (await ctx.runQuery(
        internalRefs.communityAgentFilesystem
          .readCommunityAgentFilesystemInternal as any,
        {
          context: {
            communityId: args.communityId,
            agentKey,
            heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
            compilerDigestId: args.compilerDigestId,
            compilerDigestVersionKey: exactDigestVersionKey,
          },
          path: `/compiler/digests/${exactDigestId}`,
        },
      )) as Record<string, any>;
      if (
        boundedText(exact?.digest?.version_key, 128) !== exactDigestVersionKey
      ) {
        throw new Error("community_agent_runtime_digest_version_mismatch");
      }
      exactCompilerWindow = {
        kind: "claimed_compiler_handoff",
        latest_digest: exact.digest,
      };
    }
    const createdRun = (await ctx.runMutation(
      internalRefs.communityAgentRuntime.createCommunityAgentRunInternal as any,
      {
      communityId: args.communityId,
      triggerType,
      sponsorUserId: resolved.sponsorUserId,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      role: roleDefinition?.roleKey,
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
      },
    )) as CommunityAgentCreateRunResult;
    if (!createdRun.created) {
      return {
        ok: true,
        skipped: true,
        run: createdRun.run,
        stop_reason: createdRun.skipped_reason ?? "running_run_exists",
        tool_step_count: createdRun.run.tool_step_count,
        applied_change_request_ids: createdRun.run.applied_change_request_ids,
      };
    }
    const runId = createdRun.run.id;
    const modelId = createdRun.run.model_id;
    if (modelId !== "gpt-5.6-luna" && modelId !== "gpt-6-luna") {
      throw new Error("community_agent_runtime_model_unsupported");
    }
    const fundingState: { run: Awaited<ReturnType<typeof startFundedInferenceRun>> | null } = { run: null };
    let fundingFinalized = false;
    let fundingClaimAttempted = false;
    const filesystemContext: CommunityAgentFilesystemContext = {
      communityId: args.communityId,
      agentKey,
      runId,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      compilerDigestId: args.compilerDigestId,
      compilerDigestVersionKey: exactDigestVersionKey,
    };
    const appliedChangeRequestIds = new Set<string>();
    // Sequence zero is the mandatory exact provider-context snapshot. Later
    // reasoning, tool, and outcome events remain best-effort observability.
    let eventSeq = 1;
    const emitRunEvents = async (
      events: Array<{
        kind:
          | "reasoning"
          | "assistant"
          | "tool_call"
          | "tool_result"
          | "input_budget"
          | "context_projection"
          | "final"
          | "error";
        toolName?: string;
        status?: string;
        errorCode?: string;
        content: string;
      }>,
    ) => {
      const numbered = events.map((event) => ({ ...event, seq: eventSeq++ }));
      try {
        await ctx.runMutation(
          internalRefs.communityAgentRuntime
            .recordCommunityAgentRunEventsInternal as any,
          {
          communityId: args.communityId,
          runId,
          events: numbered,
          },
        );
      } catch {
        // ignore: observability is best-effort
      }
    };
    const emitRequiredRunEvents = async (
      events: Array<{
        kind: "input_budget" | "context_projection";
        status?: string;
        errorCode?: string;
        content: string;
      }>,
    ) => {
      const numbered = events.map((event) => ({ ...event, seq: eventSeq++ }));
      await ctx.runMutation(
        internalRefs.communityAgentRuntime
          .recordCommunityAgentRunEventsInternal as any,
        {
          communityId: args.communityId,
          runId,
          events: numbered,
        },
      );
    };
    try {
    // Front-load the exact claimed digest. Legacy/manual callers without an
    // explicit digest identity retain the best-effort latest-window fallback.
    // The single steward receives the exact bounded evidence packet.
    let compilerWindow: unknown;
    let directorySummary: unknown;
    if (exactCompilerWindow) {
      compilerWindow = exactCompilerWindow;
    } else {
      try {
          compilerWindow = await ctx.runQuery(
            internalRefs.communityAgentFilesystem
              .readCommunityAgentFilesystemInternal as any,
            {
          context: filesystemContext,
          path: "/compiler/window",
            },
          );
      } catch {
        compilerWindow = undefined;
      }
    }
    try {
        directorySummary = await ctx.runQuery(
          internalRefs.communityAgentRuntime
            .summarizeCommunityDirectoryStateInternal as any,
          {
        communityId: args.communityId,
          },
        );
    } catch {
      directorySummary = undefined;
    }
      const prompt = buildCommunityAgentStewardPromptBundle({
        community: {
          id: normalizeIdValue(resolved.communityId),
          name: resolved.communityName,
          slug: resolved.communitySlug,
          oneLiner: resolved.communityOneLiner,
          about: resolved.communityAbout,
          systemPrompt: resolved.communitySystemPrompt,
        },
      agentKey,
      triggerType,
      runId,
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
      compilerWindow,
      directorySummary,
      role: roleDefinition,
    });
      const messages = prompt.messages;
      const stewardOutputTokens = stewardMaxOutputTokens(compilerWindow);
      const stewardProviderTools = buildCommunityAgentFunctionTools(
        roleDefinition?.toolNames,
      );
      const serializedMessages = JSON.stringify(messages);
      const snapshotJson = JSON.stringify({
        version: 1,
        surface: "community_steward",
        schema: "community_steward_context_snapshot_v1",
        sha256: await sha256HexText(serializedMessages),
        messages,
        prompt_sections: prompt.systemPromptBundle.sections,
      });
      const contextSnapshot = await ctx.runMutation(
        internalRefs.communityAgentRuntime
          .recordCommunityAgentStewardContextSnapshotInternal as any,
        {
          communityId: args.communityId,
          runId,
          snapshotJson,
        },
      );
      if (!contextSnapshot?.ok) {
        throw new Error(
          contextSnapshot?.errorCode ??
            "community_agent_context_snapshot_unavailable",
        );
      }
      const result = await runNativeRuntimeKernel<CommunityAgentToolName>({
        messages,
        budget: {
          ...DEFAULT_RUNTIME_KERNEL_BUDGET,
          maxToolSteps: clampToolSteps(
            args.maxToolSteps ?? roleDefinition?.maxToolSteps,
          ),
          maxConsecutiveFailures: 3,
          maxNoProgressSteps: 3,
          maxRepeatedIdenticalCalls: 2,
        },
        inputBudget: {
          transport: "openai_responses",
          modelRef: `openai/${modelId}`,
          reservedOutputTokens: stewardOutputTokens,
          toolSchemas: stewardProviderTools,
          recordPlan: async (budgetPlan) => {
            await emitRequiredRunEvents([
              {
                kind: "input_budget",
                status: budgetPlan.plan.fits ? "fits" : "rejected",
                errorCode: budgetPlan.plan.failureCode ?? undefined,
                content: JSON.stringify(
                  buildRuntimeInputBudgetEvidence(budgetPlan),
                ),
              },
            ]);
          },
          recordProjection: async (projection) => {
            await emitRequiredRunEvents([
              {
                kind: "context_projection",
                status: "projected",
                content: JSON.stringify(
                  buildRuntimeContextProjectionEvidence(projection),
                ),
              },
            ]);
          },
        },
        runCompletion: async (kernelMessages) => {
          if (!fundingState.run) {
            fundingClaimAttempted = true;
            fundingState.run = await startFundedInferenceRun({
              ctx,
              communityId: args.communityId,
              actorUserId: resolved.sponsorUserId,
              surface: "community_autonomous_cognition",
              receiptKey: `community_autonomous_cognition:${runId}`,
              sourceRunId: `community-agent-runtime:${runId}`,
              admission: funding,
            });
            if (fundingState.run.modelId !== modelId) {
              await fundingState.run.fail("founder_inference_model_changed_before_start");
              fundingFinalized = true;
              throw new Error("founder_inference_model_changed_before_start");
            }
          }
          const completion = await fundingState.run.request({
            messages: kernelMessages,
            maxTokens: stewardOutputTokens,
            // Authority by absence: only this role's tool schemas are sent.
            tools: stewardProviderTools,
            parallelToolCalls: false,
          });
          if (!fundingState.run.usage().complete) {
            return {
              ok: false,
              status: 502,
              code: "provider_token_usage_missing",
              stopReason: "model_error",
              message: "Community inference usage could not be verified.",
            };
          }
          return coerceCommunityAgentCompletion(completion);
        },
        normalizeToolArguments: normalizeCommunityAgentToolArguments,
        executeTool: async ({ toolName, normalizedArgs }) =>
          await executeCommunityAgentTool({
            ctx,
            filesystemContext,
            toolName,
            normalizedArgs,
          }),
        onToolStepFinish: async ({ step, toolResult }) => {
          if (step.toolName === "write" && toolResult.status === "ok") {
            collectWriteActionIdsFromToolOutput({
              outputText: toolResult.outputText,
              appliedChangeRequestIds,
            });
          }
          await emitRunEvents([
            {
              kind: "tool_call",
              toolName: step.toolName,
              content: JSON.stringify(step.normalizedArgs ?? {}),
            },
            {
              kind: "tool_result",
              toolName: step.toolName,
              status: toolResult.status,
              errorCode: toolResult.errorCode ?? undefined,
              content:
                toolResult.status === "ok"
                  ? (toolResult.outputText ?? "")
                  : (toolResult.errorMessage ?? ""),
            },
          ]);
        },
      });
      {
        const lastAssistant = [...result.transcript]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" &&
              typeof message.content === "string" &&
              message.content.trim(),
          );
        await emitRunEvents([
          result.ok
            ? {
                kind: "final",
                status: result.stopReason,
                content:
                  typeof lastAssistant?.content === "string"
                    ? lastAssistant.content
                    : "",
              }
            : {
                kind: "error",
                status: result.stopReason,
                errorCode: result.code,
                content: result.message ?? "",
              },
        ]);
      }

      let fundingErrorCode: string | null = null;
      if (fundingState.run) {
        try {
          const usage = fundingState.run.usage();
          if (!usage.complete) {
            fundingErrorCode = "provider_token_usage_missing";
            await fundingState.run.fail(fundingErrorCode);
          } else if (result.ok && usage.providerRequestCount > 0) {
            if (!await fundingState.run.settle("provider_completed")) {
              fundingErrorCode = "provider_token_usage_missing";
            }
          } else {
            const failureCode = result.ok
              ? "community_agent_provider_not_started"
              : result.code || "provider_error";
            await fundingState.run.fail(failureCode);
            if (result.ok) fundingErrorCode = failureCode;
          }
          fundingFinalized = true;
        } catch {
          fundingErrorCode = "founder_inference_receipt_finalize_failed";
        }
      }

      const finished: unknown = await ctx.runMutation(
        internalRefs.communityAgentRuntime
          .finishCommunityAgentRunInternal as any,
        {
        runId,
        status: result.ok && !fundingErrorCode ? "ok" : "error",
        stopReason: fundingErrorCode ?? result.stopReason,
        toolStepCount: result.stepCount,
        appliedChangeRequestIds: [...appliedChangeRequestIds],
        errorCode: fundingErrorCode ?? (result.ok ? undefined : result.code),
        errorMessage: fundingErrorCode
          ? "Community inference usage could not be settled safely."
            : result.ok
              ? undefined
              : result.message,
        },
      );
      return {
        ok: result.ok && !fundingErrorCode,
        skipped: false,
        run: finished,
        stop_reason: fundingErrorCode ?? result.stopReason,
        tool_step_count: result.stepCount,
        applied_change_request_ids: [...appliedChangeRequestIds],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const preProviderFundingErrorCode =
        fundingClaimAttempted && !fundingState.run
          ? boundedText(message, 120) || "founder_inference_receipt_unavailable"
          : null;
      const boundedFundingErrorCode = preProviderFundingErrorCode ??
        founderInferenceBudgetFailureCode(error) ??
        (message === "founder_inference_model_changed_before_start" ? message : null);
      const runtimeErrorCode =
        boundedFundingErrorCode ?? "community_agent_runtime_exception";
      const runtimeStopReason = boundedFundingErrorCode
        ? runtimeErrorCode
        : "runtime_exception";
      if (fundingState.run && !fundingFinalized) {
        try {
          await fundingState.run.fail(runtimeErrorCode);
          fundingFinalized = true;
        } catch {
          // The original runtime error remains authoritative; the receipt stays fail-closed.
        }
      }
      await emitRunEvents([
        {
          kind: "error",
          status: boundedFundingErrorCode
            ? "funding_unavailable"
            : "runtime_exception",
          errorCode: runtimeErrorCode,
          content: message,
        },
      ]);
      const finished: unknown = await ctx.runMutation(
        internalRefs.communityAgentRuntime
          .finishCommunityAgentRunInternal as any,
        {
        runId,
        status: "error",
        stopReason: runtimeStopReason,
        toolStepCount: 0,
        appliedChangeRequestIds: [...appliedChangeRequestIds],
        errorCode: runtimeErrorCode,
        errorMessage: preProviderFundingErrorCode
          ? "Community inference funding could not be authorized."
          : message,
        },
      );
      return {
        ok: false,
        skipped: false,
        run: finished,
        stop_reason: runtimeStopReason,
        tool_step_count: 0,
        applied_change_request_ids: [...appliedChangeRequestIds],
      };
    }
  },
});

// One heartbeat cycle runs one bounded steward pass.
export const runCommunityAgentCycleInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    triggerType: v.optional(
      v.union(
        v.literal("manual_internal"),
        v.literal("heartbeat"),
        v.literal("event"),
      ),
    ),
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    compilerDigestVersionKey: v.optional(v.string()),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
  },
  handler: async (ctx, args) => {
    const cycleId =
      boundedText(args.heartbeatId, 200) ||
      `cycle:${normalizeIdValue(args.communityId)}:${Date.now()}`;
    const roleResults: Array<{
      role: CommunityAgentRoleKey;
      ok: boolean;
      skipped: boolean;
      stop_reason: string | null;
      tool_step_count: number;
      applied_change_request_ids: string[];
    }> = [];
    let endedEarly: string | null = null;
    for (const roleKey of COMMUNITY_AGENT_CYCLE_ROLES) {
      const result = (await ctx.runAction(
        internalRefs.communityAgentRuntime.runCommunityAgentLoopInternal as any,
        {
        communityId: args.communityId,
        triggerType: args.triggerType,
        heartbeatId: cycleId,
        modelId: args.modelId,
        maxToolSteps: args.maxToolSteps,
        compilerDigestId: args.compilerDigestId,
        compilerDigestVersionKey: args.compilerDigestVersionKey,
        role: roleKey,
        wakeReason: boundedText(args.wakeReason, 120) || undefined,
        wakeEvidence: args.wakeEvidence,
        },
      )) as CommunityAgentRuntimeResult;
      roleResults.push({
        role: roleKey,
        ok: result.ok,
        skipped: result.skipped,
        stop_reason: result.stop_reason ?? null,
        tool_step_count: result.tool_step_count,
        applied_change_request_ids: result.applied_change_request_ids,
      });
      if (!result.ok) {
        endedEarly = `${roleKey}_failed`;
        break;
      }
    }
    let settlementComplete = false;
    if (args.compilerDigestId && args.compilerDigestVersionKey) {
      const settlement = (await ctx.runQuery(
        internalRefs.communityAgentFilesystem
          .inspectCommunityCompilerDigestSettlementInternal as any,
        {
          communityId: args.communityId,
          digestId: args.compilerDigestId,
          versionKey: args.compilerDigestVersionKey,
        },
      )) as { complete?: boolean };
      settlementComplete = settlement.complete === true;
    }
    const completed =
      settlementComplete &&
      roleResults.length > 0 &&
      roleResults.every((entry) => entry.ok && !entry.skipped);
    if (!completed && !endedEarly) endedEarly = "unsettled_compiler_work";
    return {
      ok: completed,
      completed,
      cycle_id: cycleId,
      ended_early: endedEarly,
      roles: roleResults,
      applied_change_request_ids: Array.from(
        new Set(
          roleResults.flatMap((entry) => entry.applied_change_request_ids),
        ),
      ),
    };
  },
});
