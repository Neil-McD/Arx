import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

const retirementCategory = v.union(
  v.literal("posts"),
  v.literal("reactions"),
  v.literal("source_traces"),
  v.literal("evidence_citations"),
  v.literal("archive_documents"),
  v.literal("retrieval_logs"),
  v.literal("activity_events"),
  v.literal("operation_receipts"),
  v.literal("compiler_digests"),
  v.literal("intelligence_nodes"),
  v.literal("intelligence_edges"),
  v.literal("intelligence_mutations"),
  v.literal("intelligence_change_requests"),
  v.literal("member_settings"),
);

type RetirementCategory =
  | "posts"
  | "reactions"
  | "source_traces"
  | "evidence_citations"
  | "archive_documents"
  | "retrieval_logs"
  | "activity_events"
  | "operation_receipts"
  | "compiler_digests"
  | "intelligence_nodes"
  | "intelligence_edges"
  | "intelligence_mutations"
  | "intelligence_change_requests"
  | "member_settings";

const TABLE_BY_CATEGORY: Record<RetirementCategory, string> = {
  posts: "communityAiFeedPosts",
  reactions: "communityAiFeedReactions",
  source_traces: "communitySourceTraces",
  evidence_citations: "communityEvidenceCitations",
  archive_documents: "communityArchiveDocuments",
  retrieval_logs: "communityEvidenceRetrievalLogs",
  activity_events: "communityActivityEvents",
  operation_receipts: "polynetCanonicalOperationReceipts",
  compiler_digests: "communityCompilerDigests",
  intelligence_nodes: "communityIntelligenceNodes",
  intelligence_edges: "communityIntelligenceEdges",
  intelligence_mutations: "communityIntelligenceMutations",
  intelligence_change_requests: "communityIntelligenceChangeRequests",
  member_settings: "communityMemberSettings",
};

function idSet(values: string[]): Set<string> {
  return new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean));
}

function containsAny(values: unknown, accepted: Set<string>): boolean {
  return Array.isArray(values) && values.some((value) => accepted.has(String(value)));
}

function containsRetiredFeedMarker(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return false;
  }
  return /ai[_-]feed|communityAiFeed|AI Feed/i.test(text);
}

function rowMatches(args: {
  category: RetirementCategory;
  row: Record<string, any>;
  feedTraceIds: Set<string>;
  feedCitationIds: Set<string>;
}): boolean {
  const { category, row, feedTraceIds, feedCitationIds } = args;
  switch (category) {
    case "posts":
    case "reactions":
      return true;
    case "source_traces":
      return row.sourceType === "ai_feed";
    case "evidence_citations":
      return row.sourceKind === "ai_feed"
        || String(row.sourceRef ?? "").startsWith("ai_feed:")
        || feedTraceIds.has(String(row.sourceTraceId ?? ""));
    case "archive_documents":
      return row.sourceType === "ai_feed";
    case "retrieval_logs":
      return row.capability === "community_ai_feed_search"
        || row.capability === "community_ai_feed_read"
        || containsRetiredFeedMarker(row.resultRefs);
    case "activity_events":
      return row.type === "ai_feed_post_added" || row.targetType === "ai_feed_post";
    case "operation_receipts":
      return containsRetiredFeedMarker(row.result)
        || containsRetiredFeedMarker(row.lastErrorCode)
        || containsRetiredFeedMarker(row.lastErrorMessage);
    case "compiler_digests":
      return containsRetiredFeedMarker(row.items)
        || Number(row.signalCounts?.aiFeed ?? 0) > 0
        || Number(row.signalCounts?.aiFeedReactingMembers ?? 0) > 0;
    case "intelligence_nodes":
      return containsAny(row.sourceTraceIds, feedTraceIds)
        || containsAny(row.evidenceCitationIds, feedCitationIds);
    case "intelligence_edges":
      return containsAny(row.evidenceTraceIds, feedTraceIds)
        || containsAny(row.evidenceCitationIds, feedCitationIds);
    case "intelligence_mutations":
      return containsAny(row.sourceTraceIds, feedTraceIds)
        || containsRetiredFeedMarker(row.beforeSnapshot)
        || containsRetiredFeedMarker(row.afterSnapshot);
    case "intelligence_change_requests":
      return containsAny(row.sourceTraceIds, feedTraceIds)
        || containsAny(row.evidenceCitationIds, feedCitationIds)
        || containsRetiredFeedMarker(row.payload);
    case "member_settings":
      return typeof row.aiFeedLastSeenAt === "number";
  }
}

export const inspectAiFeedRetirementPageInternal = internalQuery({
  args: {
    category: retirementCategory,
    feedTraceIds: v.array(v.string()),
    feedCitationIds: v.array(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(TABLE_BY_CATEGORY[args.category] as any)
      .order("asc")
      .paginate(args.paginationOpts);
    const traceIds = idSet(args.feedTraceIds);
    const citationIds = idSet(args.feedCitationIds);
    const matches = (result.page as Array<Record<string, any>>)
      .filter((row) => rowMatches({
        category: args.category,
        row,
        feedTraceIds: traceIds,
        feedCitationIds: citationIds,
      }))
      .map((row) => String(row._id));
    return {
      matches,
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
  "operation_receipts",
  "compiler_digests",
  "intelligence_nodes",
  "intelligence_edges",
  "intelligence_mutations",
  "intelligence_change_requests",
  "member_settings",
];

async function inspectCategory(args: {
  ctx: any;
  category: RetirementCategory;
  feedTraceIds: string[];
  feedCitationIds: string[];
}) {
  const matchedIds: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let isDone = false;
  while (!isDone && pages < 200) {
    const result: {
      matches: string[];
      continueCursor: string | null;
      isDone: boolean;
    } = await args.ctx.runQuery(
      (internal as any).communityAiFeedRetirement.inspectAiFeedRetirementPageInternal,
      {
        category: args.category,
        feedTraceIds: args.feedTraceIds,
        feedCitationIds: args.feedCitationIds,
        paginationOpts: {
          cursor,
          numItems: 100,
          maximumRowsRead: 100,
        },
      },
    );
    matchedIds.push(...result.matches);
    cursor = result.continueCursor;
    isDone = result.isDone;
    pages += 1;
  }
  return {
    count: matchedIds.length,
    matchedIds,
    pages,
    truncated: !isDone,
  };
}

export const inspectAiFeedRetirementInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const sourceTraces = await inspectCategory({
      ctx,
      category: "source_traces",
      feedTraceIds: [],
      feedCitationIds: [],
    });
    const citations = await inspectCategory({
      ctx,
      category: "evidence_citations",
      feedTraceIds: sourceTraces.matchedIds,
      feedCitationIds: [],
    });
    const counts: Record<string, number> = {};
    const pages: Record<string, number> = {};
    const truncated: string[] = [];
    for (const category of CATEGORIES) {
      const result = category === "source_traces"
        ? sourceTraces
        : category === "evidence_citations"
          ? citations
          : await inspectCategory({
              ctx,
              category,
              feedTraceIds: sourceTraces.matchedIds,
              feedCitationIds: citations.matchedIds,
            });
      counts[category] = result.count;
      pages[category] = result.pages;
      if (result.truncated) truncated.push(category);
    }
    return {
      version: "ai_feed_retirement_census_v1",
      inspectedAt: Date.now(),
      counts,
      pages,
      complete: truncated.length === 0,
      truncated,
    };
  },
});
