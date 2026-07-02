/* Host-curated featured messages — the visitor-visible projection of community life.
   Pointer table over communityChatMessages; feature/unfeature is moderator-gated.
   Public read happens inside communityPublic.resolvePublicFunnelBySlug. */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityModerator } from "./communityCore";

const FEATURED_MESSAGE_CAP = 12;

export const featureCommunityMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.id("communityChatMessages"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("message_not_found");
    const thread = await ctx.db.get(message.threadId);
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityModerator({ ctx, communityId: thread.communityId, userId });

    const existing = await ctx.db
      .query("communityFeaturedMessages")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (existing) return { ok: true, featured: true, already: true };

    const current = await ctx.db
      .query("communityFeaturedMessages")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", thread.communityId))
      .collect();
    if (current.length >= FEATURED_MESSAGE_CAP) {
      throw new Error("featured_message_cap_reached");
    }

    await ctx.db.insert("communityFeaturedMessages", {
      communityId: thread.communityId,
      messageId: args.messageId,
      featuredByUserId: userId,
      createdAt: Date.now(),
    });
    return { ok: true, featured: true };
  },
});

export const unfeatureCommunityMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.id("communityChatMessages"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("message_not_found");
    const thread = await ctx.db.get(message.threadId);
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityModerator({ ctx, communityId: thread.communityId, userId });

    const existing = await ctx.db
      .query("communityFeaturedMessages")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true, featured: false };
  },
});
