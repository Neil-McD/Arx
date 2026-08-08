import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

export const AI_FEED_RETIREMENT_CENSUS_VERSION =
  "ai_feed_retirement_census_v3" as const;

const retirementCategory = v.union(
  v.literal("posts"),
  v.literal("reactions"),
  v.literal("source_traces"),
  v.literal("evidence_citations"),
  v.literal("archive_documents"),
  v.literal("retrieval_logs"),
  v.literal("activity_events"),
  v.literal("compiler_digests"),
  v.literal("intelligence_nodes"),
  v.literal("intelligence_edges"),
  v.literal("intelligence_mutations"),
  v.literal("intelligence_change_requests"),
  v.literal("agent_serve_requests"),
  v.literal("intelligence_retrieval_logs"),
  v.literal("outcome_observations"),
  v.literal("memory_metabolizer_runs"),
  v.literal("member_settings"),
);

export type RetirementCategory =
  | "posts"
  | "reactions"
  | "source_traces"
  | "evidence_citations"
  | "archive_documents"
  | "retrieval_logs"
  | "activity_events"
  | "compiler_digests"
  | "intelligence_nodes"
  | "intelligence_edges"
  | "intelligence_mutations"
  | "intelligence_change_requests"
  | "agent_serve_requests"
  | "intelligence_retrieval_logs"
  | "outcome_observations"
  | "memory_metabolizer_runs"
  | "member_settings";

const TABLE_BY_CATEGORY: Record<RetirementCategory, string> = {
  posts: "communityAiFeedPosts",
  reactions: "communityAiFeedReactions",
  source_traces: "communitySourceTraces",
  evidence_citations: "communityEvidenceCitations",
  archive_documents: "communityArchiveDocuments",
  retrieval_logs: "communityEvidenceRetrievalLogs",
  activity_events: "communityActivityEvents",
  compiler_digests: "communityCompilerDigests",
  intelligence_nodes: "communityIntelligenceNodes",
  intelligence_edges: "communityIntelligenceEdges",
  intelligence_mutations: "communityIntelligenceMutations",
  intelligence_change_requests: "communityIntelligenceChangeRequests",
  agent_serve_requests: "communityAgentServeRequests",
  intelligence_retrieval_logs: "communityIntelligenceRetrievalLogs",
  outcome_observations: "communityOutcomeObservations",
  memory_metabolizer_runs: "communityMemoryMetabolizerRuns",
  member_settings: "communityMemberSettings",
};

const COMMUNITY_INDEX_BY_CATEGORY: Record<RetirementCategory, string> = {
  posts: "by_community",
  reactions: "by_community",
  source_traces: "by_community",
  evidence_citations: "by_community",
  archive_documents: "by_community",
  retrieval_logs: "by_community_createdAt",
  activity_events: "by_community_createdAt",
  compiler_digests: "by_community_createdAt",
  intelligence_nodes: "by_community",
  intelligence_edges: "by_community",
  intelligence_mutations: "by_community_createdAt",
  intelligence_change_requests: "by_community_createdAt",
  agent_serve_requests: "by_community_createdAt",
  intelligence_retrieval_logs: "by_community_createdAt",
  outcome_observations: "by_community",
  memory_metabolizer_runs: "by_community_finishedAt",
  member_settings: "by_community",
};

export const AI_FEED_RETIREMENT_DELETE_ORDER: RetirementCategory[] = [
  "member_settings",
  "agent_serve_requests",
  "retrieval_logs",
  "intelligence_retrieval_logs",
  "outcome_observations",
  "memory_metabolizer_runs",
  "intelligence_change_requests",
  "intelligence_mutations",
  "intelligence_edges",
  "intelligence_nodes",
  "compiler_digests",
  "activity_events",
  "archive_documents",
  "evidence_citations",
  "source_traces",
  "reactions",
  "posts",
];

export type RetirementDisposition = "delete" | "patch" | "blocked" | "keep";

type AppliedRetirementBatch = {
  category: RetirementCategory;
  dryRun: boolean;
  examined: number;
  deleted: number;
  wouldDelete: number;
  patched: number;
  wouldPatch: number;
  blockedRows: number;
  skipped: number;
};

type RetirementBatchResult =
  | {
      version: typeof AI_FEED_RETIREMENT_CENSUS_VERSION;
      category: RetirementCategory;
      dryRun: boolean;
      blocked: true;
      blockedCount: number;
      blockedSampleIds: string[];
      remaining: number;
    }
  | (AppliedRetirementBatch & {
      version: typeof AI_FEED_RETIREMENT_CENSUS_VERSION;
      blocked: false;
      remaining: number;
      hasMore: boolean;
    });

