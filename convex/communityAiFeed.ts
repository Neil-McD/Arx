import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  requireCommunityChatAccess,
  requireCommunityModerator,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForAiFeedPost,
} from "./communityArchiveDocuments";
import { upsertCommunitySourceTrace } from "./communityIntelligenceDirectory";

const GOOD_WEIGHT = 1;
const LOW_SIGNAL_WEIGHT = -1;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_PERCENTILE = 0.2;
const MIN_PRUNE_AGE_MS = 14 * DAY_MS;
const MIN_PRUNE_POOL_SIZE = 10;
const MAX_LIVE_SCORE_FOR_PRUNE = -1;
const HIDDEN_RETENTION_MS = 60 * DAY_MS;
const DEFAULT_HIDDEN_DELETE_BATCH_SIZE = 256;

type FeedPostRow = {
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
  hiddenAt?: number;
};

type FeedReactionRow = {
  _id: any;
  communityId: any;
  postId: any;
  actorType?: "human" | "agent";
  actorKey: string;
  actorUserId?: any;
  actorAgentKey?: string;
  reactionType: "good" | "low_signal";
  createdAt: number;
  updatedAt: number;
};

function normalizeFeedPostType(raw: unknown): "observation" | "recommendation" | "action" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "recommendation" || value === "action") return value;
  return "observation";
}

function normalizeFeedReactionType(raw: unknown): "good" | "low_signal" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "good" || value === "low_signal") return value;
  throw new Error("community_ai_feed_reaction_invalid");
}

function normalizeNoveltyKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 256);
}

function normalizeFeedEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const value = normalizeOptionalText(entry, 180);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
    if (deduped.length >= 4) break;
  }
  return deduped;
}

