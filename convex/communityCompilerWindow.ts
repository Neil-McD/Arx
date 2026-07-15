import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  normalizeIdValue,
  requireCommunityManager,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  COMPILER_EVIDENCE_VISIBILITY_SCOPES,
  isCommunityCompilerEvidenceTrace,
} from "./communityCompilerEvidenceCore";
import { buildCommunityAiFeedEvidenceRef } from "../shared/communityEvidenceContract";

const COMMUNITY_COMPILER_WINDOW_DAYS = 30;
const COMMUNITY_COMPILER_WINDOW_MS = COMMUNITY_COMPILER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const MAX_ARCHIVE_ACTIVITY_FETCH = 600;
const MAX_SOURCE_TRACE_FETCH = 600;
const MAX_AI_FEED_FETCH = 300;
const MAX_EVENT_FETCH = 150;
const MAX_OUTCOME_FETCH = 150;
const MAX_NEW_MEMBER_FETCH = 1_000;
const MAX_ACTIVE_MEMBER_FETCH = 2_000;
const MAX_AI_FEED_REACTION_FETCH = 1_000;
const MAX_LATEST_NEW_MEMBERS = 25;

type ArchiveActivityRow = {
  _id: any;
  communityId: any;
  sourceType: "chat" | "interaction" | "ai_feed" | "resource";
  sourceId: string;
  title?: string;
  snippet: string;
  url?: string;
  authorLabel?: string;
  postType?: "observation" | "recommendation" | "action";
  resourceType?: string;
  isPdf: boolean;
  embeddingStatus: "pending" | "embedded" | "failed";
  createdAt: number;
  updatedAt: number;
};

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
  authorUserId?: any;
  agentKey?: string;
  authorLabel: string;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  evidence?: string[];
  whyNow?: string;
  status: "live" | "hidden";
  score: number;
  goodCount: number;
  lowSignalCount: number;
  noveltyKey?: string;
  createdAt: number;
  updatedAt: number;
};

