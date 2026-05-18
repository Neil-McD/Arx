import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

const COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS = 30;
const COMMUNITY_COMPILER_DIGEST_WINDOW_MS = COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const COMMUNITY_COMPILER_DIGEST_AGENT_KEY = "community_compiler_digest_v1";

const MAX_ARCHIVE_ACTIVITY_FETCH = 600;
const MAX_SOURCE_TRACE_FETCH = 300;
const MAX_AI_FEED_FETCH = 100;
const MAX_OUTCOME_FETCH = 100;
const MAX_CHANGE_REQUEST_FETCH = 100;
const MAX_DIGEST_ITEMS = 12;
const MAX_SOURCE_IDS_PER_ITEM = 12;
const MAX_SOURCE_TRACE_IDS_PER_ITEM = 12;

type DigestCategory =
  | "chat_activity"
  | "ai_feed_signal"
  | "resource_activity"
  | "event_activity"
  | "member_state"
  | "outcome_signal"
  | "source_trace_signal"
  | "pending_directory_decision";

type DigestItem = {
  category: DigestCategory;
  title: string;
  summary: string;
  priority: number;
  confidence: number;
  sourceTypes: string[];
  sourceIds: string[];
  sourceTraceIds: any[];
};

type ArchiveActivityRow = {
  _id: any;
  sourceType: "chat" | "ai_feed" | "resource";
  sourceId: string;
  title?: string;
  snippet: string;
  authorLabel?: string;
  createdAt: number;
};

type SourceTraceRow = {
  _id: any;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: string;
  sourceVisibility: string;
  createdAt: number;
};

type AiFeedPostRow = {
  _id: any;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  evidence?: string[];
  score: number;
  goodCount: number;
  lowSignalCount: number;
  createdAt: number;
};

type OutcomeObservationRow = {
  _id: any;
  resultStatus: "worked" | "failed" | "mixed" | "unknown";
  evidenceStrength: "none" | "anecdotal" | "observed" | "measured" | "validated";
  workflowId?: string;
  observedAt: number;
};

type ChangeRequestRow = {
  _id: any;
  operation: string;
  confidence: number;
  privacyRisk: number;
  createdAt: number;
};

type CompilerDigestRow = {
  _id: any;
  communityId: any;
  dedupeKey: string;
  windowStartedAt: number;
  windowEndedAt: number;
  summary: string;
  itemCount: number;
  items: DigestItem[];
  signalCounts: Record<string, number>;
  createdByActorType: string;
  createdByUserId?: any;
  createdByAgentKey?: string;
  createdAt: number;
  updatedAt: number;
};

function truncateText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function clampScore(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function sourceIds(rows: Array<{ sourceId?: string; _id?: any }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row.sourceId ?? normalizeIdValue(row._id) ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_SOURCE_IDS_PER_ITEM) break;
  }
  return out;
}

function sourceTraceIds(rows: SourceTraceRow[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = normalizeIdValue(row._id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row._id);
    if (out.length >= MAX_SOURCE_TRACE_IDS_PER_ITEM) break;
  }
  return out;
}

function makeItem(args: {
  category: DigestCategory;
  title: string;
  summary: string;
  priority?: number;
  confidence?: number;
  sourceTypes?: string[];
  sourceIds?: string[];
  sourceTraceIds?: any[];
}): DigestItem {
  return {
    category: args.category,
    title: truncateText(args.title, 180) || "Compiler signal",
    summary: truncateText(args.summary, 700) || "The compiler detected a bounded non-canonical signal.",
    priority: clampScore(args.priority, 0.5),
    confidence: clampScore(args.confidence, 0.5),
    sourceTypes: (args.sourceTypes ?? []).map((value) => truncateText(value, 64)).filter(Boolean).slice(0, 12),
    sourceIds: (args.sourceIds ?? []).map((value) => truncateText(value, 96)).filter(Boolean).slice(0, MAX_SOURCE_IDS_PER_ITEM),
    sourceTraceIds: (args.sourceTraceIds ?? []).slice(0, MAX_SOURCE_TRACE_IDS_PER_ITEM),
  };
}

function activeCompilerTrace(row: SourceTraceRow): boolean {
  return row.visibilityScope === "admin" || row.visibilityScope === "community" || row.visibilityScope === "public";
}