function buildAiFeedTraceSummary(post: FeedPostRow): string {
  return [
    post.title,
    post.body,
    ...(Array.isArray(post.evidence) ? post.evidence.map((entry) => `Evidence: ${entry}`) : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

async function upsertSourceTraceForAiFeedPost(ctx: any, post: FeedPostRow, nowMs: number): Promise<void> {
  await upsertCommunitySourceTrace({
    ctx,
    communityId: post.communityId,
    sourceType: "ai_feed",
    sourceId: normalizeIdValue(post._id),
    title: post.title,
    summary: buildAiFeedTraceSummary(post),
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "agent",
    actorUserId: post.authorUserId,
    actorAgentKey: post.agentKey ?? "community_agent",
    allowExistingUpdate: true,
    nowMs,
  });
}

async function upsertHiddenSourceTraceForAiFeedPost(args: {
  ctx: any;
  post: FeedPostRow;
  actorType: "admin" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
  nowMs: number;
}): Promise<void> {
  await upsertCommunitySourceTrace({
    ctx: args.ctx,
    communityId: args.post.communityId,
    sourceType: "ai_feed",
    sourceId: normalizeIdValue(args.post._id),
    title: args.post.title,
    summary: "AI feed post hidden; retained as moderation evidence.",
    visibilityScope: "admin",
    sourceVisibility: "redacted",
    actorType: args.actorType,
    actorUserId: args.actorUserId,
    actorAgentKey: args.actorAgentKey,
    allowExistingUpdate: true,
    nowMs: args.nowMs,
  });
}

function voteActorKeyForUser(userId: any): string {
  return `user:${normalizeIdValue(userId)}`;
}

function reactionWeight(reactionType: "good" | "low_signal"): number {
  if (reactionType === "good") {
    return GOOD_WEIGHT;
  }
  return LOW_SIGNAL_WEIGHT;
}

function isEligibleForMonthlyPrune(post: FeedPostRow, nowMs: number): boolean {
  if (post.status !== "live") return false;
  const createdAt = Number(post.createdAt ?? 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
  return Math.max(0, nowMs - createdAt) >= MIN_PRUNE_AGE_MS;
}

async function hideFeedPost(args: {
  ctx: any;
  post: FeedPostRow;
  nowMs: number;
}): Promise<void> {
  const nextPost: FeedPostRow = {
    ...args.post,
    status: "hidden",
    hiddenAt: args.nowMs,
    updatedAt: args.nowMs,
  };
  await args.ctx.db.patch(args.post._id as any, {
    status: "hidden",
    hiddenAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await upsertHiddenSourceTraceForAiFeedPost({
    ctx: args.ctx,
    post: nextPost,
    actorType: "system",
    actorAgentKey: "ai_feed_prune",
    nowMs: args.nowMs,
  });
  await upsertArchiveDocumentForAiFeedPost(args.ctx, nextPost);
}

async function restoreFeedPostToLive(args: {
  ctx: any;
  post: FeedPostRow;
  nowMs: number;
}): Promise<void> {
  const nextPost: FeedPostRow = {
    ...args.post,
    status: "live",
    hiddenAt: undefined,
    updatedAt: args.nowMs,
  };
  await args.ctx.db.patch(args.post._id as any, {
    status: "live",
    hiddenAt: undefined,
    updatedAt: args.nowMs,
  });
  await upsertSourceTraceForAiFeedPost(args.ctx, nextPost, args.nowMs);
  await upsertArchiveDocumentForAiFeedPost(args.ctx, nextPost);
}

async function mapFeedPostRow(args: {
  post: FeedPostRow;
  viewerReaction: FeedReactionRow | null;
}) {
  const { post, viewerReaction } = args;
  return {
    id: String(post._id),
    community_id: String(post.communityId),
    author_type: post.authorType,
    author_user_id: post.authorUserId ? normalizeIdValue(post.authorUserId) : null,
    agent_key: String(post.agentKey ?? "").trim() || null,
    author_label: String(post.authorLabel ?? "").trim() || "Agent",
    post_type: post.type,
    title: String(post.title ?? "").trim() || null,
    body: post.body,
    evidence: normalizeFeedEvidence(post.evidence),
    score: Number(post.score ?? 0),
    reaction_counts: {
      good: Math.max(0, Number(post.goodCount ?? 0)),
      low_signal: Math.max(0, Number(post.lowSignalCount ?? 0)),
    },
    viewer_reaction: viewerReaction?.reactionType ?? null,
    created_at: toIsoString(post.createdAt),
    updated_at: toIsoString(post.updatedAt),
  };
}

async function getViewerReactionsByPostId(args: {
  ctx: any;
  actorKey: string | null;
  postIds: string[];
}): Promise<Map<string, FeedReactionRow>> {
  const result = new Map<string, FeedReactionRow>();
  if (!args.actorKey || args.postIds.length === 0) return result;
  const rows = (await args.ctx.db
    .query("communityAiFeedReactions" as any)
    .withIndex("by_actorKey", (q: any) => q.eq("actorKey", args.actorKey))
    .collect()) as FeedReactionRow[];
  const wanted = new Set(args.postIds);
  for (const row of rows) {
    const postId = normalizeIdValue(row.postId);
    if (wanted.has(postId)) result.set(postId, row);
  }
  return result;
}

async function getFeedPostOrThrow(ctx: any, postId: string): Promise<FeedPostRow> {
  const row = (await ctx.db.get(postId as any)) as FeedPostRow | null;
  if (!row) throw new Error("community_ai_feed_post_not_found");
  return row;
}

async function insertFeedPost(args: {
  ctx: any;
  communityId: any;
  authorUserId?: any;
  agentKey?: string | null;
  authorLabel: string;
  postType: "observation" | "recommendation" | "action";
  title?: string | null;
  body: string;
  evidence?: string[] | null;
  noveltyKey?: string | null;
  nowMs: number;
}) {
  const noveltyKey = normalizeNoveltyKey(args.noveltyKey);
  if (noveltyKey) {
    const existingRows = (await args.ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_community_noveltyKey", (q: any) =>
        q.eq("communityId", args.communityId).eq("noveltyKey", noveltyKey),
      )
      .collect()) as FeedPostRow[];
    const existing = existingRows.find((row) => row.status === "live");
    if (existing) {
      await upsertSourceTraceForAiFeedPost(args.ctx, existing, args.nowMs);
      return await mapFeedPostRow({
        post: existing,
        viewerReaction: null,
      });
    }
  }

  const title = normalizeOptionalText(args.title, 180);
  const body = normalizeOptionalText(args.body, 12_000);
  if (!body) throw new Error("community_ai_feed_body_required");
  const evidence = normalizeFeedEvidence(args.evidence);
  const authorLabel = normalizeName(args.authorLabel);
  const id = await args.ctx.db.insert("communityAiFeedPosts" as any, {
    communityId: args.communityId,
    authorType: "agent",
    authorUserId: args.authorUserId,
    agentKey: normalizeNoveltyKey(args.agentKey),
    authorLabel,
    type: normalizeFeedPostType(args.postType),
    title,
    body,
    evidence,
    status: "live",
    score: 0,
    goodCount: 0,
    lowSignalCount: 0,
    noveltyKey,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await getFeedPostOrThrow(args.ctx, normalizeIdValue(id));
  await upsertArchiveDocumentForAiFeedPost(args.ctx, created);
  await upsertSourceTraceForAiFeedPost(args.ctx, created, args.nowMs);
  return await mapFeedPostRow({
    post: created,
    viewerReaction: null,
  });
}

async function recomputeReactionState(args: {
  ctx: any;
  post: FeedPostRow;
  oldReaction: FeedReactionRow | null;
  nextReactionType: "good" | "low_signal";
  nowMs: number;
}) {
  const nextCounts = {
    good: Math.max(0, Number(args.post.goodCount ?? 0)),
    lowSignal: Math.max(0, Number(args.post.lowSignalCount ?? 0)),
  };
  let nextScore = Number(args.post.score ?? 0);

  if (args.oldReaction) {
    if (args.oldReaction.reactionType === "good") {
      nextCounts.good = Math.max(0, nextCounts.good - 1);
    } else if (args.oldReaction.reactionType === "low_signal") {
      nextCounts.lowSignal = Math.max(0, nextCounts.lowSignal - 1);
    }
    nextScore -= reactionWeight(args.oldReaction.reactionType);
  }

  if (args.nextReactionType === "good") {
    nextCounts.good += 1;
  } else {
    nextCounts.lowSignal += 1;
  }

  nextScore += reactionWeight(args.nextReactionType);

  await args.ctx.db.patch(args.post._id as any, {
    score: nextScore,
    goodCount: nextCounts.good,
    lowSignalCount: nextCounts.lowSignal,
    updatedAt: args.nowMs,
  });
}

type FeedPostProjection = Awaited<ReturnType<typeof mapFeedPostRow>>;

async function listCommunityAiFeedBundleInternal(args: {
  ctx: any;
  userId: any;
  communityId: any;
  limit?: number;
}): Promise<{ live: FeedPostProjection[]; ranked: FeedPostProjection[] }> {
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
  const rows = (await args.ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.communityId).eq("status", "live"),
    )
    .collect()) as FeedPostRow[];
  const liveSelected = rows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  const rankedSelected = rows
    .slice()
    .sort((a, b) => {
      const scoreDelta = Number(b.score ?? 0) - Number(a.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return b.createdAt - a.createdAt;
    })
    .slice(0, limit);
  const selectedById = new Map<string, FeedPostRow>();
  for (const post of [...liveSelected, ...rankedSelected]) {
    selectedById.set(normalizeIdValue(post._id), post);
  }
  const selectedRows = Array.from(selectedById.values());
  const actorKey = voteActorKeyForUser(args.userId);
  const viewerReactionsByPostId = await getViewerReactionsByPostId({
    ctx: args.ctx,
    actorKey,
    postIds: selectedRows.map((row) => normalizeIdValue(row._id)),
  });
  const projections = new Map<string, FeedPostProjection>(
    await Promise.all(
      selectedRows.map(async (post) => {
        const postId = normalizeIdValue(post._id);
        const mapped = await mapFeedPostRow({
          post,
          viewerReaction: viewerReactionsByPostId.get(postId) ?? null,
        });
        return [postId, mapped] as const;
      }),
    ),
  );
  return {
    live: liveSelected
      .map((post) => projections.get(normalizeIdValue(post._id)))
      .filter((post): post is FeedPostProjection => Boolean(post)),
    ranked: rankedSelected
      .map((post) => projections.get(normalizeIdValue(post._id)))
      .filter((post): post is FeedPostProjection => Boolean(post)),
  };
}

export const listCommunityAiFeedBundle = query({
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
    return await listCommunityAiFeedBundleInternal({
      ctx,
      userId,
      communityId: args.communityId,
      limit: args.limit,
    });
  },
});

export const listCommunityIdsForAiFeedPruneInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const communities = (await ctx.db.query("communities" as any).collect()) as Array<{ _id: any }>;
    return communities.map((community) => normalizeIdValue(community._id)).filter(Boolean);
  },
});

export const pruneCommunityAiFeedPostsInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const rows = (await ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .collect()) as FeedPostRow[];
    const eligible = rows.filter((row) => isEligibleForMonthlyPrune(row, nowMs));
    if (eligible.length < MIN_PRUNE_POOL_SIZE) {
      return {
        community_id: normalizeIdValue(args.communityId),
        eligible_posts: eligible.length,
        posts_hidden: 0,
        pruned: false,
      };
    }
    const pruneCount = Math.floor(eligible.length * PRUNE_PERCENTILE);
    if (pruneCount <= 0) {
      return {
        community_id: normalizeIdValue(args.communityId),
        eligible_posts: eligible.length,
        posts_hidden: 0,
        pruned: false,
      };
    }
    const candidates = eligible
      .slice()
      .sort((a, b) => {
        const scoreDelta = Number(a.score ?? 0) - Number(b.score ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        return a.createdAt - b.createdAt;
      })
      .slice(0, pruneCount)
      .filter((post) => Number(post.score ?? 0) <= MAX_LIVE_SCORE_FOR_PRUNE);
    let postsHidden = 0;
    for (const post of candidates) {
      await hideFeedPost({ ctx, post, nowMs });
      postsHidden += 1;
    }
    return {
      community_id: normalizeIdValue(args.communityId),
      eligible_posts: eligible.length,
      posts_hidden: postsHidden,
      pruned: postsHidden > 0,
    };
  },
});

export const pruneAllCommunityAiFeedPostsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const communityIds = (await ctx.runQuery(
      internal.communityAiFeed.listCommunityIdsForAiFeedPruneInternal as any,
      {},
    )) as string[];
    let communitiesScanned = 0;
    let communitiesPruned = 0;
    let postsHidden = 0;

    for (const communityId of communityIds) {
      communitiesScanned += 1;
      const result = (await ctx.runMutation(
        internal.communityAiFeed.pruneCommunityAiFeedPostsInternal as any,
        {
          communityId,
          nowMs,
        },
      )) as { posts_hidden?: unknown; pruned?: unknown };
      const hiddenCount = Number(result?.posts_hidden ?? 0);
      if (Boolean(result?.pruned)) communitiesPruned += 1;
      if (Number.isFinite(hiddenCount) && hiddenCount > 0) postsHidden += hiddenCount;
    }

    return {
      communities_scanned: communitiesScanned,
      communities_pruned: communitiesPruned,
      posts_hidden: postsHidden,
    };
  },
});

export const deleteExpiredHiddenCommunityAiFeedPostsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(1024, Math.floor(args.limit ?? DEFAULT_HIDDEN_DELETE_BATCH_SIZE)));
    const cutoffMs = nowMs - HIDDEN_RETENTION_MS;
    const expiredRows = (await ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_status_hiddenAt", (q: any) => q.eq("status", "hidden").lt("hiddenAt", cutoffMs + 1))
      .take(limit)) as FeedPostRow[];
    let deletedPosts = 0;
    let deletedReactions = 0;

    for (const post of expiredRows) {
      const reactions = (await ctx.db
        .query("communityAiFeedReactions" as any)
        .withIndex("by_post", (q: any) => q.eq("postId", post._id))
        .collect()) as FeedReactionRow[];
      for (const reaction of reactions) {
        await ctx.db.delete(reaction._id as any);
        deletedReactions += 1;
      }
      await deleteArchiveDocumentBySource(ctx, {
        communityId: post.communityId,
        sourceType: "ai_feed",
        sourceId: normalizeIdValue(post._id),
      });
      await ctx.db.delete(post._id as any);
      deletedPosts += 1;
    }

    return {
      deleted_posts: deletedPosts,
      deleted_reactions: deletedReactions,
    };
  },
});

export const restoreHiddenCommunityAiFeedPostsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    communityId: v.optional(v.id("communities")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Transitional rollout helper: run once after deploy to restore posts hidden by
    // the old threshold-era moderation model, then delete this surface.
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(2048, Math.floor(args.limit ?? 512)));
    const hiddenRows = args.communityId
      ? ((await ctx.db
          .query("communityAiFeedPosts" as any)
          .withIndex("by_community_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", "hidden"),
          )
          .take(limit)) as FeedPostRow[])
      : ((await ctx.db
          .query("communityAiFeedPosts" as any)
          .withIndex("by_status_hiddenAt", (q: any) => q.eq("status", "hidden"))
          .take(limit)) as FeedPostRow[]);
    let restoredPosts = 0;
    for (const post of hiddenRows) {
      await restoreFeedPostToLive({ ctx, post, nowMs });
      restoredPosts += 1;
    }
    return {
      restored_posts: restoredPosts,
    };
  },
});

export const reactToCommunityAiFeedPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    postId: v.id("communityAiFeedPosts"),
    reactionType: v.union(v.literal("good"), v.literal("low_signal")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const post = await getFeedPostOrThrow(ctx, normalizeIdValue(args.postId));
    await requireCommunityChatAccess({
      ctx,
      communityId: post.communityId,
      userId,
    });
    if (post.status !== "live") {
      return await mapFeedPostRow({ post, viewerReaction: null });
    }

    const reactionType = normalizeFeedReactionType(args.reactionType);
    const actorKey = voteActorKeyForUser(userId);
    const existing = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", post._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;

    if (existing?.reactionType === reactionType) {
      return await mapFeedPostRow({ post, viewerReaction: existing });
    }

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        reactionType,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityAiFeedReactions" as any, {
        communityId: post.communityId,
        postId: post._id,
        actorKey,
        actorUserId: userId,
        reactionType,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    await recomputeReactionState({
      ctx,
      post,
      oldReaction: existing,
      nextReactionType: reactionType,
      nowMs,
    });
    const updated = await getFeedPostOrThrow(ctx, normalizeIdValue(post._id));
    await upsertArchiveDocumentForAiFeedPost(ctx, updated);
    const viewerReaction = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", updated._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;
    return await mapFeedPostRow({ post: updated, viewerReaction });
  },
});

