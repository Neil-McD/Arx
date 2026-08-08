import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedActorByTrustedSubject } from "./authActor";
import {
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

const retiredPostType = v.union(
  v.literal("observation"),
  v.literal("recommendation"),
  v.literal("action"),
);

function retired(): never {
  throw new Error("ai_feed_retired");
}

/**
 * Rolling-client tombstone. The product surface is retired, so authorized
 * cached clients receive an empty projection instead of stale feed data.
 */
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return { live: [], ranked: [] };
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
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    retired();
  },
});

export const hideCommunityAiFeedPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    postId: v.id("communityAiFeedPosts"),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    retired();
  },
});

export const publishCommunityAiFeedAgentPost = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    postType: retiredPostType,
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    retired();
  },
});

export const publishCommunityAiFeedAgentPostInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.string(),
    communityId: v.id("communities"),
    postType: retiredPostType,
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    retired();
  },
});

export const publishCanonicalPolynetAiFeedPostInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.string(),
    communityId: v.id("communities"),
    principalKind: v.union(
      v.literal("personal_agent"),
      v.literal("external_mcp"),
      v.literal("community_agent"),
    ),
    idempotencyKey: v.string(),
    postType: retiredPostType,
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      authSubject: args.authSubject,
      userId: args.userId,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    retired();
  },
});
