import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  COMPILER_EVIDENCE_VISIBILITY_SCOPES,
  isCommunityCompilerEvidenceTrace,
} from "./communityCompilerEvidenceCore";
import { buildCommunityAiFeedEvidenceRef } from "../shared/communityEvidenceContract";

type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: string;
  sourceVisibility: string;
  workflowId?: string;
  artifactIds?: string[];
  outcomeObservationIds?: any[];
  actorType: string;
  actorUserId?: any;
  actorAgentKey?: string;
  createdAt: number;
  updatedAt: number;
};

type AiFeedPostRow = {
  _id: any;
  communityId: any;
  authorType: "agent";
  authorUserId?: any;
  agentKey?: string;
  authorLabel: string;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  evidence?: string[];
  status: "live" | "hidden";
  score: number;
  goodCount: number;
  lowSignalCount: number;
  noveltyKey?: string;
  createdAt: number;
  updatedAt: number;
};

type OutcomeObservationRow = {
  _id: any;
  communityId: any;
  nodeId?: any;
  retrievalLogId?: any;
  workflowId?: string;
  metricName?: string;
  metricValue?: number;
  baselineValue?: number;
  resultStatus: "worked" | "failed" | "mixed" | "unknown";
  evidenceStrength: "none" | "anecdotal" | "observed" | "measured" | "validated";
  notes?: string;
  observedByActorType: string;
  observedByUserId?: any;
  observedByAgentKey?: string;
  observedAt: number;
  createdAt: number;
  updatedAt: number;
};

type ChangeRequestRow = {
  _id: any;
  communityId: any;
  status: "pending_decision" | "accepted" | "rejected" | "applied";
};

const SOURCE_TRACE_INPUT_OVERFETCH_MULTIPLIER = 3;
const MAX_SOURCE_TRACE_INPUT_FETCH = 600;
const MAX_AI_FEED_INPUT_FETCH = 300;