export const hideCommunityAiFeedPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    postId: v.id("communityAiFeedPosts"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const post = await getFeedPostOrThrow(ctx, normalizeIdValue(args.postId));
    await requireCommunityModerator({
      ctx,
      communityId: post.communityId,
      userId,
    });
    const nowMs = Date.now();
    if (post.status === "hidden") {
      await upsertHiddenSourceTraceForAiFeedPost({
        ctx,
        post,
        actorType: "admin",
        actorUserId: userId,
        nowMs,
      });
      await deleteArchiveDocumentBySource(ctx, {
        communityId: post.communityId,
        sourceType: "ai_feed",
        sourceId: normalizeIdValue(post._id),
      });
      return { ok: true };
    }
    await ctx.db.patch(post._id as any, {
      status: "hidden",
      hiddenAt: nowMs,
      updatedAt: nowMs,
    });
    const hiddenPost = await getFeedPostOrThrow(ctx, normalizeIdValue(post._id));
    await upsertHiddenSourceTraceForAiFeedPost({
      ctx,
      post: hiddenPost,
      actorType: "admin",
      actorUserId: userId,
      nowMs,
    });
    await deleteArchiveDocumentBySource(ctx, {
      communityId: post.communityId,
      sourceType: "ai_feed",
      sourceId: normalizeIdValue(post._id),
    });
    return { ok: true };
  },
});

export const publishCommunityAiFeedAgentPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    postType: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    evidence: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityModerator({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = Date.now();
    return await insertFeedPost({
      ctx,
      communityId: args.communityId,
      authorUserId: userId,
      authorLabel: "Community agent",
      postType: args.postType,
      title: args.title ?? null,
      body: args.body,
      evidence: args.evidence ?? null,
      nowMs,
    });
  },
});
