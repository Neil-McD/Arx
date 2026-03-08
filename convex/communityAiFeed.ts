import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

const DAY_MS = 24 * 60 * 60 * 1000;
const IMPORTANT_THRESHOLD = 4;
const HIDE_THRESHOLD = -3;
const HUMAN_GOOD_WEIGHT = 2;
const HUMAN_LOW_SIGNAL_WEIGHT = -2;
const AGENT_GOOD_WEIGHT = 1;
const AGENT_LOW_SIGNAL_WEIGHT = -1;

type FeedPostRow = {
  _id: any;
  communityId: any;
  authorType: "agent" | "human";
  authorUserId?: any;
  agentKey?: string;
  authorLabel: string;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  status: "live" | "executed" | "hidden";
  score: number;
  goodCount: number;
  lowSignalCount: number;
  executedCount: number;
  publishConfidence: number;
  noveltyKey?: string;
  createdAt: number;
  updatedAt: number;
  executedAt?: number;
  hiddenAt?: number;
};

type FeedReactionRow = {
  _id: any;
  communityId: any;
  postId: any;
  actorType: "human" | "agent";
  actorKey: string;
  actorUserId?: any;
  agentKey?: string;
  reactionType: "good" | "executed" | "low_signal";
  createdAt: number;
  updatedAt: number;
};

function normalizeFeedPostType(raw: unknown): "observation" | "recommendation" | "action" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "recommendation" || value === "action") return value;
  return "observation";
}

function normalizeFeedReactionType(raw: unknown): "good" | "executed" | "low_signal" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "good" || value === "executed" || value === "low_signal") return value;
  throw new Error("community_ai_feed_reaction_invalid");
}

function normalizeFeedStatus(raw: unknown): "live" | "executed" | "hidden" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "executed" || value === "hidden") return value;
  return "live";
}

function normalizeFeedConfidence(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(6, Math.round(parsed)));
}

function normalizeNoveltyKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  return value.slice(0, 256);
}

function reactionWeight(args: {
  actorType: "human" | "agent";
  reactionType: "good" | "executed" | "low_signal";
}): number {
  if (args.reactionType === "executed") return 0;
  if (args.reactionType === "good") {
    return args.actorType === "agent" ? AGENT_GOOD_WEIGHT : HUMAN_GOOD_WEIGHT;
  }
  return args.actorType === "agent" ? AGENT_LOW_SIGNAL_WEIGHT : HUMAN_LOW_SIGNAL_WEIGHT;
}

function decayForPost(post: FeedPostRow, nowMs: number): number {
  return Math.max(0, Math.floor((Math.max(nowMs, post.createdAt) - post.createdAt) / DAY_MS));
}

function effectiveScoreForPost(post: FeedPostRow, nowMs: number): number {
  return post.score - decayForPost(post, nowMs);
}