function idSet(values: string[]): Set<string> {
  return new Set(
    values.map((value) => String(value ?? "").trim()).filter(Boolean),
  );
}

function matchingIds(values: unknown, accepted: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value ?? ""))
    .filter((value) => accepted.has(value));
}

function containsAny(values: unknown, accepted: Set<string>): boolean {
  return (
    Array.isArray(values) && values.some((value) => accepted.has(String(value)))
  );
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function isRetiredFeedRef(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("ai_feed:") || /(^|\/)ai-feed(\/|$)/.test(value);
}

function compilerItemIsFeed(item: unknown, feedTraceIds: Set<string>): boolean {
  const value = record(item);
  return (
    value.category === "ai_feed_signal" ||
    (Array.isArray(value.sourceTypes) &&
      value.sourceTypes.includes("ai_feed")) ||
    (Array.isArray(value.sourceIds) &&
      value.sourceIds.some(isRetiredFeedRef)) ||
    containsAny(value.sourceTraceIds, feedTraceIds)
  );
}

export function classifyAiFeedRetirementRow(args: {
  category: RetirementCategory;
  row: Record<string, any>;
  feedTraceIds: Set<string>;
  feedCitationIds: Set<string>;
  feedNodeIds?: Set<string>;
  feedEdgeIds?: Set<string>;
}): RetirementDisposition {
  const {
    category,
    row,
    feedTraceIds,
    feedCitationIds,
    feedNodeIds = new Set<string>(),
    feedEdgeIds = new Set<string>(),
  } = args;
  switch (category) {
    case "posts":
    case "reactions":
      return "delete";
    case "source_traces":
      return row.sourceType === "ai_feed" ? "delete" : "keep";
    case "evidence_citations":
      return row.sourceKind === "ai_feed" ||
        String(row.sourceRef ?? "").startsWith("ai_feed:") ||
        feedTraceIds.has(String(row.sourceTraceId ?? ""))
        ? "delete"
        : "keep";
    case "archive_documents":
      return row.sourceType === "ai_feed" ? "delete" : "keep";
    case "retrieval_logs":
      {
        const resultRefs = Array.isArray(row.resultRefs) ? row.resultRefs : [];
        const feedRefs = resultRefs.filter(isRetiredFeedRef);
        const otherRefs = resultRefs.filter(
          (value: unknown) => !isRetiredFeedRef(value),
        );
        const feedCapability =
          row.capability === "community_ai_feed_search" ||
          row.capability === "community_ai_feed_read";
        if (!feedCapability && feedRefs.length === 0) return "keep";
        if (feedCapability && otherRefs.length === 0) return "delete";
        return feedCapability ? "blocked" : "patch";
      }
    case "activity_events":
      return row.type === "ai_feed_post_added" ||
        row.targetType === "ai_feed_post"
        ? "delete"
        : "keep";
    case "compiler_digests": {
      const items = Array.isArray(row.items) ? row.items : [];
      const feedItems = items.filter((item) =>
        compilerItemIsFeed(item, feedTraceIds),
      );
      const hasFeedCounts =
        Number(row.signalCounts?.aiFeed ?? 0) > 0 ||
        Number(row.signalCounts?.aiFeedReactingMembers ?? 0) > 0;
      return feedItems.length === 0 && !hasFeedCounts ? "keep" : "blocked";
    }
    case "intelligence_nodes": {
      const feedTraces = matchingIds(row.sourceTraceIds, feedTraceIds);
      const feedCitations = matchingIds(
        row.evidenceCitationIds,
        feedCitationIds,
      );
      if (feedTraces.length === 0 && feedCitations.length === 0) return "keep";
      return "blocked";
    }
    case "intelligence_edges": {
      const feedTraces = matchingIds(row.evidenceTraceIds, feedTraceIds);
      const feedCitations = matchingIds(
        row.evidenceCitationIds,
        feedCitationIds,
      );
      const directFeedReference =
        row.toReferenceType === "trace" &&
        feedTraceIds.has(String(row.toReferenceId ?? ""));
      const touchesFeedNode =
        feedNodeIds.has(String(row.fromNodeId ?? "")) ||
        feedNodeIds.has(String(row.toNodeId ?? ""));
      return feedTraces.length === 0 &&
        feedCitations.length === 0 &&
        !directFeedReference &&
        !touchesFeedNode
        ? "keep"
        : "blocked";
    }
    case "intelligence_mutations": {
      const feedTraces = matchingIds(row.sourceTraceIds, feedTraceIds);
      const touchesFeedTarget =
        containsAny(row.targetNodeIds, feedNodeIds) ||
        containsAny(row.targetEdgeIds, feedEdgeIds) ||
        feedNodeIds.has(String(row.primaryTargetNodeId ?? "")) ||
        feedEdgeIds.has(String(row.primaryTargetEdgeId ?? ""));
      return feedTraces.length === 0 && !touchesFeedTarget
        ? "keep"
        : "blocked";
    }
    case "intelligence_change_requests": {
      const feedTraces = matchingIds(row.sourceTraceIds, feedTraceIds);
      const feedCitations = matchingIds(
        row.evidenceCitationIds,
        feedCitationIds,
      );
      const touchesFeedTarget =
        containsAny(row.targetNodeIds, feedNodeIds) ||
        containsAny(row.targetEdgeIds, feedEdgeIds) ||
        feedNodeIds.has(String(row.primaryTargetNodeId ?? "")) ||
        feedEdgeIds.has(String(row.primaryTargetEdgeId ?? "")) ||
        (Array.isArray(row.targetNodeSnapshots) &&
          row.targetNodeSnapshots.some((snapshot: unknown) =>
            feedNodeIds.has(String(record(snapshot).nodeId ?? "")),
          )) ||
        (Array.isArray(row.targetEdgeSnapshots) &&
          row.targetEdgeSnapshots.some((snapshot: unknown) =>
            feedEdgeIds.has(String(record(snapshot).edgeId ?? "")),
          ));
      return feedTraces.length === 0 &&
        feedCitations.length === 0 &&
        !touchesFeedTarget
        ? "keep"
        : "blocked";
    }
    case "agent_serve_requests":
      return feedTraceIds.has(String(row.sourceTraceId ?? ""))
        ? "patch"
        : "keep";
    case "intelligence_retrieval_logs":
      return containsAny(row.retrievedNodeIds, feedNodeIds) ||
        containsAny(row.injectedNodeIds, feedNodeIds)
        ? "blocked"
        : "keep";
    case "outcome_observations":
      return feedNodeIds.has(String(row.nodeId ?? "")) ? "blocked" : "keep";
    case "memory_metabolizer_runs":
      return containsAny(row.changedNodeIds, feedNodeIds)
        ? "blocked"
        : "keep";
    case "member_settings":
      return typeof row.aiFeedLastSeenAt === "number" ? "patch" : "keep";
  }
}

export const inspectAiFeedRetirementPageInternal = internalQuery({
  args: {
    category: retirementCategory,
    communityId: v.optional(v.id("communities")),
    feedTraceIds: v.array(v.string()),
    feedCitationIds: v.array(v.string()),
    feedNodeIds: v.array(v.string()),
    feedEdgeIds: v.array(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query(TABLE_BY_CATEGORY[args.category] as any) as any;
    if (args.communityId) {
      query = query.withIndex(
        COMMUNITY_INDEX_BY_CATEGORY[args.category] as any,
        (q: any) => q.eq("communityId", args.communityId),
      );
    }
    const result = await query
      .order("asc")
      .paginate(args.paginationOpts);
    const traceIds = idSet(args.feedTraceIds);
    const citationIds = idSet(args.feedCitationIds);
    const nodeIds = idSet(args.feedNodeIds);
    const edgeIds = idSet(args.feedEdgeIds);
    const plans = (result.page as Array<Record<string, any>>).map((row) => ({
      id: String(row._id),
      disposition: classifyAiFeedRetirementRow({
        category: args.category,
        row,
        feedTraceIds: traceIds,
        feedCitationIds: citationIds,
        feedNodeIds: nodeIds,
        feedEdgeIds: edgeIds,
      }),
    }));
    const ids = (disposition: RetirementDisposition) =>
      plans
        .filter((plan) => plan.disposition === disposition)
        .map((plan) => plan.id);
    return {
      matches: plans
        .filter((plan) => plan.disposition !== "keep")
        .map((plan) => plan.id),
      deletableIds: ids("delete"),
      patchableIds: ids("patch"),
      blockedIds: ids("blocked"),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

type ReferenceTarget = { field: string; table: string; id: string };

function addReferences(
  targets: ReferenceTarget[],
  field: string,
  table: string,
  values: unknown,
) {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    const id = String(value ?? "");
    if (id) targets.push({ field, table, id });
  }
}

function addReference(
  targets: ReferenceTarget[],
  field: string,
  table: string,
  value: unknown,
) {
  const id = String(value ?? "");
  if (id) targets.push({ field, table, id });
}

function referenceTargetsForRow(
  category: RetirementCategory,
  row: Record<string, any>,
): ReferenceTarget[] {
  const targets: ReferenceTarget[] = [];
  switch (category) {
    case "reactions":
      addReference(targets, "postId", "communityAiFeedPosts", row.postId);
      break;
    case "source_traces":
      addReferences(
        targets,
        "outcomeObservationIds",
        "communityOutcomeObservations",
        row.outcomeObservationIds,
      );
      addReference(
        targets,
        "compilerLastDigestId",
        "communityCompilerDigests",
        row.compilerLastDigestId,
      );
      addReference(
        targets,
        "compilerDecision.targetNodeId",
        "communityIntelligenceNodes",
        record(row.compilerDecision).targetNodeId,
      );
      break;
    case "evidence_citations":
      addReference(
        targets,
        "sourceTraceId",
        "communitySourceTraces",
        row.sourceTraceId,
      );
      break;
    case "intelligence_nodes":
      addReferences(
        targets,
        "sourceTraceIds",
        "communitySourceTraces",
        row.sourceTraceIds,
      );
      addReferences(
        targets,
        "evidenceCitationIds",
        "communityEvidenceCitations",
        row.evidenceCitationIds,
      );
      addReferences(
        targets,
        "outcomeObservationIds",
        "communityOutcomeObservations",
        row.outcomeObservationIds,
      );
      addReference(
        targets,
        "deprecatedByNodeId",
        "communityIntelligenceNodes",
        row.deprecatedByNodeId,
      );
      addReference(
        targets,
        "originChangeRequestId",
        "communityIntelligenceChangeRequests",
        row.originChangeRequestId,
      );
      break;
    case "intelligence_edges":
      addReference(
        targets,
        "fromNodeId",
        "communityIntelligenceNodes",
        row.fromNodeId,
      );
      addReference(
        targets,
        "toNodeId",
        "communityIntelligenceNodes",
        row.toNodeId,
      );
      if (row.toReferenceType === "trace") {
        addReference(
          targets,
          "toReferenceId",
          "communitySourceTraces",
          row.toReferenceId,
        );
      }
      addReferences(
        targets,
        "evidenceTraceIds",
        "communitySourceTraces",
        row.evidenceTraceIds,
      );
      addReferences(
        targets,
        "evidenceCitationIds",
        "communityEvidenceCitations",
        row.evidenceCitationIds,
      );
      break;
    case "intelligence_mutations":
      addReferences(
        targets,
        "targetNodeIds",
        "communityIntelligenceNodes",
        row.targetNodeIds,
      );
      addReferences(
        targets,
        "targetEdgeIds",
        "communityIntelligenceEdges",
        row.targetEdgeIds,
      );
      addReference(
        targets,
        "primaryTargetNodeId",
        "communityIntelligenceNodes",
        row.primaryTargetNodeId,
      );
      addReference(
        targets,
        "primaryTargetEdgeId",
        "communityIntelligenceEdges",
        row.primaryTargetEdgeId,
      );
      addReferences(
        targets,
        "sourceTraceIds",
        "communitySourceTraces",
        row.sourceTraceIds,
      );
      break;
    case "intelligence_change_requests":
      addReferences(
        targets,
        "sourceTraceIds",
        "communitySourceTraces",
        row.sourceTraceIds,
      );
      addReferences(
        targets,
        "evidenceCitationIds",
        "communityEvidenceCitations",
        row.evidenceCitationIds,
      );
      addReferences(
        targets,
        "outcomeObservationIds",
        "communityOutcomeObservations",
        row.outcomeObservationIds,
      );
      addReferences(
        targets,
        "targetNodeIds",
        "communityIntelligenceNodes",
        row.targetNodeIds,
      );
      addReferences(
        targets,
        "targetEdgeIds",
        "communityIntelligenceEdges",
        row.targetEdgeIds,
      );
      addReference(
        targets,
        "primaryTargetNodeId",
        "communityIntelligenceNodes",
        row.primaryTargetNodeId,
      );
      addReference(
        targets,
        "primaryTargetEdgeId",
        "communityIntelligenceEdges",
        row.primaryTargetEdgeId,
      );
      for (const snapshot of Array.isArray(row.targetNodeSnapshots)
        ? row.targetNodeSnapshots
        : []) {
        addReference(
          targets,
          "targetNodeSnapshots.nodeId",
          "communityIntelligenceNodes",
          record(snapshot).nodeId,
        );
      }
      for (const snapshot of Array.isArray(row.targetEdgeSnapshots)
        ? row.targetEdgeSnapshots
        : []) {
        addReference(
          targets,
          "targetEdgeSnapshots.edgeId",
          "communityIntelligenceEdges",
          record(snapshot).edgeId,
        );
      }
      addReference(
        targets,
        "appliedMutationId",
        "communityIntelligenceMutations",
        row.appliedMutationId,
      );
      break;
    case "agent_serve_requests":
      addReference(
        targets,
        "sourceTraceId",
        "communitySourceTraces",
        row.sourceTraceId,
      );
      break;
    case "intelligence_retrieval_logs":
      addReferences(
        targets,
        "retrievedNodeIds",
        "communityIntelligenceNodes",
        row.retrievedNodeIds,
      );
      addReferences(
        targets,
        "injectedNodeIds",
        "communityIntelligenceNodes",
        row.injectedNodeIds,
      );
      addReferences(
        targets,
        "outcomeObservationIds",
        "communityOutcomeObservations",
        row.outcomeObservationIds,
      );
      break;
    case "outcome_observations":
      addReference(
        targets,
        "nodeId",
        "communityIntelligenceNodes",
        row.nodeId,
      );
      addReference(
        targets,
        "retrievalLogId",
        "communityIntelligenceRetrievalLogs",
        row.retrievalLogId,
      );
      break;
    case "memory_metabolizer_runs":
      addReferences(
        targets,
        "changedNodeIds",
        "communityIntelligenceNodes",
        row.changedNodeIds,
      );
      break;
    case "compiler_digests":
      for (const item of Array.isArray(row.items) ? row.items : []) {
        addReferences(
          targets,
          "items.sourceTraceIds",
          "communitySourceTraces",
          record(item).sourceTraceIds,
        );
      }
      break;
  }
  return targets;
}

const DANGLING_REFERENCE_CATEGORIES: RetirementCategory[] = [
  "reactions",
  "source_traces",
  "evidence_citations",
  "compiler_digests",
  "intelligence_nodes",
  "intelligence_edges",
  "intelligence_mutations",
  "intelligence_change_requests",
  "agent_serve_requests",
  "intelligence_retrieval_logs",
  "outcome_observations",
  "memory_metabolizer_runs",
];

export const inspectAiFeedDanglingReferencePageInternal = internalQuery({
  args: {
    category: retirementCategory,
    communityId: v.id("communities"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await (ctx.db
      .query(TABLE_BY_CATEGORY[args.category] as any) as any)
      .withIndex(
        COMMUNITY_INDEX_BY_CATEGORY[args.category] as any,
        (q: any) => q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    const missing: Array<{
      sourceId: string;
      field: string;
      table: string;
      targetId: string;
    }> = [];
    for (const row of result.page as Array<Record<string, any>>) {
      const unique = new Map(
        referenceTargetsForRow(args.category, row).map((target) => [
          `${target.table}:${target.id}`,
          target,
        ]),
      );
      for (const target of unique.values()) {
        const normalizedId = ctx.db.normalizeId(target.table as any, target.id);
        if (!normalizedId || !(await ctx.db.get(normalizedId))) {
          missing.push({
            sourceId: String(row._id),
            field: target.field,
            table: target.table,
            targetId: target.id,
          });
        }
      }
    }
    return {
      missing,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

const CATEGORIES: RetirementCategory[] = [
  "posts",
  "reactions",
  "source_traces",
  "evidence_citations",
  "archive_documents",
  "retrieval_logs",
  "activity_events",
  "compiler_digests",
  "intelligence_nodes",
  "intelligence_edges",
  "intelligence_mutations",
  "intelligence_change_requests",
  "agent_serve_requests",
  "intelligence_retrieval_logs",
  "outcome_observations",
  "memory_metabolizer_runs",
  "member_settings",
];

async function inspectCategory(args: {
  ctx: any;
  category: RetirementCategory;
  communityId?: string;
  feedTraceIds: string[];
  feedCitationIds: string[];
  feedNodeIds?: string[];
  feedEdgeIds?: string[];
}) {
  const matchedIds: string[] = [];
  const deletableIds: string[] = [];
  const patchableIds: string[] = [];
  const blockedIds: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let isDone = false;
  while (!isDone && pages < 200) {
    const result: {
      matches: string[];
      deletableIds: string[];
      patchableIds: string[];
      blockedIds: string[];
      continueCursor: string | null;
      isDone: boolean;
    } = await args.ctx.runQuery(
      (internal as any).communityAiFeedRetirement
        .inspectAiFeedRetirementPageInternal,
      {
        category: args.category,
        communityId: args.communityId,
        feedTraceIds: args.feedTraceIds,
        feedCitationIds: args.feedCitationIds,
        feedNodeIds: args.feedNodeIds ?? [],
        feedEdgeIds: args.feedEdgeIds ?? [],
        paginationOpts: {
          cursor,
          numItems: 100,
          maximumRowsRead: 100,
        },
      },
    );
    matchedIds.push(...result.matches);
    deletableIds.push(...result.deletableIds);
    patchableIds.push(...result.patchableIds);
    blockedIds.push(...result.blockedIds);
    cursor = result.continueCursor;
    isDone = result.isDone;
    pages += 1;
  }
  return {
    count: matchedIds.length,
    matchedIds,
    deletableIds,
    patchableIds,
    blockedIds,
    pages,
    truncated: !isDone,
  };
}

async function inspectDanglingReferences(args: {
  ctx: any;
  communityId: string;
}) {
  const sample: Array<{
    category: RetirementCategory;
    sourceId: string;
    field: string;
    table: string;
    targetId: string;
  }> = [];
  let count = 0;
  const pages: Record<string, number> = {};
  const truncated: string[] = [];
  for (const category of DANGLING_REFERENCE_CATEGORIES) {
    let cursor: string | null = null;
    let pageCount = 0;
    let isDone = false;
    while (!isDone && pageCount < 200) {
      const result: {
        missing: Array<{
          sourceId: string;
          field: string;
          table: string;
          targetId: string;
        }>;
        continueCursor: string | null;
        isDone: boolean;
      } = await args.ctx.runQuery(
        (internal as any).communityAiFeedRetirement
          .inspectAiFeedDanglingReferencePageInternal,
        {
          category,
          communityId: args.communityId,
          paginationOpts: {
            cursor,
            numItems: 100,
            maximumRowsRead: 100,
          },
        },
      );
      count += result.missing.length;
      for (const missing of result.missing) {
        if (sample.length < 20) sample.push({ category, ...missing });
      }
      cursor = result.continueCursor;
      isDone = result.isDone;
      pageCount += 1;
    }
    pages[category] = pageCount;
    if (!isDone) truncated.push(category);
  }
  return { count, sample, pages, truncated };
}

export const inspectAiFeedRetirementInternal = internalAction({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const feedSourceTraces = await inspectCategory({
      ctx,
      category: "source_traces",
      communityId: args.communityId,
      feedTraceIds: [],
      feedCitationIds: [],
    });
    const feedTraceIds = feedSourceTraces.deletableIds;
    const feedCitations = await inspectCategory({
      ctx,
      category: "evidence_citations",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds: [],
    });
    const feedCitationIds = feedCitations.deletableIds;
    const feedNodes = await inspectCategory({
      ctx,
      category: "intelligence_nodes",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds,
    });
    const feedNodeIds = feedNodes.matchedIds;
    const feedEdges = await inspectCategory({
      ctx,
      category: "intelligence_edges",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds,
      feedNodeIds,
    });
    const feedEdgeIds = feedEdges.matchedIds;
    const counts: Record<string, number> = {};
    const deletable: Record<string, number> = {};
    const patchable: Record<string, number> = {};
    const blocked: Record<string, number> = {};
    const pages: Record<string, number> = {};
    const truncated: string[] = [];
    for (const category of CATEGORIES) {
      const result =
        category === "intelligence_nodes"
          ? feedNodes
          : category === "intelligence_edges"
            ? feedEdges
            : await inspectCategory({
                ctx,
                category,
                communityId: args.communityId,
                feedTraceIds,
                feedCitationIds,
                feedNodeIds,
                feedEdgeIds,
              });
      counts[category] = result.count;
      deletable[category] = result.deletableIds.length;
      patchable[category] = result.patchableIds.length;
      blocked[category] = result.blockedIds.length;
      pages[category] = result.pages;
      if (result.truncated) truncated.push(category);
    }
    const danglingReferences = await inspectDanglingReferences({
      ctx,
      communityId: String(args.communityId),
    });
    for (const category of danglingReferences.truncated) {
      truncated.push(`dangling:${category}`);
    }
    return {
      version: AI_FEED_RETIREMENT_CENSUS_VERSION,
      communityId: String(args.communityId),
      inspectedAt: Date.now(),
      counts,
      deletable,
      patchable,
      blockedRows: blocked,
      pages,
      danglingReferences,
      complete: truncated.length === 0,
      batchDeletionReady:
        truncated.length === 0 &&
        Object.values(blocked).every((count) => count === 0) &&
        danglingReferences.count === 0,
      retirementComplete:
        truncated.length === 0 &&
        Object.values(counts).every((count) => count === 0) &&
        danglingReferences.count === 0,
      truncated,
    };
  },
});

const MAX_COMMUNITY_LINEAGE_ROWS = 5_000;

async function takeCommunityRows(
  ctx: any,
  table: string,
  index: string,
  communityId: string,
): Promise<Array<Record<string, any>>> {
  const rows = (await (ctx.db.query(table as any) as any)
    .withIndex(index as any, (q: any) => q.eq("communityId", communityId))
    .take(MAX_COMMUNITY_LINEAGE_ROWS + 1)) as Array<Record<string, any>>;
  if (rows.length > MAX_COMMUNITY_LINEAGE_ROWS) {
    throw new Error(`ai_feed_retirement_dependency_plan_too_large:${table}`);
  }
  return rows;
}

async function deriveCommunityLineage(ctx: any, communityId: string) {
  const traces = await takeCommunityRows(
    ctx,
    "communitySourceTraces",
    "by_community",
    communityId,
  );
  const feedTraceIds = idSet(
    traces
      .filter((row) => row.sourceType === "ai_feed")
      .map((row) => String(row._id)),
  );
  const citations = await takeCommunityRows(
    ctx,
    "communityEvidenceCitations",
    "by_community",
    communityId,
  );
  const feedCitationIds = idSet(
    citations
      .filter(
        (row) =>
          row.sourceKind === "ai_feed" ||
          String(row.sourceRef ?? "").startsWith("ai_feed:") ||
          feedTraceIds.has(String(row.sourceTraceId ?? "")),
      )
      .map((row) => String(row._id)),
  );
  const nodes = await takeCommunityRows(
    ctx,
    "communityIntelligenceNodes",
    "by_community",
    communityId,
  );
  const feedNodeIds = idSet(
    nodes
      .filter(
        (row) =>
          containsAny(row.sourceTraceIds, feedTraceIds) ||
          containsAny(row.evidenceCitationIds, feedCitationIds),
      )
      .map((row) => String(row._id)),
  );
  const edges = await takeCommunityRows(
    ctx,
    "communityIntelligenceEdges",
    "by_community",
    communityId,
  );
  const feedEdgeIds = idSet(
    edges
      .filter((row) =>
        classifyAiFeedRetirementRow({
          category: "intelligence_edges",
          row,
          feedTraceIds,
          feedCitationIds,
          feedNodeIds,
        }) === "blocked",
      )
      .map((row) => String(row._id)),
  );
  return { feedTraceIds, feedCitationIds, feedNodeIds, feedEdgeIds };
}

export const applyAiFeedRetirementBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    category: retirementCategory,
    ids: v.array(v.string()),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.ids.length > 100) {
      throw new Error("ai_feed_retirement_batch_limit_exceeded");
    }
    const lineage = await deriveCommunityLineage(
      ctx,
      String(args.communityId),
    );
    let deleted = 0;
    let patched = 0;
    let skipped = 0;
    let blockedRows = 0;
    for (const rawId of args.ids) {
      const normalizedId = ctx.db.normalizeId(
        TABLE_BY_CATEGORY[args.category] as any,
        rawId,
      );
      if (!normalizedId) {
        throw new Error("ai_feed_retirement_id_table_mismatch");
      }
      const row = (await ctx.db.get(normalizedId)) as Record<
        string,
        any
      > | null;
      if (!row) {
        skipped += 1;
        continue;
      }
      if (String(row.communityId ?? "") !== String(args.communityId)) {
        throw new Error("ai_feed_retirement_id_community_mismatch");
      }
      const disposition = classifyAiFeedRetirementRow({
        category: args.category,
        row,
        ...lineage,
      });
      if (disposition === "blocked") {
        blockedRows += 1;
        continue;
      }
      if (disposition === "keep") {
        skipped += 1;
        continue;
      }
      if (disposition === "patch") {
        if (!args.dryRun) {
          if (args.category === "member_settings") {
            await ctx.db.patch(row._id, { aiFeedLastSeenAt: undefined });
          } else if (args.category === "agent_serve_requests") {
            await ctx.db.patch(row._id, { sourceTraceId: undefined });
          } else if (args.category === "retrieval_logs") {
            await ctx.db.patch(row._id, {
              resultRefs: (Array.isArray(row.resultRefs)
                ? row.resultRefs
                : []
              ).filter((value: unknown) => !isRetiredFeedRef(value)),
            });
          } else {
            throw new Error("ai_feed_retirement_patch_category_invalid");
          }
        }
        patched += 1;
        continue;
      }
      if (!args.dryRun) await ctx.db.delete(row._id);
      deleted += 1;
    }
    return {
      category: args.category,
      dryRun: args.dryRun,
      examined: args.ids.length,
      deleted: args.dryRun ? 0 : deleted,
      wouldDelete: deleted,
      patched: args.dryRun ? 0 : patched,
      wouldPatch: patched,
      blockedRows,
      skipped,
    };
  },
});

export const deleteAiFeedRetirementBatchInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    category: retirementCategory,
    expectedCensusVersion: v.string(),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RetirementBatchResult> => {
    if (args.expectedCensusVersion !== AI_FEED_RETIREMENT_CENSUS_VERSION) {
      throw new Error("ai_feed_retirement_census_version_mismatch");
    }
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    const dryRun = args.dryRun !== false;
    const sourceTraces = await inspectCategory({
      ctx,
      category: "source_traces",
      communityId: args.communityId,
      feedTraceIds: [],
      feedCitationIds: [],
    });
    const feedTraceIds = sourceTraces.deletableIds;
    const citations = await inspectCategory({
      ctx,
      category: "evidence_citations",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds: [],
    });
    const feedCitationIds = citations.deletableIds;
    const nodes = await inspectCategory({
      ctx,
      category: "intelligence_nodes",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds,
    });
    const feedNodeIds = nodes.matchedIds;
    const edges = await inspectCategory({
      ctx,
      category: "intelligence_edges",
      communityId: args.communityId,
      feedTraceIds,
      feedCitationIds,
      feedNodeIds,
    });
    const feedEdgeIds = edges.matchedIds;
    if (
      sourceTraces.truncated ||
      citations.truncated ||
      nodes.truncated ||
      edges.truncated
    ) {
      throw new Error("ai_feed_retirement_dependency_census_incomplete");
    }
    const danglingReferences = await inspectDanglingReferences({
      ctx,
      communityId: String(args.communityId),
    });
    if (danglingReferences.truncated.length > 0) {
      throw new Error("ai_feed_retirement_dangling_census_incomplete");
    }
    if (danglingReferences.count > 0) {
      throw new Error("ai_feed_retirement_dangling_references_blocked");
    }
    const inspectPlannedCategory = async (category: RetirementCategory) => {
      if (category === "intelligence_nodes") return nodes;
      if (category === "intelligence_edges") return edges;
      return await inspectCategory({
        ctx,
        category,
        communityId: args.communityId,
        feedTraceIds,
        feedCitationIds,
        feedNodeIds,
        feedEdgeIds,
      });
    };
    const categoryIndex = AI_FEED_RETIREMENT_DELETE_ORDER.indexOf(
      args.category,
    );
    if (categoryIndex < 0)
      throw new Error("ai_feed_retirement_category_invalid");
    for (const earlierCategory of AI_FEED_RETIREMENT_DELETE_ORDER.slice(
      0,
      categoryIndex,
    )) {
      const earlier = await inspectPlannedCategory(earlierCategory);
      if (earlier.truncated) {
        throw new Error("ai_feed_retirement_dependency_census_incomplete");
      }
      if (earlier.count > 0) {
        throw new Error(`ai_feed_retirement_order_blocked:${earlierCategory}`);
      }
    }
    const target = await inspectPlannedCategory(args.category);
    if (target.truncated) {
      throw new Error("ai_feed_retirement_target_census_incomplete");
    }
    if (target.blockedIds.length > 0) {
      return {
        version: AI_FEED_RETIREMENT_CENSUS_VERSION,
        category: args.category,
        dryRun,
        blocked: true,
        blockedCount: target.blockedIds.length,
        blockedSampleIds: target.blockedIds.slice(0, 20),
        remaining: target.count,
      };
    }
    const ids = [...target.deletableIds, ...target.patchableIds].slice(
      0,
      limit,
    );
    const result: AppliedRetirementBatch = await ctx.runMutation(
      (internal as any).communityAiFeedRetirement
        .applyAiFeedRetirementBatchInternal,
      {
        communityId: args.communityId,
        category: args.category,
        ids,
        dryRun,
      },
    );
    return {
      version: AI_FEED_RETIREMENT_CENSUS_VERSION,
      ...result,
      blocked: false,
      remaining: dryRun
        ? target.count
        : Math.max(0, target.count - result.deleted - result.patched),
      hasMore: dryRun
        ? target.count > 0
        : target.count - result.deleted - result.patched > 0,
    };
  },
});
