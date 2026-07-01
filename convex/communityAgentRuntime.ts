import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { runChatgptNativeToolCompletion } from "./httpChatgpt";
import {
  buildCommunityAgentFunctionTools,
  CANONICAL_COMMUNITY_AGENT_KEY,
  COMMUNITY_AGENT_TOOL_NAMES,
  normalizeCommunityAgentToolArguments,
  type CommunityAgentToolName,
} from "../shared/communityAgentToolProtocol";
import type {
  NativeToolAwareCompletionSuccess,
  NativeToolAwareMessage,
} from "../shared/nativeToolProtocol";
import { runNativeRuntimeKernel } from "../shared/runtimeKernel";
import {
  DEFAULT_RUNTIME_KERNEL_BUDGET,
  type RuntimeKernelFailureInput,
  type RuntimeKernelToolExecutionResult,
} from "../shared/runtimeKernelTypes";
import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog";
import { normalizeIdValue, toIsoString } from "./communityCore";

const COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS = 8;
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
};

type CommunityAgentWakeEvidence = {
  reason: string;
  pendingTotal: number;
  pendingStandard: number;
  pendingStrong: number;
  pendingCritical: number;
  oldestPendingAt?: string;
  hasMorePending: boolean;
  countsAreLowerBound: boolean;
};

type CommunityAgentRunView = {
  id: string;
  community_id: string;
  agent_key: string;
  trigger_type: string;
  heartbeat_id: string | null;
  sponsor_user_id: string;
  model_id: string | null;
  status: string;
  wake_reason: string | null;
  wake_evidence: CommunityAgentWakeEvidence | null;
  stop_reason: string | null;
  tool_step_count: number;
  candidate_proposal_ids: string[];
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
  candidate_proposal_ids: string[];
};

type CommunityAgentCreateRunResult = {
  created: boolean;
  skipped_reason: string | null;
  run: CommunityAgentRunView;
};

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function normalizeTriggerType(raw: unknown): CommunityAgentTriggerType {
  const value = boundedText(raw, 80);
  if (value === "heartbeat" || value === "event" || value === "manual_internal") return value;
  return "manual_internal";
}

function normalizeModelId(raw: unknown): string {
  return boundedText(raw, 128) || DEFAULT_ACTIVE_MODEL_ID;
}

const communityAgentWakeEvidenceValidator = v.object({
  reason: v.string(),
  pendingTotal: v.number(),
  pendingStandard: v.number(),
  pendingStrong: v.number(),
  pendingCritical: v.number(),
  oldestPendingAt: v.optional(v.string()),
  hasMorePending: v.boolean(),
  countsAreLowerBound: v.boolean(),
});

function clampToolSteps(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_AGENT_RUNTIME_MAX_TOOL_STEPS));
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
    errorMessage: boundedText(message || "Community agent tool failed.", COMMUNITY_AGENT_RUNTIME_MAX_ERROR_CHARS),
  };
}

