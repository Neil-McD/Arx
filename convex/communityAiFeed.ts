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
const DECAY_WINDOW_DAYS = 3;
const RANKED_THRESHOLD = 2;
const HIDE_THRESHOLD = -2;
const GOOD_WEIGHT = 1;
const LOW_SIGNAL_WEIGHT = -1;

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
  whyNow?: string;
  evidence?: string[];
  status: "live" | "hidden";
  score: number;
  goodCount: number;
  lowSignalCount: number;
  publishConfidence: number;
  noveltyKey?: string;
  createdAt: number;
  updatedAt: number;
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

function normalizeFeedStatus(raw: unknown): "live" | "hidden" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "hidden") return value;
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

function reactionWeight(args: {
  actorType: "human" | "agent";
  reactionType: "good" | "low_signal";
}): number {
  void args.actorType;
  if (args.reactionType === "good") {
    return GOOD_WEIGHT;
  }
  return LOW_SIGNAL_WEIGHT;
}

function decayForPost(post: FeedPostRow, nowMs: number): number {
  return Math.max(
    0,
    Math.floor((Math.max(nowMs, post.createdAt) - post.createdAt) / (DAY_MS * DECAY_WINDOW_DAYS)),
  );
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
    why_now: String(post.whyNow ?? "").trim() || null,
    evidence: normalizeFeedEvidence(post.evidence),
    status: normalizeFeedStatus(post.status),
    score: Number(post.score ?? 0),
    effective_score: effectiveScoreForPost(post, nowMs),
    publish_confidence: Number(post.publishConfidence ?? 0),
    reaction_counts: {
      good: Math.max(0, Number(post.goodCount ?? 0)),
      low_signal: Math.max(0, Number(post.lowSignalCount ?? 0)),
    },
    viewer_reaction: viewerReaction?.reactionType ?? null,
    created_at: toIsoString(post.createdAt),
    updated_at: toIsoString(post.updatedAt),
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

async function insertFeedPost(args: {
  ctx: any;
  communityId: any;
  authorType: "agent" | "human";
  authorUserId?: any;
  agentKey?: string | null;
  authorLabel: string;
  postType: "observation" | "recommendation" | "action";
  title?: string | null;
  body: string;
  whyNow?: string | null;
  evidence?: string[] | null;
  publishConfidence?: number;
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
      return await mapFeedPostRow({
        ctx: args.ctx,
        post: existing,
        viewerReaction: null,
        nowMs: args.nowMs,
      });
    }
  }

  const title = normalizeOptionalText(args.title, 180);
  const body = normalizeOptionalText(args.body, 12_000);
  if (!body) throw new Error("community_ai_feed_body_required");
  const whyNow = normalizeOptionalText(args.whyNow, 280);
  const evidence = normalizeFeedEvidence(args.evidence);
  const authorLabel = normalizeName(args.authorLabel);
  const normalizedConfidence = normalizeFeedConfidence(args.publishConfidence);
  const id = await args.ctx.db.insert("communityAiFeedPosts" as any, {
    communityId: args.communityId,
    authorType: args.authorType,
    authorUserId: args.authorUserId,
    agentKey: normalizeNoveltyKey(args.agentKey),
    authorLabel,
    type: normalizeFeedPostType(args.postType),
    title,
    body,
    whyNow,
    evidence,
    status: "live",
    score: 0,
    goodCount: 0,
    lowSignalCount: 0,
    publishConfidence: normalizedConfidence,
    noveltyKey,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await getFeedPostOrThrow(args.ctx, normalizeIdValue(id));
  return await mapFeedPostRow({
    ctx: args.ctx,
    post: created,
    viewerReaction: null,
    nowMs: args.nowMs,
  });
}

async function recomputeReactionState(args: {
  ctx: any;
  post: FeedPostRow;
  oldReaction: FeedReactionRow | null;
  nextReactionType: "good" | "low_signal";
  actorType: "human" | "agent";
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
    nextScore -= reactionWeight({
      actorType: args.oldReaction.actorType,
      reactionType: args.oldReaction.reactionType,
    });
  }

  if (args.nextReactionType === "good") {
    nextCounts.good += 1;
  } else {
    nextCounts.lowSignal += 1;
  }

  nextScore += reactionWeight({
    actorType: args.actorType,
    reactionType: args.nextReactionType,
  });

  const nextStatus = nextScore <= HIDE_THRESHOLD ? "hidden" : "live";
  await args.ctx.db.patch(args.post._id as any, {
    score: nextScore,
    goodCount: nextCounts.good,
    lowSignalCount: nextCounts.lowSignal,
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

export const listCommunityAiFeedRanked = query({
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
      .filter((post) => effectiveScoreForPost(post, nowMs) >= RANKED_THRESHOLD)
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

export const listCommunityAiFeedImportant = listCommunityAiFeedRanked;

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

export const publishCommunityAiFeedAgentPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    agentKey: v.optional(v.union(v.string(), v.null())),
    authorLabel: v.optional(v.union(v.string(), v.null())),
    postType: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    whyNow: v.optional(v.union(v.string(), v.null())),
    evidence: v.optional(v.union(v.array(v.string()), v.null())),
    publishConfidence: v.optional(v.number()),
    noveltyKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
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
    const nowMs = args.nowMs ?? Date.now();
    return await insertFeedPost({
      ctx,
      communityId: args.communityId,
      authorType: "agent",
      authorUserId: userId,
      agentKey: args.agentKey ?? null,
      authorLabel: normalizeOptionalText(args.authorLabel, 80) || "Community agent",
      postType: args.postType,
      title: args.title ?? null,
      body: args.body,
      whyNow: args.whyNow ?? null,
      evidence: args.evidence ?? null,
      publishConfidence: args.publishConfidence,
      noveltyKey: args.noveltyKey ?? null,
      nowMs,
    });
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
    whyNow: v.optional(v.union(v.string(), v.null())),
    evidence: v.optional(v.union(v.array(v.string()), v.null())),
    publishConfidence: v.optional(v.number()),
    noveltyKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await insertFeedPost({
      ctx,
      communityId: args.communityId,
      authorType: args.authorType,
      authorUserId: args.authorUserId,
      agentKey: args.agentKey ?? null,
      authorLabel: args.authorLabel,
      postType: args.postType,
      title: args.title ?? null,
      body: args.body,
      whyNow: args.whyNow ?? null,
      evidence: args.evidence ?? null,
      publishConfidence: args.publishConfidence,
      noveltyKey: args.noveltyKey ?? null,
      nowMs: args.nowMs ?? Date.now(),
    });
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
