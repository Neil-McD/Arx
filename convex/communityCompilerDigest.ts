import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  drainSelfAuthoredPendingSourceTracesForCommunity,
  measureCommunityCompilerEvidenceForCommunity,
  type SourceTraceRow,
} from "./communityCompilerEvidenceCore";
import {
  buildCommunityMemoryDigestVersionKey,
  buildCommunityMemoryWorkKey,
} from "./communityMemoryWorkKey";

const COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS = 30;
const COMMUNITY_COMPILER_DIGEST_WINDOW_MS = COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const COMMUNITY_COMPILER_DIGEST_AGENT_KEY = "community_compiler_digest_v1";

const MAX_ARCHIVE_ACTIVITY_FETCH = 600;
const MAX_AI_FEED_FETCH = 100;
const MAX_OUTCOME_FETCH = 100;
const MAX_DIGEST_ITEMS = 12;
const MAX_SOURCE_IDS_PER_ITEM = 12;
const MAX_SOURCE_TRACE_IDS_PER_ITEM = 500;

type DigestCategory =
  | "chat_activity"
  | "ai_feed_signal"
  | "resource_activity"
  | "event_activity"
  | "member_state"
  | "outcome_signal"
  | "source_trace_signal";

type DigestItem = {
  workKey?: string;
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
  sourceType: "chat" | "interaction" | "ai_feed" | "resource";
  sourceId: string;
  title?: string;
  snippet: string;
  authorLabel?: string;
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

type CompilerDigestRow = {
  _id: any;
  communityId: any;
  dedupeKey: string;
  versionKey?: string;
  agentHandoffState?: "pending" | "running" | "handled";
  agentClaimId?: string;
  agentClaimedAt?: number;
  agentHandledAt?: number;
  agentAttemptCount?: number;
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

async function markSelectedSourceTracesCompiled(args: {
  ctx: any;
  communityId: any;
  traceRows: SourceTraceRow[];
  digestId: any;
  nowMs: number;
}): Promise<number> {
  let handled = 0;
  const seen = new Set<string>();
  for (const row of args.traceRows) {
    const id = normalizeIdValue(row._id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fresh = (await args.ctx.db.get(row._id as any)) as SourceTraceRow | null;
    if (!fresh || normalizeIdValue(fresh.communityId) !== normalizeIdValue(args.communityId)) continue;
    if (fresh.compilerState !== undefined && fresh.compilerState !== "pending") continue;
    await args.ctx.db.patch(row._id as any, {
      compilerState: "compiled" as const,
      compilerPendingSince: typeof fresh.compilerPendingSince === "number" ? fresh.compilerPendingSince : fresh.createdAt,
      compilerLastHandledAt: args.nowMs,
      compilerLastDigestId: args.digestId,
    });
    handled += 1;
  }
  return handled;
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

function digestItemContentRevision(item: DigestItem & { workKey: string }): string {
  return JSON.stringify({
    workKey: item.workKey,
    title: item.title,
    summary: item.summary,
    priority: item.priority,
    confidence: item.confidence,
    sourceTypes: [...item.sourceTypes].sort(),
    sourceIds: [...item.sourceIds].sort(),
    sourceTraceIds: item.sourceTraceIds.map(normalizeIdValue).sort(),
  });
}

function mapDigestRow(row: CompilerDigestRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    dedupe_key: row.dedupeKey,
    version_key: row.versionKey ?? null,
    agent_handoff_state: row.agentHandoffState ?? null,
    agent_attempt_count: Number(row.agentAttemptCount ?? 0),
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
    return await runCommunityCompilerDigestPassCore(ctx, {
      communityId: args.communityId,
      triggeredByUserId: userId,
    });
  },
});

// Trusted entry for crons and operator CLI runs: the same deterministic digest
// pass without a member session. The pass itself does no LLM work.
export const runCommunityCompilerDigestPassInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    requireTrigger: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await runCommunityCompilerDigestPassCore(ctx, {
      communityId: args.communityId,
      requireTrigger: args.requireTrigger,
    });
  },
});