function mapDigestRow(row: CompilerDigestRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    dedupe_key: row.dedupeKey,
    window_started_at: toIsoString(row.windowStartedAt),
    window_ended_at: toIsoString(row.windowEndedAt),
    summary: row.summary,
    item_count: row.itemCount,
    items: row.items,
    signal_counts: row.signalCounts,
    created_by_actor_type: row.createdByActorType,
    created_by_user_id: row.createdByUserId ? normalizeIdValue(row.createdByUserId) : null,
    created_by_agent_key: row.createdByAgentKey ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const runCommunityCompilerDigestPass = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });

    const nowMs = Date.now();
    const windowStartedAtMs = nowMs - COMMUNITY_COMPILER_DIGEST_WINDOW_MS;
    const dedupeKey = `community_compiler_digest:v1:${normalizeIdValue(args.communityId)}:${utcDayKey(nowMs)}`;

    const [
      archiveRows,
      traceRowsRaw,
      aiFeedRowsRaw,
      outcomeRows,
      pendingChangeRequests,
    ] = await Promise.all([
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
        )
        .order("desc")
        .take(MAX_ARCHIVE_ACTIVITY_FETCH) as Promise<ArchiveActivityRow[]>,
      ctx.db
        .query("communitySourceTraces" as any)
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
        )
        .order("desc")
        .take(MAX_SOURCE_TRACE_FETCH) as Promise<SourceTraceRow[]>,
      ctx.db
        .query("communityAiFeedPosts" as any)
        .withIndex("by_community_status_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("status", "live").gte("createdAt", windowStartedAtMs),
        )
        .order("desc")
        .take(MAX_AI_FEED_FETCH) as Promise<AiFeedPostRow[]>,
      ctx.db
        .query("communityOutcomeObservations" as any)
        .withIndex("by_community_observedAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("observedAt", windowStartedAtMs),
        )
        .order("desc")
        .take(MAX_OUTCOME_FETCH) as Promise<OutcomeObservationRow[]>,
      ctx.db
        .query("communityIntelligenceChangeRequests" as any)
        .withIndex("by_community_status", (q: any) =>
          q.eq("communityId", args.communityId).eq("status", "pending_decision"),
        )
        .take(MAX_CHANGE_REQUEST_FETCH) as Promise<ChangeRequestRow[]>,
    ]);

    const traceRows = traceRowsRaw.filter(activeCompilerTrace);
    const chatRows = archiveRows.filter((row) => row.sourceType === "chat");
    const resourceRows = archiveRows.filter((row) => row.sourceType === "resource");
    const archiveAiFeedRows = archiveRows.filter((row) => row.sourceType === "ai_feed");
    const aiFeedRows = aiFeedRowsRaw
      .slice()
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || b.createdAt - a.createdAt);
    const postingMemberKeys = new Set(
      chatRows
        .map((row) => String(row.authorLabel ?? "").trim())
        .filter((label) => label.startsWith("member:")),
    );
    const outcomesByStatus = outcomeRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.resultStatus] = (counts[row.resultStatus] ?? 0) + 1;
      return counts;
    }, {});

    const items: DigestItem[] = [];
    if (chatRows.length > 0) {
      items.push(makeItem({
        category: "chat_activity",
        title: `${chatRows.length} chat signals in the compiler window`,
        summary: `${postingMemberKeys.size} members posted in archived chat activity. Treat this as raw conversation evidence, not accepted community truth.`,
        priority: Math.min(1, 0.35 + chatRows.length / 80),
        confidence: 0.75,
        sourceTypes: ["chat"],
        sourceIds: sourceIds(chatRows),
      }));
    }
    for (const post of aiFeedRows.slice(0, 3)) {
      items.push(makeItem({
        category: "ai_feed_signal",
        title: post.title || `${post.type} from AI Feed`,
        summary: post.body,
        priority: Math.min(1, 0.45 + Number(post.score ?? 0) / 2),
        confidence: 0.7,
        sourceTypes: ["ai_feed"],
        sourceIds: [normalizeIdValue(post._id)],
      }));
    }
    if (resourceRows.length > 0) {
      items.push(makeItem({
        category: "resource_activity",
        title: `${resourceRows.length} resource records changed or entered archive activity`,
        summary: "Resources are durable reference evidence. The digest records the resource activity signal; agents should use dedicated resource/search retrieval for full content.",
        priority: Math.min(1, 0.3 + resourceRows.length / 50),
        confidence: 0.7,
        sourceTypes: ["resource"],
        sourceIds: sourceIds(resourceRows),
      }));
    }
    if (outcomeRows.length > 0) {
      items.push(makeItem({
        category: "outcome_signal",
        title: `${outcomeRows.length} outcome observations recorded`,
        summary: `Outcome observations by status: worked ${outcomesByStatus.worked ?? 0}, failed ${outcomesByStatus.failed ?? 0}, mixed ${outcomesByStatus.mixed ?? 0}, unknown ${outcomesByStatus.unknown ?? 0}. Outcomes can later support or contest directory intelligence through the airlock.`,
        priority: Math.min(1, 0.55 + outcomeRows.length / 40),
        confidence: 0.8,
        sourceTypes: ["outcome"],
        sourceIds: outcomeRows.slice(0, MAX_SOURCE_IDS_PER_ITEM).map((row) => normalizeIdValue(row._id)),
      }));
    }
    if (traceRows.length > 0) {
      items.push(makeItem({
        category: "source_trace_signal",
        title: `${traceRows.length} active source traces available`,
        summary: "Source traces are normalized evidence for compiler consideration. They do not mutate directory truth without policy-gated change requests.",
        priority: Math.min(1, 0.45 + traceRows.length / 80),
        confidence: 0.8,
        sourceTypes: Array.from(new Set(traceRows.map((row) => row.sourceType))).slice(0, 12),
        sourceIds: traceRows.map((row) => String(row.sourceId ?? normalizeIdValue(row._id))).filter(Boolean).slice(0, MAX_SOURCE_IDS_PER_ITEM),
        sourceTraceIds: sourceTraceIds(traceRows),
      }));
    }
    if (pendingChangeRequests.length > 0) {
      items.push(makeItem({
        category: "pending_directory_decision",
        title: `${pendingChangeRequests.length} pending directory decisions`,
        summary: "These are already inside the policy airlock. They still need an accepted decision before any canonical directory mutation can happen.",
        priority: Math.min(1, 0.65 + pendingChangeRequests.length / 25),
        confidence: 0.85,
        sourceTypes: ["change_request"],
        sourceIds: pendingChangeRequests.slice(0, MAX_SOURCE_IDS_PER_ITEM).map((row) => normalizeIdValue(row._id)),
      }));
    }

    const sortedItems = items
      .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence)
      .slice(0, MAX_DIGEST_ITEMS);
    const signalCounts = {
      chat: chatRows.length,
      aiFeed: Math.max(aiFeedRows.length, archiveAiFeedRows.length),
      resources: resourceRows.length,
      events: 0,
      sourceTraces: traceRows.length,
      outcomes: outcomeRows.length,
      pendingChangeRequests: pendingChangeRequests.length,
      newMembers: 0,
      activeMembers: 0,
      postingMembers: postingMemberKeys.size,
      aiFeedReactingMembers: 0,
    };
    const summary = truncateText(
      [
        `Compiler window covered ${COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS} days.`,
        `${chatRows.length} chat, ${signalCounts.aiFeed} AI feed, and ${resourceRows.length} resource learning signals were considered.`,
        "Events, member joins, presence, reactions, and generic activity are excluded from learning digests unless they produce transcripts, feedback, outcomes, decisions, artifacts, or source traces.",
        `${traceRows.length} source traces, ${outcomeRows.length} outcomes, and ${pendingChangeRequests.length} pending directory decisions are in the working set.`,
        "This digest is non-canonical compiler output.",
      ].join(" "),
      1_200,
    );

    const existing = (await ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_dedupeKey", (q: any) =>
        q.eq("communityId", args.communityId).eq("dedupeKey", dedupeKey),
      )
      .first()) as CompilerDigestRow | null;
    const payload = {
      communityId: args.communityId,
      dedupeKey,
      windowStartedAt: windowStartedAtMs,
      windowEndedAt: nowMs,
      summary,
      itemCount: sortedItems.length,
      items: sortedItems,
      signalCounts,
      updatedAt: nowMs,
    };

    let digestId: any;
    if (existing) {
      digestId = existing._id;
      await ctx.db.patch(existing._id as any, payload);
    } else {
      digestId = await ctx.db.insert("communityCompilerDigests" as any, {
        ...payload,
        createdByActorType: "compiler" as const,
        createdByUserId: userId,
        createdByAgentKey: COMMUNITY_COMPILER_DIGEST_AGENT_KEY,
        createdAt: nowMs,
      });
    }
    const row = (await ctx.db.get(digestId)) as CompilerDigestRow | null;
    if (!row) throw new Error("community_compiler_digest_write_failed");
    return mapDigestRow(row);
  },
});

export const listCommunityCompilerDigests = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)));
    const rows = (await ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(limit)) as CompilerDigestRow[];
    return rows.map(mapDigestRow);
  },
});
