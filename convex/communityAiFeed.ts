import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  resolveAuthenticatedActorByTrustedSubject,
} from "./authActor";
import {
  normalizeIdValue,
  normalizeName,
  normalizeOptionalText,
  requireCommunityChatAccess,
  requireCommunityModerator,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { upsertCommunitySourceTrace } from "./communityIntelligenceDirectory";

const DAY_MS = 24 * 60 * 60 * 1000;
const HIDDEN_RETENTION_MS = 60 * DAY_MS;
const DEFAULT_HIDDEN_DELETE_BATCH_SIZE = 256;
const MAX_FEED_POST_LIMIT = 200;
const MAX_NOVELTY_KEY_MATCHES = 10;

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
  whyNow?: string;
  status: "live" | "hidden";
  noveltyKey?: string;
  createdAt: number;
  updatedAt: number;
  hiddenAt?: number;
};

async function publishCommunityAiFeedAgentPostForUser(args: {
  ctx: any;
  userId: any;
  communityId: any;
  postType: "observation" | "recommendation" | "action";
  title?: string | null;
  body: string;
  evidence?: string[] | null;
}) {
  await requireCommunityModerator({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const nowMs = Date.now();
  return await insertFeedPost({
    ctx: args.ctx,
    communityId: args.communityId,
    authorUserId: args.userId,
    authorLabel: "Community agent",
    postType: args.postType,
    title: args.title ?? null,
    body: args.body,
    evidence: args.evidence ?? null,
    nowMs,
  });
}

function normalizeFeedPostType(raw: unknown): "observation" | "recommendation" | "action" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "recommendation" || value === "action") return value;
  return "observation";
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
    // Missing agent identity stays missing. Publication proves community
    // authority; it does not authorize fabricating agent attribution.
    actorAgentKey: post.agentKey,
    allowExistingUpdate: true,
    nowMs,
  });
}

async function upsertHiddenSourceTraceForAiFeedPost(args: {
  ctx: any;
  post: FeedPostRow;
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
    // Redaction changes readability, not source authorship. The moderator is a
    // lifecycle actor and must not replace the post's lineage.
    actorType: "agent",
    actorUserId: args.post.authorUserId,
    actorAgentKey: args.post.agentKey,
    allowExistingUpdate: true,
    nowMs: args.nowMs,
  });
}

function mapFeedPostRow(post: FeedPostRow) {
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
    created_at: toIsoString(post.createdAt),
    updated_at: toIsoString(post.updatedAt),
  };
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
      .take(MAX_NOVELTY_KEY_MATCHES)) as FeedPostRow[];
    const existing = existingRows.find((row) => row.status === "live");
    if (existing) {
      await upsertSourceTraceForAiFeedPost(args.ctx, existing, args.nowMs);
      return mapFeedPostRow(existing);
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
    noveltyKey,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = await getFeedPostOrThrow(args.ctx, normalizeIdValue(id));
  await upsertSourceTraceForAiFeedPost(args.ctx, created, args.nowMs);
  return mapFeedPostRow(created);
}

type FeedPostProjection = Awaited<ReturnType<typeof mapFeedPostRow>>;

async function listCommunityAiFeedPostsInternal(args: {
  ctx: any;
  userId: any;
  communityId: any;
  limit?: number;
}): Promise<FeedPostProjection[]> {
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const limit = Math.max(1, Math.min(MAX_FEED_POST_LIMIT, Math.floor(args.limit ?? 50)));
  const posts = (await args.ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.communityId).eq("status", "live"),
    )
    .order("desc")
    .take(limit)) as FeedPostRow[];
  return posts.map(mapFeedPostRow);
}

export const listCommunityAiFeedPosts = query({
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
    return await listCommunityAiFeedPostsInternal({
      ctx,
      userId,
      communityId: args.communityId,
      limit: args.limit,
    });
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
    for (const post of expiredRows) {
      await ctx.db.delete(post._id as any);
      deletedPosts += 1;
    }

    return {
      deleted_posts: deletedPosts,
    };
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
        nowMs,
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
      nowMs,
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
    return await publishCommunityAiFeedAgentPostForUser({
      ctx,
      communityId: args.communityId,
      userId,
      postType: args.postType,
      title: args.title ?? null,
      body: args.body,
      evidence: args.evidence ?? null,
    });
  },
});

export const publishCommunityAiFeedAgentPostInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.string(),
    communityId: v.id("communities"),
    postType: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    evidence: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      authSubject: args.authSubject,
      userId: args.userId,
    });
    return await publishCommunityAiFeedAgentPostForUser({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
      postType: args.postType,
      title: args.title ?? null,
      body: args.body,
      evidence: args.evidence ?? null,
    });
  },
});