async function runCommunityCompilerDigestPassCore(
  ctx: any,
  args: { communityId: any; triggeredByUserId?: any; requireTrigger?: boolean },
) {
    const userId = args.triggeredByUserId ?? undefined;
    const nowMs = Date.now();
    const windowStartedAtMs = nowMs - COMMUNITY_COMPILER_DIGEST_WINDOW_MS;
    await drainSelfAuthoredPendingSourceTracesForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    const compilerEvidencePromise = measureCommunityCompilerEvidenceForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs,
    });

    const [
      compilerEvidence,
      archiveRows,
      aiFeedRowsRaw,
      outcomeRows,
    ] = await Promise.all([
      compilerEvidencePromise,
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).gte("createdAt", windowStartedAtMs),
        )
        .order("desc")
        .take(MAX_ARCHIVE_ACTIVITY_FETCH) as Promise<ArchiveActivityRow[]>,
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
    ]);
    if (args.requireTrigger && !compilerEvidence.measurement.should_run) {
      return {
        ok: true,
        skipped: true,
        reason: compilerEvidence.measurement.reason,
        community_id: normalizeIdValue(args.communityId),
      };
    }

    const selectedSourceTraceRows = compilerEvidence.selectedRows;
    const chatRows = archiveRows.filter((row) => row.sourceType === "interaction");
    const resourceRows = archiveRows.filter((row) => row.sourceType === "resource");
    const archiveAiFeedRows = archiveRows.filter((row) => row.sourceType === "ai_feed");
    const aiFeedRows = aiFeedRowsRaw
      .slice()
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || b.createdAt - a.createdAt);
    const aiFeedIds = new Set(aiFeedRows.map((row) => normalizeIdValue(row._id)));
    // AI Feed publication already has a dedicated canonical signal
    // projection. Its source trace is the governance/promotion record, not a
    // second independent learning signal.
    const selectedAiFeedSourceTraceRows = selectedSourceTraceRows.filter(
      (row) =>
        row.sourceType === "ai_feed" &&
        aiFeedIds.has(String(row.sourceId ?? "").trim()),
    );
    const selectedDistinctSourceTraceRows = selectedSourceTraceRows.filter(
      (row) =>
        row.sourceType !== "ai_feed" ||
        !aiFeedIds.has(String(row.sourceId ?? "").trim()),
    );
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
        summary: `Outcome observations by status: worked ${outcomesByStatus.worked ?? 0}, failed ${outcomesByStatus.failed ?? 0}, mixed ${outcomesByStatus.mixed ?? 0}, unknown ${outcomesByStatus.unknown ?? 0}. Outcomes can later support or contest directory intelligence through typed memory writes.`,
        priority: Math.min(1, 0.55 + outcomeRows.length / 40),
        confidence: 0.8,
        sourceTypes: ["outcome"],
        sourceIds: outcomeRows.slice(0, MAX_SOURCE_IDS_PER_ITEM).map((row) => normalizeIdValue(row._id)),
      }));
    }
    const sourceTraceItem = selectedDistinctSourceTraceRows.length > 0
      ? makeItem({
        category: "source_trace_signal",
        title: `${selectedDistinctSourceTraceRows.length} selected pending source traces compiled`,
        summary: `${selectedDistinctSourceTraceRows.length} distinct pending source traces were represented in this digest and can now be marked compiled. ${selectedAiFeedSourceTraceRows.length} AI Feed promotion traces were deduplicated against their canonical AI Feed signal. ${compilerEvidence.measurement.pending_total} eligible source traces were pending when measured.`,
        priority: Math.min(1, 0.45 + selectedDistinctSourceTraceRows.length / 80),
        confidence: 0.8,
        sourceTypes: Array.from(new Set(selectedDistinctSourceTraceRows.map((row) => row.sourceType))).slice(0, 12),
        sourceIds: selectedDistinctSourceTraceRows.map((row) => String(row.sourceId ?? normalizeIdValue(row._id))).filter(Boolean).slice(0, MAX_SOURCE_IDS_PER_ITEM),
        sourceTraceIds: sourceTraceIds(selectedDistinctSourceTraceRows),
      })
      : null;
    if (sourceTraceItem) {
      items.push(sourceTraceItem);
    }
    const sortedItemCandidates = items
      .sort((a, b) => b.priority - a.priority || b.confidence - a.confidence)
      .slice(0, MAX_DIGEST_ITEMS);
    const keyedItems = await Promise.all(
      sortedItemCandidates.map(async (item) => ({
        ...item,
        workKey: await buildCommunityMemoryWorkKey({
          communityId: args.communityId,
          category: item.category,
          sourceTypes: item.sourceTypes,
          sourceIds: item.sourceIds,
          sourceTraceIds: item.sourceTraceIds,
        }),
      })),
    );
    const seenWorkKeys = new Set<string>();
    const sortedItems = keyedItems.filter((item) => {
      if (seenWorkKeys.has(item.workKey)) return false;
      seenWorkKeys.add(item.workKey);
      return true;
    });
    const representedSourceTraceIds = new Set(
      sortedItems.flatMap((item) => item.sourceTraceIds).map(normalizeIdValue),
    );
    const representedAiFeedSourceIds = new Set(
      sortedItems
        .filter((item) => item.category === "ai_feed_signal")
        .flatMap((item) => item.sourceIds),
    );
    const representedSelectedSourceTraceRows = selectedSourceTraceRows.filter((row) =>
      representedSourceTraceIds.has(normalizeIdValue(row._id)) ||
      (row.sourceType === "ai_feed" && representedAiFeedSourceIds.has(String(row.sourceId ?? "").trim())),
    );
    const signalCounts = {
      chat: chatRows.length,
      aiFeed: Math.max(aiFeedRows.length, archiveAiFeedRows.length),
      resources: resourceRows.length,
      events: 0,
      sourceTraces: sourceTraceItem?.sourceTraceIds.length ?? 0,
      outcomes: outcomeRows.length,
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
        `${selectedSourceTraceRows.length} selected pending source traces and ${outcomeRows.length} outcomes are in the working set.`,
        `${representedSelectedSourceTraceRows.length} selected source traces are represented by this immutable digest version.`,
        "This digest is non-canonical compiler output.",
      ].join(" "),
      1_200,
    );
    const versionKey = await buildCommunityMemoryDigestVersionKey({
      communityId: args.communityId,
      workKeys: sortedItems.map((item) => item.workKey),
      contentRevisions: [
        ...sortedItems.map(digestItemContentRevision),
        ...representedSelectedSourceTraceRows.map((row) =>
          `trace:${normalizeIdValue(row._id)}:${Number(row.updatedAt ?? row.createdAt)}`,
        ),
      ],
    });
    const dedupeKey = `community_compiler_digest:v2:${versionKey}`;
    const payload = {
      communityId: args.communityId,
      dedupeKey,
      versionKey,
      windowStartedAt: windowStartedAtMs,
      windowEndedAt: nowMs,
      summary,
      itemCount: sortedItems.length,
      items: sortedItems,
      signalCounts,
      updatedAt: nowMs,
    };

    const existing = (await ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_versionKey", (q: any) =>
        q.eq("communityId", args.communityId).eq("versionKey", versionKey),
      )
      .first()) as CompilerDigestRow | null;
    const digestId = existing?._id ?? await ctx.db.insert("communityCompilerDigests" as any, {
      ...payload,
      agentHandoffState: sortedItems.length > 0 ? "pending" as const : "handled" as const,
      agentAttemptCount: 0,
      ...(sortedItems.length > 0 ? {} : { agentHandledAt: nowMs }),
      createdByActorType: "compiler" as const,
      createdByUserId: userId,
      createdByAgentKey: COMMUNITY_COMPILER_DIGEST_AGENT_KEY,
      createdAt: nowMs,
    });
    const row = (await ctx.db.get(digestId)) as CompilerDigestRow | null;
    if (!row) throw new Error("community_compiler_digest_write_failed");
    if (representedSelectedSourceTraceRows.length > 0) {
      await markSelectedSourceTracesCompiled({
        ctx,
        communityId: args.communityId,
        traceRows: representedSelectedSourceTraceRows,
        digestId,
        nowMs,
      });
    }
    return mapDigestRow(row);
}

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