type EventRow = {
  _id: any;
  communityId: any;
  title: string;
  descriptionMd?: string;
  startsAt: number;
  endsAt?: number;
  timezone: string;
  locationType: "online" | "physical" | "tbd";
  locationLabel?: string;
  url?: string;
  visibility: "members" | "public";
  status: "live" | "cancelled";
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

type MembershipRow = {
  _id: any;
  communityId: any;
  userId: any;
  role: "admin" | "moderator" | "member";
  active?: boolean;
  revokedAt?: number;
  revokedReason?: string;
  createdAt: number;
  updatedAt: number;
};

type PresenceRow = {
  _id: any;
  communityId: any;
  userId: any;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
};

type AiFeedReactionRow = {
  _id: any;
  communityId: any;
  actorUserId?: any;
  actorKey: string;
  reactionType: "good" | "low_signal";
  createdAt: number;
  updatedAt: number;
};

function boundedLimit(raw: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function mapArchiveActivity(row: ArchiveActivityRow) {
  return {
    id: normalizeIdValue(row._id),
    source_type: row.sourceType,
    source_id: row.sourceId,
    title: row.title ?? null,
    snippet: row.snippet,
    url: row.url ?? null,
    author_label: row.authorLabel ?? null,
    post_type: row.postType ?? null,
    resource_type: row.resourceType ?? null,
    is_pdf: Boolean(row.isPdf),
    embedding_status: row.embeddingStatus,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
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
    why_now: row.whyNow ?? null,
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

function mapEvent(row: EventRow) {
  return {
    id: normalizeIdValue(row._id),
    title: row.title,
    description_md: row.descriptionMd ?? null,
    starts_at: toIsoString(row.startsAt),
    ends_at: row.endsAt ? toIsoString(row.endsAt) : null,
    timezone: row.timezone,
    location_type: row.locationType,
    location_label: row.locationLabel ?? null,
    url: row.url ?? null,
    visibility: row.visibility,
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

async function mapLatestNewMember(ctx: any, row: MembershipRow, userIdCache: Map<string, string | null>) {
  return {
    public_user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? normalizeIdValue(row.userId),
    role: row.role,
    joined_at: toIsoString(row.createdAt),
  };
}

export const readCommunityCompilerWindow = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    archiveActivityLimit: v.optional(v.number()),
    sourceTraceLimit: v.optional(v.number()),
    aiFeedLimit: v.optional(v.number()),
    eventLimit: v.optional(v.number()),
    outcomeLimit: v.optional(v.number()),
    latestMemberLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });

    const nowMs = Date.now();
    const windowStartedAtMs = nowMs - COMMUNITY_COMPILER_WINDOW_MS;
    const archiveActivityLimit = boundedLimit(args.archiveActivityLimit, 80, 200);
    const sourceTraceLimit = boundedLimit(args.sourceTraceLimit, 80, 200);
    const aiFeedLimit = boundedLimit(args.aiFeedLimit, 30, 100);
    const eventLimit = boundedLimit(args.eventLimit, 25, 75);
    const outcomeLimit = boundedLimit(args.outcomeLimit, 25, 75);
    const latestMemberLimit = boundedLimit(args.latestMemberLimit, 10, MAX_LATEST_NEW_MEMBERS);
    const sourceTraceFetchLimit = Math.min(MAX_SOURCE_TRACE_FETCH, sourceTraceLimit * 3);

    const [
      archiveRows,
      traceRowsByVisibility,
      aiFeedRows,
      eventRows,
      outcomeRows,
      newMemberRows,
      activePresenceRows,
      aiFeedReactionRows,
    ] =
      await Promise.all([
        ctx.db
          .query("communityArchiveDocuments" as any)
          .withIndex("by_community_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
          )
          .order("desc")
          .take(Math.min(MAX_ARCHIVE_ACTIVITY_FETCH, archiveActivityLimit * 3)) as Promise<ArchiveActivityRow[]>,
        Promise.all(
          COMPILER_EVIDENCE_VISIBILITY_SCOPES.map((visibilityScope) =>
            ctx.db
              .query("communitySourceTraces" as any)
              .withIndex("by_community_visibility_createdAt", (q: any) =>
                q
                  .eq("communityId", args.communityId)
                  .eq("visibilityScope", visibilityScope)
                  .gte("createdAt", windowStartedAtMs),
              )
              .order("desc")
              .take(sourceTraceFetchLimit) as Promise<SourceTraceRow[]>,
          ),
        ),
        ctx.db
          .query("communityAiFeedPosts" as any)
          .withIndex("by_community_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", "live").gte("createdAt", windowStartedAtMs),
          )
          .order("desc")
          .take(Math.min(MAX_AI_FEED_FETCH, aiFeedLimit * 3)) as Promise<AiFeedPostRow[]>,
        ctx.db
          .query("communityEvents" as any)
          .withIndex("by_community_status_updatedAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", "live").gte("updatedAt", windowStartedAtMs),
          )
          .order("desc")
          .take(Math.min(MAX_EVENT_FETCH, eventLimit)) as Promise<EventRow[]>,
        ctx.db
          .query("communityOutcomeObservations" as any)
          .withIndex("by_community_observedAt", (q: any) =>
            q.eq("communityId", args.communityId).gte("observedAt", windowStartedAtMs),
          )
          .order("desc")
          .take(Math.min(MAX_OUTCOME_FETCH, outcomeLimit)) as Promise<OutcomeObservationRow[]>,
        ctx.db
          .query("communityMemberships" as any)
          .withIndex("by_community_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
          )
          .order("desc")
          .take(MAX_NEW_MEMBER_FETCH) as Promise<MembershipRow[]>,
        ctx.db
          .query("communityPresence" as any)
          .withIndex("by_community_lastSeenAt", (q: any) =>
            q.eq("communityId", args.communityId).gte("lastSeenAt", windowStartedAtMs),
          )
          .order("desc")
          .take(MAX_ACTIVE_MEMBER_FETCH) as Promise<PresenceRow[]>,
        ctx.db
          .query("communityAiFeedReactions" as any)
          .withIndex("by_community_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
          )
          .order("desc")
          .take(MAX_AI_FEED_REACTION_FETCH) as Promise<AiFeedReactionRow[]>,
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
    const eligibleSourceTraces = traceCandidateRows.filter((row) =>
      isCommunityCompilerEvidenceTrace(row),
    );
    const sourceTraces = eligibleSourceTraces
      .filter(
        (row) =>
          row.sourceType !== "ai_feed" ||
          !rankedAiFeedIds.has(String(row.sourceId ?? "").trim()),
      )
      .slice(0, sourceTraceLimit);
    const representedAiFeedIds = new Set(rankedAiFeedIds);
    for (const trace of sourceTraces) {
      if (trace.sourceType === "ai_feed" && trace.sourceId) {
        representedAiFeedIds.add(String(trace.sourceId).trim());
      }
    }
    const archiveActivity = archiveRows
      .filter(
        (row) =>
          row.sourceType !== "ai_feed" ||
          !representedAiFeedIds.has(String(row.sourceId ?? "").trim()),
      )
      .slice(0, archiveActivityLimit);
    const duplicateAiFeedTraceCount = eligibleSourceTraces.filter(
      (row) =>
        row.sourceType === "ai_feed" &&
        rankedAiFeedIds.has(String(row.sourceId ?? "").trim()),
    ).length;
    const duplicateAiFeedArchiveCount = archiveRows.filter(
      (row) =>
        row.sourceType === "ai_feed" &&
        representedAiFeedIds.has(String(row.sourceId ?? "").trim()),
    ).length;
    const activeNewMemberRows = newMemberRows.filter(communityMembershipRowIsActive);
    const activePresenceUserIds = new Set(activePresenceRows.map((row) => normalizeIdValue(row.userId)).filter(Boolean));
    const reactingMemberKeys = new Set(
      aiFeedReactionRows
        .map((row) => (row.actorUserId ? normalizeIdValue(row.actorUserId) : String(row.actorKey ?? "").trim()))
        .filter(Boolean),
    );
    const postingMemberKeys = new Set(
      archiveRows
        .filter((row) => row.sourceType === "interaction")
        .map((row) => String(row.authorLabel ?? "").trim())
        .filter((label) => label.startsWith("member:")),
    );
    const userIdCache = new Map<string, string | null>();
    const latestNewMembers = await Promise.all(
      activeNewMemberRows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, latestMemberLimit)
        .map((row) => mapLatestNewMember(ctx, row, userIdCache)),
    );

    return {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      retrieved_at: toIsoString(nowMs),
      compiler_window: {
        days: COMMUNITY_COMPILER_WINDOW_DAYS,
        started_at: toIsoString(windowStartedAtMs),
        ended_at: toIsoString(nowMs),
        long_term_boundary: "activity older than the compiler window should be retrieved through directory, archive, outcomes, resources, or other long-term memory layers",
      },
      archive_activity: archiveActivity.map(mapArchiveActivity),
      recent_source_traces: sourceTraces.map(mapTrace),
      ranked_ai_feed_signals: rankedAiFeedSignals.map(mapAiFeedSignal),
      recent_events: eventRows.map(mapEvent),
      member_state: {
        new_members_count: activeNewMemberRows.length,
        active_members_count: activePresenceUserIds.size,
        posting_members_in_activity_count: postingMemberKeys.size,
        ai_feed_reacting_members_count: reactingMemberKeys.size,
        latest_new_members: latestNewMembers,
        boundaries: {
          aggregate_only: true,
          no_hidden_scoring: true,
          latest_new_members_limit: latestMemberLimit,
        },
      },
      recent_outcome_observations: outcomeRows.map(mapOutcome),
      diagnostics: {
        version: 1,
        archive_activity_limit: archiveActivityLimit,
        source_trace_limit: sourceTraceLimit,
        ai_feed_limit: aiFeedLimit,
        event_limit: eventLimit,
        outcome_limit: outcomeLimit,
        latest_member_limit: latestMemberLimit,
        archive_activity_considered: archiveRows.length,
        archive_activity_returned: archiveActivity.length,
        source_traces_considered: traceCandidateRows.length,
        source_traces_returned: sourceTraces.length,
        duplicate_ai_feed_trace_projections_removed: duplicateAiFeedTraceCount,
        duplicate_ai_feed_archive_projections_removed: duplicateAiFeedArchiveCount,
        ai_feed_signals_considered: aiFeedRows.length,
        ai_feed_signals_returned: rankedAiFeedSignals.length,
        events_returned: eventRows.length,
        outcome_observations_returned: outcomeRows.length,
        new_members_considered: newMemberRows.length,
        active_presence_rows_considered: activePresenceRows.length,
        ai_feed_reactions_considered: aiFeedReactionRows.length,
        member_state_truncated: {
          new_members: newMemberRows.length >= MAX_NEW_MEMBER_FETCH,
          active_members: activePresenceRows.length >= MAX_ACTIVE_MEMBER_FETCH,
          ai_feed_reactions: aiFeedReactionRows.length >= MAX_AI_FEED_REACTION_FETCH,
        },
      },
    };
  },
});
