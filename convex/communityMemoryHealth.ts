import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { measureCommunityCompilerEvidenceForCommunity } from "./communityCompilerEvidenceCore";

type HealthFlag =
  | "agent_disabled"
  | "owner_chatgpt_connection_missing"
  | "no_source_traces"
  | "no_eligible_compiler_evidence"
  | "compiler_evidence_below_threshold"
  | "compiler_evidence_counts_lower_bound"
  | "no_compiler_digest"
  | "no_agent_run"
  | "last_agent_run_failed"
  | "no_directory_nodes"
  | "directory_count_lower_bound"
  | "no_retrieval_logs"
  | "no_outcome_observations"
  | "no_metabolizer_run"
  | "last_metabolizer_failed";

const COMMUNITY_AGENT_KEY = "community_agent";
const RECENT_RUN_LIMIT = 20;
const DIRECTORY_COUNT_LIMIT = 1000;
const RETRIEVAL_LOG_LIMIT = 200;
const OUTCOME_LIMIT = 200;
const METABOLIZER_RUN_LIMIT = 10;
const DIRECTORY_NODE_STATUSES = [
  "draft",
  "candidate",
  "promising",
  "validated",
  "canonical",
  "contested",
  "stale",
  "deprecated",
  "archived",
] as const;
const DIRECTORY_NODE_TYPES = [
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
] as const;

function emptyCountMap<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function isoOrNull(value: unknown): string | null {
  return typeof value === "number" ? toIsoString(value) : null;
}

function countIdList(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

function mapAgentRun(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: normalizeIdValue(row._id),
    role: row.role ?? null,
    trigger_type: row.triggerType,
    status: row.status,
    wake_reason: row.wakeReason ?? null,
    stop_reason: row.stopReason ?? null,
    tool_step_count: Math.max(0, Number(row.toolStepCount ?? 0)),
    applied_count: countIdList(row.appliedChangeRequestIds),
    error_code: row.errorCode ?? null,
    error_message: row.errorMessage ?? null,
    started_at: isoOrNull(row.startedAt),
    finished_at: isoOrNull(row.finishedAt),
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
  };
}

function mapSourceTrace(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: normalizeIdValue(row._id),
    source_type: row.sourceType,
    visibility_scope: row.visibilityScope,
    source_visibility: row.sourceVisibility,
    compiler_state: row.compilerState ?? null,
    actor_type: row.actorType,
    actor_agent_key: row.actorAgentKey ?? null,
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
  };
}

function mapCompilerDigest(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: normalizeIdValue(row._id),
    item_count: Math.max(0, Number(row.itemCount ?? 0)),
    signal_counts: row.signalCounts ?? null,
    window_started_at: isoOrNull(row.windowStartedAt),
    window_ended_at: isoOrNull(row.windowEndedAt),
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
  };
}

function mapCompilerEvidenceMeasurement(raw: Record<string, any>) {
  return {
    should_run: Boolean(raw.should_run),
    reason: raw.reason,
    pending_total: Math.max(0, Number(raw.pending_total ?? 0)),
    pending_standard: Math.max(0, Number(raw.pending_standard ?? 0)),
    pending_strong: Math.max(0, Number(raw.pending_strong ?? 0)),
    pending_critical: Math.max(0, Number(raw.pending_critical ?? 0)),
    oldest_pending_at: raw.oldest_pending_at ?? null,
    has_more_pending: Boolean(raw.has_more_pending),
    counts_are_lower_bound: Boolean(raw.counts_are_lower_bound),
    selected_trace_count: Array.isArray(raw.selected_trace_ids) ? raw.selected_trace_ids.length : 0,
    thresholds: raw.thresholds ?? null,
  };
}

function mapMetabolizerRun(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: normalizeIdValue(row._id),
    status: row.status,
    trigger: row.trigger,
    inspected_retrieval_log_count: Math.max(0, Number(row.inspectedRetrievalLogCount ?? 0)),
    inspected_outcome_count: Math.max(0, Number(row.inspectedOutcomeCount ?? 0)),
    signal_node_count: Math.max(0, Number(row.signalNodeCount ?? 0)),
    inspected_node_count: Math.max(0, Number(row.inspectedNodeCount ?? 0)),
    settled_node_count: Math.max(0, Number(row.settledNodeCount ?? 0)),
    changed_node_count: countIdList(row.changedNodeIds),
    error_code: row.errorCode ?? null,
    error_message: row.errorMessage ?? null,
    started_at: isoOrNull(row.startedAt),
    finished_at: isoOrNull(row.finishedAt),
    created_at: isoOrNull(row.createdAt),
  };
}