function safeParseObject(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function collectCandidateProposalIdFromToolOutput(outputText: string, out: Set<string>): void {
  const parsed = safeParseObject(outputText);
  const id = boundedText(parsed?.result?.proposal?.id, 128);
  if (id) out.add(id);
}

function isCommunityAgentToolName(value: unknown): value is CommunityAgentToolName {
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
  completion: NativeToolAwareCompletionSuccess<string> | RuntimeKernelFailureInput,
): NativeToolAwareCompletionSuccess<CommunityAgentToolName> | RuntimeKernelFailureInput {
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

function buildCommunityAgentMessages(params: {
  resolved: CommunityAgentResolvedContext;
  agentKey: string;
  triggerType: CommunityAgentTriggerType;
  runId: string;
  wakeReason?: string;
  wakeEvidence?: CommunityAgentWakeEvidence;
}): NativeToolAwareMessage[] {
  const communityLabel =
    params.resolved.communityName ||
    params.resolved.communitySlug ||
    normalizeIdValue(params.resolved.communityId);
  const constitution = boundedText(params.resolved.communitySystemPrompt, 12_000);
  return [
    {
      role: "system",
      content: [
        "You are the autonomous community agent for exactly one Polynet community.",
        "You are not a member's personal agent and you are not a public chat assistant.",
        "You wake from platform triggers and inspect the community compiler and directory filesystem.",
        "",
        "Hard rules:",
        "- Operate only inside the single community provided in this run.",
        "- Use only the list, read, search, and write tools.",
        "- The filesystem exposes only /compiler and /directory.",
        "- Do not ask for raw activity. Activity must already be compiler evidence.",
        "- Treat compiler digests and candidates as non-canonical.",
        "- Use write only to propose a directory candidate from a compiler digest item.",
        "- Never claim a directory node or edge was changed unless a tool result says so.",
        "- Prefer no write over a weak or private-looking proposal.",
        "- If no useful action is supported, finish with a short no-op summary.",
        "",
        "Operating procedure:",
        "1. Read /compiler/window.",
        "2. If a digest exists, inspect the latest digest and candidate state.",
        "3. Inspect directory state only when needed to avoid duplicate or stale proposals.",
        "4. Propose at most three digest-derived candidates, only when evidence supports future workflow value.",
        "5. Finish with a concise internal summary of what you inspected and what you proposed.",
        constitution ? `\nCommunity constitution:\n${constitution}` : "",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        `Community: ${communityLabel}`,
        `Community id: ${normalizeIdValue(params.resolved.communityId)}`,
        `Agent key: ${params.agentKey}`,
        `Run id: ${params.runId}`,
        `Trigger: ${params.triggerType}`,
        params.wakeReason ? `Wake reason: ${params.wakeReason}` : "",
        params.wakeEvidence
          ? `Evidence state: pending ${params.wakeEvidence.pendingTotal}, critical ${params.wakeEvidence.pendingCritical}, strong ${params.wakeEvidence.pendingStrong}, lower-bound ${params.wakeEvidence.countsAreLowerBound ? "yes" : "no"}.`
          : "",
        params.resolved.communityOneLiner ? `One-liner: ${params.resolved.communityOneLiner}` : "",
        params.resolved.communityAbout ? `About: ${params.resolved.communityAbout}` : "",
        "Begin the bounded community cognition pass now.",
      ].filter(Boolean).join("\n"),
    },
  ];
}

async function executeCommunityAgentTool(args: {
  ctx: any;
  filesystemContext: CommunityAgentFilesystemContext;
  toolName: CommunityAgentToolName;
  normalizedArgs: Record<string, unknown>;
}): Promise<RuntimeKernelToolExecutionResult> {
  try {
    if (args.toolName === "list") {
      const result = await args.ctx.runQuery(internalRefs.communityAgentFilesystem.listCommunityAgentFilesystemInternal as any, {
        context: args.filesystemContext,
        path: typeof args.normalizedArgs.path === "string" ? args.normalizedArgs.path : undefined,
        limit: typeof args.normalizedArgs.limit === "number" ? args.normalizedArgs.limit : undefined,
      });
      return toolOk(result);
    }
    if (args.toolName === "read") {
      const result = await args.ctx.runQuery(internalRefs.communityAgentFilesystem.readCommunityAgentFilesystemInternal as any, {
        context: args.filesystemContext,
        path: String(args.normalizedArgs.path ?? ""),
      });
      return toolOk(result);
    }
    if (args.toolName === "search") {
      const result = await args.ctx.runQuery(internalRefs.communityAgentFilesystem.searchCommunityAgentFilesystemInternal as any, {
        context: args.filesystemContext,
        query: String(args.normalizedArgs.query ?? ""),
        limit: typeof args.normalizedArgs.limit === "number" ? args.normalizedArgs.limit : undefined,
      });
      return toolOk(result);
    }
    if (args.toolName === "write") {
      const result = await args.ctx.runMutation(internalRefs.communityAgentFilesystem.writeCommunityAgentFilesystemInternal as any, {
        context: args.filesystemContext,
        operation: args.normalizedArgs.operation,
        payload: args.normalizedArgs.payload,
      });
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
    trigger_type: row.triggerType,
    heartbeat_id: row.heartbeatId ?? null,
    sponsor_user_id: normalizeIdValue(row.sponsorUserId),
    model_id: row.modelId ?? null,
    status: row.status,
    wake_reason: row.wakeReason ?? null,
    wake_evidence: row.wakeEvidence ?? null,
    stop_reason: row.stopReason ?? null,
    tool_step_count: row.toolStepCount,
    candidate_proposal_ids: Array.isArray(row.candidateProposalIds) ? row.candidateProposalIds.map(String) : [],
    error_code: row.errorCode ?? null,
    error_message: row.errorMessage ?? null,
    started_at: toIsoString(row.startedAt),
    finished_at: typeof row.finishedAt === "number" ? toIsoString(row.finishedAt) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const resolveCommunityAgentRunContextInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args): Promise<CommunityAgentResolvedContext> => {
    const community = (await ctx.db.get(args.communityId)) as Record<string, any> | null;
    if (!community) throw new Error("community_agent_runtime_community_not_found");
    const sponsorUserId = community.ownerId;
    if (!sponsorUserId) throw new Error("community_agent_runtime_owner_required");
    const owner = await ctx.db.get(sponsorUserId as any);
    if (!owner) throw new Error("community_agent_runtime_owner_not_found");
    const configRows = (await ctx.db
      .query("communityAgentConfigs" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as Array<Record<string, any>>;
    const config = configRows
      .slice()
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0] ?? null;
    return {
      communityId: args.communityId,
      communityName: boundedText(community.name, 200) || null,
      communitySlug: boundedText(community.slug, 200) || null,
      communityOneLiner: boundedText(community.oneLiner, 500) || null,
      communityAbout: boundedText(community.about, 4_000) || null,
      sponsorUserId,
      communitySystemPrompt: boundedText(config?.systemPrompt, 40_000) || null,
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
    modelId: v.string(),
    heartbeatId: v.optional(v.string()),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommunityAgentCreateRunResult> => {
    const community = (await ctx.db.get(args.communityId)) as Record<string, any> | null;
    if (!community) throw new Error("community_agent_runtime_community_not_found");
    if (normalizeIdValue(community.ownerId) !== normalizeIdValue(args.sponsorUserId)) {
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
        errorMessage: "Community agent run was still running after the stale-run window and was replaced by a new run.",
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
      triggerType: args.triggerType,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      sponsorUserId: args.sponsorUserId,
      modelId: normalizeModelId(args.modelId),
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
      status: "running",
      toolStepCount: 0,
      candidateProposalIds: [],
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
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
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommunityAgentRunView> => {
    const community = (await ctx.db.get(args.communityId)) as Record<string, any> | null;
    if (!community) throw new Error("community_agent_runtime_community_not_found");
    const sponsorUserId = community.ownerId;
    if (!sponsorUserId) throw new Error("community_agent_runtime_owner_required");
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
      candidateProposalIds: [],
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
    candidateProposalIds: v.array(v.string()),
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
      candidateProposalIds: args.candidateProposalIds
        .map((id) => boundedText(id, 128))
        .filter(Boolean)
        .slice(0, 20),
      errorCode: status === "error" ? boundedText(args.errorCode, 120) || "community_agent_runtime_failed" : undefined,
      errorMessage: status === "error" ? boundedText(args.errorMessage, 500) || "Community agent runtime failed." : undefined,
      finishedAt: nowMs,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(args.runId)) as Record<string, any> | null;
    if (!updated) throw new Error("community_agent_runtime_run_not_found");
    return mapRun(updated);
  },
});

const RUN_EVENT_CONTENT_MAX_CHARS = 8_000;
const RUN_EVENT_MAX_SEQ = 240;

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
    const nowMs = Date.now();
    for (const event of args.events) {
      const seq = Math.max(0, Math.floor(event.seq));
      // Hard cap so a pathological run cannot flood the log.
      if (seq >= RUN_EVENT_MAX_SEQ) continue;
      await ctx.db.insert("communityAgentRunEvents" as any, {
        communityId: args.communityId,
        runId: boundedText(args.runId, 128),
        seq,
        kind: event.kind,
        toolName: boundedText(event.toolName, 80) || undefined,
        status: boundedText(event.status, 40) || undefined,
        errorCode: boundedText(event.errorCode, 120) || undefined,
        content: boundedText(event.content, RUN_EVENT_CONTENT_MAX_CHARS),
        createdAt: nowMs,
      });
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
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(communityAgentWakeEvidenceValidator),
  },
  handler: async (ctx, args): Promise<CommunityAgentRuntimeResult> => {
    const agentKey = CANONICAL_COMMUNITY_AGENT_KEY;
    const triggerType = normalizeTriggerType(args.triggerType);
    const modelId = normalizeModelId(args.modelId);
    const resolved = (await ctx.runQuery(internalRefs.communityAgentRuntime.resolveCommunityAgentRunContextInternal as any, {
      communityId: args.communityId,
    })) as CommunityAgentResolvedContext;
    const createdRun = (await ctx.runMutation(internalRefs.communityAgentRuntime.createCommunityAgentRunInternal as any, {
      communityId: args.communityId,
      triggerType,
      sponsorUserId: resolved.sponsorUserId,
      modelId,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
    })) as CommunityAgentCreateRunResult;
    if (!createdRun.created) {
      return {
        ok: true,
        skipped: true,
        run: createdRun.run,
        stop_reason: createdRun.skipped_reason ?? "running_run_exists",
        tool_step_count: createdRun.run.tool_step_count,
        candidate_proposal_ids: createdRun.run.candidate_proposal_ids,
      };
    }
    const runId = createdRun.run.id;
    const filesystemContext: CommunityAgentFilesystemContext = {
      communityId: args.communityId,
      agentKey,
      runId,
      heartbeatId: boundedText(args.heartbeatId, 200) || undefined,
    };
    const candidateProposalIds = new Set<string>();
    // Sequential run-event log. Persistence failures are swallowed: the audit
    // trail must never be the reason a memory run dies.
    let eventSeq = 0;
    const emitRunEvents = async (
      events: Array<{
        kind:
          | "system_prompt"
          | "wake_context"
          | "reasoning"
          | "assistant"
          | "tool_call"
          | "tool_result"
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
        await ctx.runMutation(internalRefs.communityAgentRuntime.recordCommunityAgentRunEventsInternal as any, {
          communityId: args.communityId,
          runId,
          events: numbered,
        });
      } catch {
        // ignore: observability is best-effort
      }
    };
    const messages = buildCommunityAgentMessages({
      resolved,
      agentKey,
      triggerType,
      runId,
      wakeReason: boundedText(args.wakeReason, 120) || undefined,
      wakeEvidence: args.wakeEvidence,
    });
    await emitRunEvents([
      { kind: "system_prompt", content: String(messages[0]?.content ?? "") },
      { kind: "wake_context", content: String(messages[1]?.content ?? "") },
    ]);
    let reasoningBuffer = "";
    try {
      const result = await runNativeRuntimeKernel<CommunityAgentToolName>({
        messages,
        budget: {
          ...DEFAULT_RUNTIME_KERNEL_BUDGET,
          maxToolSteps: clampToolSteps(args.maxToolSteps),
          maxConsecutiveFailures: 3,
          maxNoProgressSteps: 3,
          maxRepeatedIdenticalCalls: 2,
        },
        runCompletion: async (kernelMessages) => {
          const completion = await runChatgptNativeToolCompletion({
            ctx,
            userId: normalizeIdValue(resolved.sponsorUserId),
            modelId,
            messages: kernelMessages,
            maxTokens: 1600,
            tools: buildCommunityAgentFunctionTools(),
            parallelToolCalls: false,
            onReasoningSummaryTextDelta: ({ delta }) => {
              reasoningBuffer += delta;
            },
          });
          if (reasoningBuffer.trim()) {
            await emitRunEvents([{ kind: "reasoning", content: reasoningBuffer.trim() }]);
            reasoningBuffer = "";
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
            collectCandidateProposalIdFromToolOutput(toolResult.outputText, candidateProposalIds);
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
              content: toolResult.status === "ok" ? toolResult.outputText ?? "" : toolResult.errorMessage ?? "",
            },
          ]);
        },
      });
      {
        const lastAssistant = [...result.transcript]
          .reverse()
          .find((message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim());
        await emitRunEvents([
          result.ok
            ? {
                kind: "final",
                status: result.stopReason,
                content: typeof lastAssistant?.content === "string" ? lastAssistant.content : "",
              }
            : {
                kind: "error",
                status: result.stopReason,
                errorCode: result.code,
                content: result.message ?? "",
              },
        ]);
      }

      const finished: unknown = await ctx.runMutation(internalRefs.communityAgentRuntime.finishCommunityAgentRunInternal as any, {
        runId,
        status: result.ok ? "ok" : "error",
        stopReason: result.stopReason,
        toolStepCount: result.stepCount,
        candidateProposalIds: [...candidateProposalIds],
        errorCode: result.ok ? undefined : result.code,
        errorMessage: result.ok ? undefined : result.message,
      });
      return {
        ok: result.ok,
        skipped: false,
        run: finished,
        stop_reason: result.stopReason,
        tool_step_count: result.stepCount,
        candidate_proposal_ids: [...candidateProposalIds],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await emitRunEvents([
        { kind: "error", status: "runtime_exception", errorCode: "community_agent_runtime_exception", content: message },
      ]);
      const finished: unknown = await ctx.runMutation(internalRefs.communityAgentRuntime.finishCommunityAgentRunInternal as any, {
        runId,
        status: "error",
        stopReason: "runtime_exception",
        toolStepCount: 0,
        candidateProposalIds: [...candidateProposalIds],
        errorCode: "community_agent_runtime_exception",
        errorMessage: message,
      });
      return {
        ok: false,
        skipped: false,
        run: finished,
        stop_reason: "runtime_exception",
        tool_step_count: 0,
        candidate_proposal_ids: [...candidateProposalIds],
      };
    }
  },
});
