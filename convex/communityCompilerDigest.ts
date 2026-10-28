import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  buildCommunitySourceTraceRevision,
  drainIneligiblePendingSourceTracesForCommunity,
  measureCommunityCompilerEvidenceForCommunity,
} from "./communityCompilerEvidenceCore";
import {
  buildCommunityMemoryDigestVersionKey,
  buildCommunityMemoryWorkKey,
} from "./communityMemoryWorkKey";
import { requireLiveCommunityForCognitionWrite } from "./communityCognitionLifecycle";

const COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS = 30;
const COMMUNITY_COMPILER_DIGEST_WINDOW_MS = COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const COMMUNITY_COMPILER_DIGEST_AGENT_KEY = "community_compiler_digest_v1";
const MAX_DIGEST_ITEMS = 96;

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
  sourceRevisions?: string[];
  compilerGroupKey?: string;
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
  agentTerminalReason?: "settled" | "superseded";
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

function makeItem(args: {
  category: DigestCategory;
  title: string;
  summary: string;
  priority?: number;
  confidence?: number;
  sourceTypes?: string[];
  sourceIds?: string[];
  sourceTraceIds?: any[];
  sourceRevisions?: string[];
  compilerGroupKey?: string;
}): DigestItem {
  return {
    category: args.category,
    title: truncateText(args.title, 240) || "Compiler signal",
    summary: truncateText(args.summary, 2_000) || "The compiler detected a bounded non-canonical signal.",
    priority: clampScore(args.priority, 0.5),
    confidence: clampScore(args.confidence, 0.5),
    sourceTypes: (args.sourceTypes ?? []).map((value) => truncateText(value, 64)).filter(Boolean).slice(0, 1),
    sourceIds: (args.sourceIds ?? []).map((value) => truncateText(value, 512)).filter(Boolean).slice(0, 1),
    sourceTraceIds: (args.sourceTraceIds ?? []).slice(0, 1),
    sourceRevisions: (args.sourceRevisions ?? []).map((value) => truncateText(value, 180)).filter(Boolean).slice(0, 1),
    ...(args.compilerGroupKey ? { compilerGroupKey: truncateText(args.compilerGroupKey, 512) } : {}),
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
    sourceRevisions: [...(item.sourceRevisions ?? [])].sort(),
  });
}

function mapDigestRow(row: CompilerDigestRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    dedupe_key: row.dedupeKey,
    version_key: row.versionKey ?? null,
    agent_handoff_state: row.agentHandoffState ?? null,
    agent_terminal_reason: row.agentTerminalReason ?? null,
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
    await requireLiveCommunityForCognitionWrite(ctx, args.communityId);
    const userId = args.triggeredByUserId ?? undefined;
    const nowMs = Date.now();
    const windowStartedAtMs = nowMs - COMMUNITY_COMPILER_DIGEST_WINDOW_MS;
    await drainIneligiblePendingSourceTracesForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    const compilerEvidence = await measureCommunityCompilerEvidenceForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    if (args.requireTrigger && !compilerEvidence.measurement.should_run) {
      return {
        ok: true,
        skipped: true,
        reason: compilerEvidence.measurement.reason,
        community_id: normalizeIdValue(args.communityId),
      };
    }

    const selectedSourceTraceRows = compilerEvidence.selectedRows.slice(0, MAX_DIGEST_ITEMS);
    const sortedItemCandidates = await Promise.all(selectedSourceTraceRows.map(async (row) => {
      const traceId = normalizeIdValue(row._id);
      const revision = await buildCommunitySourceTraceRevision(row);
      const elevated = row.sourceType === "outcome" || row.sourceType === "feedback";
      return makeItem({
        category: "source_trace_signal",
        title: row.title || `${row.sourceType} evidence`,
        summary: row.summary,
        priority: elevated ? 0.9 : 0.7,
        confidence: 0.8,
        sourceTypes: [row.sourceType],
        sourceIds: [String(row.sourceId ?? traceId)],
        sourceTraceIds: [row._id],
        sourceRevisions: [revision],
        compilerGroupKey: row.compilerGroupKey,
      });
    }));
    const keyedItems = await Promise.all(
      sortedItemCandidates.map(async (item) => ({
        ...item,
        workKey: await buildCommunityMemoryWorkKey({
          communityId: args.communityId,
          category: item.category,
          sourceTypes: item.sourceTypes,
          sourceIds: item.sourceIds,
          sourceTraceIds: item.sourceTraceIds,
          contentRevisions: item.sourceRevisions,
        }),
      })),
    );
    const seenWorkKeys = new Set<string>();
    const sortedItems = keyedItems.filter((item) => {
      if (seenWorkKeys.has(item.workKey)) return false;
      seenWorkKeys.add(item.workKey);
      return true;
    });
    const representedSelectedSourceTraceRows = selectedSourceTraceRows.filter((row) =>
      sortedItems.some((item) => item.sourceTraceIds.some((traceId) =>
        normalizeIdValue(traceId) === normalizeIdValue(row._id),
      )),
    );
    const postingMemberKeys = new Set(
      representedSelectedSourceTraceRows
        .filter((row) => row.sourceType === "interaction")
        .map((row) => normalizeIdValue(row.actorUserId))
        .filter(Boolean),
    );
    const signalCounts = {
      chat: representedSelectedSourceTraceRows.filter((row) => row.sourceType === "interaction").length,
      aiFeed: representedSelectedSourceTraceRows.filter((row) => row.sourceType === "ai_feed").length,
      resources: representedSelectedSourceTraceRows.filter((row) => row.sourceType === "resource").length,
      events: 0,
      sourceTraces: representedSelectedSourceTraceRows.length,
      outcomes: representedSelectedSourceTraceRows.filter((row) => row.sourceType === "outcome").length,
      newMembers: 0,
      activeMembers: 0,
      postingMembers: postingMemberKeys.size,
      aiFeedReactingMembers: 0,
    };
    const summary = truncateText(
      [
        `${compilerEvidence.measurement.pending_total} eligible evidence packets (${compilerEvidence.measurement.pending_trace_total} exact traces) were pending when measured.`,
        `${representedSelectedSourceTraceRows.length} exact versioned evidence items are represented by this immutable digest.`,
        "Every item must reach retained, carried-forward, or dismissed-low-signal before the handoff is complete.",
        "This digest is non-canonical compiler output.",
      ].join(" "),
      1_200,
    );
    const versionKey = await buildCommunityMemoryDigestVersionKey({
      communityId: args.communityId,
      workKeys: sortedItems.map((item) => item.workKey),
      contentRevisions: [
        ...sortedItems.map(digestItemContentRevision),
        ...sortedItems.flatMap((item) => item.sourceRevisions ?? []),
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
    // Carry already-observed overflow into the next bounded pass. The trace
    // remains the queue truth; this scheduling bit survives the paid-cycle cap
    // without changing evidence timestamps, revisions, or work identity.
    for (const continuationRow of compilerEvidence.continuationRows.slice(0, MAX_DIGEST_ITEMS)) {
      if (
        (continuationRow.compilerState === undefined || continuationRow.compilerState === "pending") &&
        continuationRow.compilerContinuationReady !== true
      ) {
        await ctx.db.patch(continuationRow._id as any, {
          compilerContinuationReady: true,
        });
      }
    }
    return mapDigestRow(row);
}