async function countDirectoryNodes(ctx: any, communityId: any) {
  const byStatus = emptyCountMap(DIRECTORY_NODE_STATUSES);
  const byType = emptyCountMap(DIRECTORY_NODE_TYPES);
  const lowerBoundByStatus = emptyCountMap(DIRECTORY_NODE_STATUSES);

  for (const status of DIRECTORY_NODE_STATUSES) {
    const rows = (await ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community_status_updatedAt", (q: any) => q.eq("communityId", communityId).eq("status", status))
      .take(DIRECTORY_COUNT_LIMIT)) as Record<string, any>[];
    byStatus[status] = rows.length;
    lowerBoundByStatus[status] = rows.length >= DIRECTORY_COUNT_LIMIT ? 1 : 0;
    for (const row of rows) {
      if (DIRECTORY_NODE_TYPES.includes(row.type)) byType[row.type as (typeof DIRECTORY_NODE_TYPES)[number]] += 1;
    }
  }

  return {
    byStatus,
    byType,
    lowerBoundByStatus,
    totalLowerBound: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    countsAreLowerBound: Object.values(lowerBoundByStatus).some((value) => value > 0),
  };
}

export const getCommunityMemoryHealthProbe = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });

    const [configRows, ownerChatgptConnection, latestSourceTrace, latestDigest, recentRuns, metabolizerRuns] =
      await Promise.all([
        ctx.db
          .query("communityAgentConfigs" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .take(5) as Promise<Record<string, any>[]>,
        ctx.db
          .query("userProviderConnections" as any)
          .withIndex("by_user_provider", (q: any) =>
            q.eq("userId", community.ownerId).eq("provider", "chatgpt"),
          )
          .first() as Promise<Record<string, any> | null>,
        ctx.db
          .query("communitySourceTraces" as any)
          .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
          .order("desc")
          .first() as Promise<Record<string, any> | null>,
        ctx.db
          .query("communityCompilerDigests" as any)
          .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
          .order("desc")
          .first() as Promise<Record<string, any> | null>,
        ctx.db
          .query("communityAgentRuns" as any)
          .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
          .order("desc")
          .take(RECENT_RUN_LIMIT * 2) as Promise<Record<string, any>[]>,
        ctx.db
          .query("communityMemoryMetabolizerRuns" as any)
          .withIndex("by_community_finishedAt", (q: any) => q.eq("communityId", args.communityId))
          .order("desc")
          .take(METABOLIZER_RUN_LIMIT) as Promise<Record<string, any>[]>,
      ]);

    const config =
      configRows
        .slice()
        .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0] ?? null;
    const agentEnabled = config?.agentEnabled !== false;
    const communityAgentRuns = recentRuns
      .filter((row) => row.agentKey === COMMUNITY_AGENT_KEY)
      .slice(0, RECENT_RUN_LIMIT);
    const latestRun = communityAgentRuns[0] ?? null;
    const latestMetabolizerRun = metabolizerRuns[0] ?? null;

    const [compilerEvidence, directory, retrievalLogs, outcomes] = await Promise.all([
      measureCommunityCompilerEvidenceForCommunity({
        ctx,
        communityId: args.communityId,
        nowMs,
      }),
      countDirectoryNodes(ctx, args.communityId),
      ctx.db
        .query("communityIntelligenceRetrievalLogs" as any)
        .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(RETRIEVAL_LOG_LIMIT) as Promise<Record<string, any>[]>,
      ctx.db
        .query("communityOutcomeObservations" as any)
        .withIndex("by_community_observedAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(OUTCOME_LIMIT) as Promise<Record<string, any>[]>,
    ]);

    const compilerEvidenceMeasurement = mapCompilerEvidenceMeasurement(
      (compilerEvidence as Record<string, any>).measurement ?? {},
    );
    const retrievalFeedbackCount = retrievalLogs.filter((row) => Boolean(row.feedback)).length;
    const healthFlags: HealthFlag[] = [];
    if (!agentEnabled) healthFlags.push("agent_disabled");
    if (!ownerChatgptConnection?.encryptedSecretHex) healthFlags.push("owner_chatgpt_connection_missing");
    if (!latestSourceTrace) healthFlags.push("no_source_traces");
    if (compilerEvidenceMeasurement.pending_total === 0) {
      healthFlags.push("no_eligible_compiler_evidence");
    } else if (!compilerEvidenceMeasurement.should_run) {
      healthFlags.push("compiler_evidence_below_threshold");
    }
    if (compilerEvidenceMeasurement.counts_are_lower_bound) healthFlags.push("compiler_evidence_counts_lower_bound");
    if (!latestDigest) healthFlags.push("no_compiler_digest");
    if (!latestRun) healthFlags.push("no_agent_run");
    if (latestRun?.status === "error") healthFlags.push("last_agent_run_failed");
    if (directory.totalLowerBound === 0) healthFlags.push("no_directory_nodes");
    if (directory.countsAreLowerBound) healthFlags.push("directory_count_lower_bound");
    if (retrievalLogs.length === 0) healthFlags.push("no_retrieval_logs");
    if (outcomes.length === 0) healthFlags.push("no_outcome_observations");
    if (!latestMetabolizerRun) healthFlags.push("no_metabolizer_run");
    if (latestMetabolizerRun?.status === "error") healthFlags.push("last_metabolizer_failed");

    return {
      generated_at: toIsoString(nowMs),
      community: {
        id: normalizeIdValue(community._id),
        name: community.name,
        slug: community.slug,
        owner_id: normalizeIdValue(community.ownerId),
      },
      agent: {
        key: COMMUNITY_AGENT_KEY,
        enabled: agentEnabled,
        owner_chatgpt_connection_present: Boolean(ownerChatgptConnection?.encryptedSecretHex),
        latest_run: mapAgentRun(latestRun),
        recent_runs: communityAgentRuns.map(mapAgentRun),
        recent_run_counts: {
          skipped: communityAgentRuns.filter((row) => row.status === "skipped").length,
          running: communityAgentRuns.filter((row) => row.status === "running").length,
          ok: communityAgentRuns.filter((row) => row.status === "ok").length,
          error: communityAgentRuns.filter((row) => row.status === "error").length,
        },
      },
      compiler: {
        latest_source_trace: mapSourceTrace(latestSourceTrace),
        latest_digest: mapCompilerDigest(latestDigest),
        evidence: compilerEvidenceMeasurement,
      },
      directory: {
        node_count_lower_bound: directory.totalLowerBound,
        counts_are_lower_bound: directory.countsAreLowerBound,
        by_status: directory.byStatus,
        by_type: directory.byType,
        lower_bound_by_status: directory.lowerBoundByStatus,
      },
      retrieval: {
        recent_log_count: retrievalLogs.length,
        recent_feedback_count: retrievalFeedbackCount,
        sample_limit: RETRIEVAL_LOG_LIMIT,
        sample_is_lower_bound: retrievalLogs.length >= RETRIEVAL_LOG_LIMIT,
      },
      outcomes: {
        recent_observation_count: outcomes.length,
        sample_limit: OUTCOME_LIMIT,
        sample_is_lower_bound: outcomes.length >= OUTCOME_LIMIT,
      },
      metabolizer: {
        latest_run: mapMetabolizerRun(latestMetabolizerRun),
        recent_runs: metabolizerRuns.map(mapMetabolizerRun),
      },
      health_flags: healthFlags,
      read_limits: {
        recent_run_limit: RECENT_RUN_LIMIT,
        directory_count_limit_per_status: DIRECTORY_COUNT_LIMIT,
        retrieval_log_limit: RETRIEVAL_LOG_LIMIT,
        outcome_limit: OUTCOME_LIMIT,
        metabolizer_run_limit: METABOLIZER_RUN_LIMIT,
      },
    };
  },
});