async function mapFeedPostRow(args: {
  ctx: any;
  post: FeedPostRow;
  viewerReaction: FeedReactionRow | null;
  nowMs: number;
}) {
  const { post, viewerReaction, nowMs } = args;
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
    status: normalizeFeedStatus(post.status),
    score: Number(post.score ?? 0),
    effective_score: effectiveScoreForPost(post, nowMs),
    publish_confidence: Number(post.publishConfidence ?? 0),
    reaction_counts: {
      good: Math.max(0, Number(post.goodCount ?? 0)),
      executed: Math.max(0, Number(post.executedCount ?? 0)),
      low_signal: Math.max(0, Number(post.lowSignalCount ?? 0)),
    },
    viewer_reaction: viewerReaction?.reactionType ?? null,
    created_at: toIsoString(post.createdAt),
    updated_at: toIsoString(post.updatedAt),
    executed_at: post.executedAt ? toIsoString(post.executedAt) : null,
    hidden_at: post.hiddenAt ? toIsoString(post.hiddenAt) : null,
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

async function recomputeReactionState(args: {
  ctx: any;
  post: FeedPostRow;
  oldReaction: FeedReactionRow | null;
  nextReactionType: "good" | "executed" | "low_signal";
  actorType: "human" | "agent";
  nowMs: number;
}) {
  const nextCounts = {
    good: Math.max(0, Number(args.post.goodCount ?? 0)),
    lowSignal: Math.max(0, Number(args.post.lowSignalCount ?? 0)),
    executed: Math.max(0, Number(args.post.executedCount ?? 0)),
  };
  let nextScore = Number(args.post.score ?? 0);

  if (args.oldReaction) {
    if (args.oldReaction.reactionType === "good") {
      nextCounts.good = Math.max(0, nextCounts.good - 1);
    } else if (args.oldReaction.reactionType === "low_signal") {
      nextCounts.lowSignal = Math.max(0, nextCounts.lowSignal - 1);
    } else if (args.oldReaction.reactionType === "executed") {
      nextCounts.executed = Math.max(0, nextCounts.executed - 1);
    }
    nextScore -= reactionWeight({
      actorType: args.oldReaction.actorType,
      reactionType: args.oldReaction.reactionType,
    });
  }

  if (args.nextReactionType === "good") {
    nextCounts.good += 1;
  } else if (args.nextReactionType === "low_signal") {
    nextCounts.lowSignal += 1;
  } else {
    nextCounts.executed += 1;
  }

  nextScore += reactionWeight({
    actorType: args.actorType,
    reactionType: args.nextReactionType,
  });

  if (args.nextReactionType === "executed") {
    await args.ctx.db.patch(args.post._id as any, {
      score: nextScore,
      goodCount: nextCounts.good,
      lowSignalCount: nextCounts.lowSignal,
      executedCount: nextCounts.executed,
      status: "executed",
      executedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return;
  }

  const nextStatus = nextScore <= HIDE_THRESHOLD ? "hidden" : "live";
  await args.ctx.db.patch(args.post._id as any, {
    score: nextScore,
    goodCount: nextCounts.good,
    lowSignalCount: nextCounts.lowSignal,
    executedCount: nextCounts.executed,
    status: nextStatus,
    hiddenAt: nextStatus === "hidden" ? args.nowMs : undefined,
    updatedAt: args.nowMs,
  });
}

export const listCommunityAiFeedLive = query({
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .collect()) as FeedPostRow[];
    const selected = rows
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    const actorKey = `human:${normalizeIdValue(userId)}`;
    const viewerReactionsByPostId = await getViewerReactionsByPostId({
      ctx,
      actorKey,
      postIds: selected.map((row) => normalizeIdValue(row._id)),
    });
    return await Promise.all(
      selected.map((post) =>
        mapFeedPostRow({
          ctx,
          post,
          viewerReaction: viewerReactionsByPostId.get(normalizeIdValue(post._id)) ?? null,
          nowMs,
        }),
      ),
    );
  },
});

export const listCommunityAiFeedImportant = query({
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .collect()) as FeedPostRow[];
    const selected = rows
      .filter((post) => effectiveScoreForPost(post, nowMs) >= IMPORTANT_THRESHOLD)
      .sort((a, b) => {
        const scoreDelta = effectiveScoreForPost(b, nowMs) - effectiveScoreForPost(a, nowMs);
        if (scoreDelta !== 0) return scoreDelta;
        return b.createdAt - a.createdAt;
      })
      .slice(0, limit);
    const actorKey = `human:${normalizeIdValue(userId)}`;
    const viewerReactionsByPostId = await getViewerReactionsByPostId({
      ctx,
      actorKey,
      postIds: selected.map((row) => normalizeIdValue(row._id)),
    });
    return await Promise.all(
      selected.map((post) =>
        mapFeedPostRow({
          ctx,
          post,
          viewerReaction: viewerReactionsByPostId.get(normalizeIdValue(post._id)) ?? null,
          nowMs,
        }),
      ),
    );
  },
});

export const reactToCommunityAiFeedPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    postId: v.id("communityAiFeedPosts"),
    reactionType: v.union(v.literal("good"), v.literal("executed"), v.literal("low_signal")),
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
      return await mapFeedPostRow({ ctx, post, viewerReaction: null, nowMs });
    }

    const reactionType = normalizeFeedReactionType(args.reactionType);
    const actorKey = `human:${normalizeIdValue(userId)}`;
    const existing = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", post._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;

    if (existing?.reactionType === reactionType) {
      return await mapFeedPostRow({ ctx, post, viewerReaction: existing, nowMs });
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
        actorType: "human",
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
      actorType: "human",
      nowMs,
    });
    const updated = await getFeedPostOrThrow(ctx, normalizeIdValue(post._id));
    const viewerReaction = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", updated._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;
    return await mapFeedPostRow({ ctx, post: updated, viewerReaction, nowMs });
  },
});

export const publishCommunityAiFeedPost = internalMutation({
  args: {
    communityId: v.id("communities"),
    authorType: v.union(v.literal("agent"), v.literal("human")),
    authorUserId: v.optional(v.id("users")),
    agentKey: v.optional(v.union(v.string(), v.null())),
    authorLabel: v.string(),
    postType: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    publishConfidence: v.optional(v.number()),
    noveltyKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const noveltyKey = normalizeNoveltyKey(args.noveltyKey);
    if (noveltyKey) {
      const existingRows = (await ctx.db
        .query("communityAiFeedPosts" as any)
        .withIndex("by_community_noveltyKey", (q: any) =>
          q.eq("communityId", args.communityId).eq("noveltyKey", noveltyKey),
        )
        .collect()) as FeedPostRow[];
      const existing = existingRows.find((row) => row.status === "live");
      if (existing) return await mapFeedPostRow({ ctx, post: existing, viewerReaction: null, nowMs });
    }

    const title = normalizeOptionalText(args.title, 180);
    const body = normalizeOptionalText(args.body, 12_000);
    if (!body) throw new Error("community_ai_feed_body_required");
    const authorLabel = normalizeName(args.authorLabel);
    const id = await ctx.db.insert("communityAiFeedPosts" as any, {
      communityId: args.communityId,
      authorType: args.authorType,
      authorUserId: args.authorUserId,
      agentKey: normalizeNoveltyKey(args.agentKey),
      authorLabel,
      type: normalizeFeedPostType(args.postType),
      title,
      body,
      status: "live",
      score: normalizeFeedConfidence(args.publishConfidence),
      goodCount: 0,
      lowSignalCount: 0,
      executedCount: 0,
      publishConfidence: normalizeFeedConfidence(args.publishConfidence),
      noveltyKey,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await getFeedPostOrThrow(ctx, normalizeIdValue(id));
    return await mapFeedPostRow({ ctx, post: created, viewerReaction: null, nowMs });
  },
});

export const reactToCommunityAiFeedPostAsAgent = internalMutation({
  args: {
    postId: v.id("communityAiFeedPosts"),
    agentKey: v.string(),
    reactionType: v.union(v.literal("good"), v.literal("low_signal")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const post = await getFeedPostOrThrow(ctx, normalizeIdValue(args.postId));
    if (post.status !== "live") {
      return await mapFeedPostRow({ ctx, post, viewerReaction: null, nowMs });
    }

    const reactionType = normalizeFeedReactionType(args.reactionType);
    if (reactionType === "executed") {
      throw new Error("community_ai_feed_agent_executed_forbidden");
    }
    const agentKey = normalizeNoveltyKey(args.agentKey);
    if (!agentKey) throw new Error("community_ai_feed_agent_key_required");
    const actorKey = `agent:${agentKey}`;
    const existing = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", post._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;

    if (existing?.reactionType === reactionType) {
      return await mapFeedPostRow({ ctx, post, viewerReaction: existing, nowMs });
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
        actorType: "agent",
        actorKey,
        agentKey,
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
      actorType: "agent",
      nowMs,
    });
    const updated = await getFeedPostOrThrow(ctx, normalizeIdValue(post._id));
    const viewerReaction = (await ctx.db
      .query("communityAiFeedReactions" as any)
      .withIndex("by_post_actorKey", (q: any) =>
        q.eq("postId", updated._id).eq("actorKey", actorKey),
      )
      .first()) as FeedReactionRow | null;
    return await mapFeedPostRow({ ctx, post: updated, viewerReaction, nowMs });
  },
});
