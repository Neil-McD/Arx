import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { upsertArchiveDocumentForAiFeedPost } from "./communityArchiveDocuments";

const HIDE_THRESHOLD = -2;
const GOOD_WEIGHT = 1;
const LOW_SIGNAL_WEIGHT = -1;

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
  whyNow?: string;
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

function normalizeFeedStatus(raw: unknown): "live" | "hidden" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "hidden") return value;
  return "live";
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

function voteActorKeyForUser(userId: any): string {
  return `user:${normalizeIdValue(userId)}`;
}

function reactionWeight(reactionType: "good" | "low_signal"): number {
  if (reactionType === "good") {
    return GOOD_WEIGHT;
  }
  return LOW_SIGNAL_WEIGHT;
}

function effectiveScoreForPost(post: FeedPostRow, nowMs: number): number {
  void nowMs;
  return Number(post.score ?? 0);
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
    evidence: normalizeFeedEvidence(post.evidence),
    status: normalizeFeedStatus(post.status),
    score: Number(post.score ?? 0),
    effective_score: effectiveScoreForPost(post, nowMs),
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
  authorUserId?: any;
  agentKey?: string | null;
  authorLabel: string;
  postType: "observation" | "recommendation" | "action";
  title?: string | null;
  body: string;
  whyNow?: string | null;
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
  const id = await args.ctx.db.insert("communityAiFeedPosts" as any, {
    communityId: args.communityId,
    authorType: "agent",
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
    noveltyKey,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await getFeedPostOrThrow(args.ctx, normalizeIdValue(id));
  await upsertArchiveDocumentForAiFeedPost(args.ctx, created);
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
  const nowMs = Date.now();
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
      const scoreDelta = effectiveScoreForPost(b, nowMs) - effectiveScoreForPost(a, nowMs);
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
          ctx: args.ctx,
          post,
          viewerReaction: viewerReactionsByPostId.get(postId) ?? null,
          nowMs,
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
    const actorKey = voteActorKeyForUser(userId);
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
    return await mapFeedPostRow({ ctx, post: updated, viewerReaction, nowMs });
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