function boundedLimit(raw: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function mapTrace(row: SourceTraceRow) {
  return {
    id: normalizeIdValue(row._id),
    source_type: row.sourceType,
    source_id: row.sourceId ?? null,
    title: row.title ?? null,
    summary: row.summary,
    visibility_scope: row.visibilityScope,
    source_visibility: row.sourceVisibility,
    workflow_id: row.workflowId ?? null,
    artifact_ids: row.artifactIds ?? [],
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    actor_type: row.actorType,
    actor_user_id: row.actorUserId ? normalizeIdValue(row.actorUserId) : null,
    actor_agent_key: row.actorAgentKey ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapAiFeedSignal(row: AiFeedPostRow) {
  return {
    id: normalizeIdValue(row._id),
    evidence_ref: buildCommunityAiFeedEvidenceRef(normalizeIdValue(row._id)),
    post_type: row.type,
    title: row.title ?? null,
    body: row.body,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    score: Number(row.score ?? 0),
    good_count: Math.max(0, Number(row.goodCount ?? 0)),
    low_signal_count: Math.max(0, Number(row.lowSignalCount ?? 0)),
    novelty_key: row.noveltyKey ?? null,
    author_label: row.authorLabel,
    author_user_id: row.authorUserId ? normalizeIdValue(row.authorUserId) : null,
    agent_key: row.agentKey ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapOutcome(row: OutcomeObservationRow) {
  return {
    id: normalizeIdValue(row._id),
    node_id: row.nodeId ? normalizeIdValue(row.nodeId) : null,
    retrieval_log_id: row.retrievalLogId ? normalizeIdValue(row.retrievalLogId) : null,
    workflow_id: row.workflowId ?? null,
    metric_name: row.metricName ?? null,
    metric_value: typeof row.metricValue === "number" ? row.metricValue : null,
    baseline_value: typeof row.baselineValue === "number" ? row.baselineValue : null,
    result_status: row.resultStatus,
    evidence_strength: row.evidenceStrength,
    notes: row.notes ?? null,
    observed_by_actor_type: row.observedByActorType,
    observed_by_user_id: row.observedByUserId ? normalizeIdValue(row.observedByUserId) : null,
    observed_by_agent_key: row.observedByAgentKey ?? null,
    observed_at: toIsoString(row.observedAt),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listCommunityCompilerInputs = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sourceTraceLimit: v.optional(v.number()),
    aiFeedLimit: v.optional(v.number()),
    outcomeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });

    const sourceTraceLimit = boundedLimit(args.sourceTraceLimit, 50, 200);
    const aiFeedLimit = boundedLimit(args.aiFeedLimit, 25, 100);
    const outcomeLimit = boundedLimit(args.outcomeLimit, 25, 100);
    const sourceTraceFetchLimit = Math.min(
      MAX_SOURCE_TRACE_INPUT_FETCH,
      sourceTraceLimit * SOURCE_TRACE_INPUT_OVERFETCH_MULTIPLIER,
    );
    const aiFeedFetchLimit = Math.min(MAX_AI_FEED_INPUT_FETCH, aiFeedLimit * 3);

    const [traceRowsByVisibility, aiFeedRows, outcomeRows, pendingChangeRequests] = await Promise.all([
      Promise.all(
        COMPILER_EVIDENCE_VISIBILITY_SCOPES.map((visibilityScope) =>
          ctx.db
            .query("communitySourceTraces" as any)
            .withIndex("by_community_visibility_createdAt", (q: any) =>
              q.eq("communityId", args.communityId).eq("visibilityScope", visibilityScope),
            )
            .order("desc")
            .take(sourceTraceFetchLimit) as Promise<SourceTraceRow[]>,
        ),
      ),
      ctx.db
        .query("communityAiFeedPosts" as any)
        .withIndex("by_community_status_score_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("status", "live"),
        )
        .order("desc")
        .take(aiFeedFetchLimit) as Promise<AiFeedPostRow[]>,
      ctx.db
        .query("communityOutcomeObservations" as any)
        .withIndex("by_community_observedAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(outcomeLimit) as Promise<OutcomeObservationRow[]>,
      ctx.db
        .query("communityIntelligenceChangeRequests" as any)
        .withIndex("by_community_status", (q: any) =>
          q.eq("communityId", args.communityId).eq("status", "pending_decision"),
        )
        .take(1000) as Promise<ChangeRequestRow[]>,
    ]);
    const traceCandidateRows = traceRowsByVisibility
      .flatMap((rows) => rows)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, sourceTraceFetchLimit);
    const rankedAiFeedSignals = aiFeedRows
      .slice()
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || b.createdAt - a.createdAt)
      .slice(0, aiFeedLimit);
    const rankedAiFeedIds = new Set(
      rankedAiFeedSignals.map((row) => normalizeIdValue(row._id)),
    );
    const eligibleTraceRows = traceCandidateRows.filter((row) =>
      isCommunityCompilerEvidenceTrace(row),
    );
    const traceRows = eligibleTraceRows
      .filter(
        (row) =>
          row.sourceType !== "ai_feed" ||
          !rankedAiFeedIds.has(String(row.sourceId ?? "").trim()),
      )
      .slice(0, sourceTraceLimit);
    const duplicateAiFeedTraceCount = eligibleTraceRows.filter(
      (row) =>
        row.sourceType === "ai_feed" &&
        rankedAiFeedIds.has(String(row.sourceId ?? "").trim()),
    ).length;

    return {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      retrieved_at: toIsoString(Date.now()),
      recent_source_traces: traceRows.map(mapTrace),
      ranked_ai_feed_signals: rankedAiFeedSignals.map(mapAiFeedSignal),
      recent_outcome_observations: outcomeRows.map(mapOutcome),
      pending_change_requests_count: pendingChangeRequests.length,
      diagnostics: {
        version: 1,
        source_trace_limit: sourceTraceLimit,
        source_trace_fetch_limit: sourceTraceFetchLimit,
        ai_feed_limit: aiFeedLimit,
        ai_feed_fetch_limit: aiFeedFetchLimit,
        outcome_limit: outcomeLimit,
        source_traces_considered: traceCandidateRows.length,
        source_traces_returned: traceRows.length,
        duplicate_ai_feed_trace_projections_removed: duplicateAiFeedTraceCount,
        ai_feed_signals_considered: aiFeedRows.length,
        ai_feed_signals_returned: rankedAiFeedSignals.length,
        outcome_observations_returned: outcomeRows.length,
      },
    };
  },
});
