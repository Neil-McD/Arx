// Typing presence for community chat. The module keeps its name because the
// cached production web calls these as communityChat:*; the old thread chat
// that lived here was retired in POL-26.
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCommunityChatAccess, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import {
  clearCommunityTypingLease,
  renewCommunityTypingLease,
  resolveCommunityTypingPresence,
} from "./communityTypingPresenceCore";

export const setCommunityTyping = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.optional(v.id("communityInteractionRoots")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const lease = await renewCommunityTypingLease({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId: args.userId,
      rootId: args.rootId,
    });
    return { ok: true, display_until_ms: lease.displayUntil };
  },
});

export const clearCommunityTyping = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.optional(v.id("communityInteractionRoots")),
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
    const result = await clearCommunityTypingLease({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId,
      rootId: args.rootId,
    });
    return { ok: true, cleared: result.cleared };
  },
});

export const listCommunityTyping = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const presence = await resolveCommunityTypingPresence({
      ctx,
      community,
      channelId: args.channelId,
      viewerUserId: args.userId,
    });
    return {
      users: presence.users.map(({ canonical_user_id: _canonicalUserId, ...user }) => user),
      total_count: presence.totalCount,
      total_count_capped: presence.totalCountCapped,
    };
  },
});

// A community site sets its member's typing in a channel (by slug), or in one
// post's thread. It sets rather than toggles, so a retried call is harmless.
export const setCommunityTypingForUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    channelSlug: v.string(),
    on: v.boolean(),
    rootId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId,
      channelSlug: args.channelSlug, actor, capability: "canRead" });
    const rootId = args.rootId ? ctx.db.normalizeId("communityInteractionRoots", args.rootId) : null;
    if (args.rootId && !rootId) throw new Error("community_typing_scope_invalid");
    const scope = { ctx, communityId: args.communityId, channelId: channel._id ?? null, userId: args.userId, rootId };
    if (!args.on) {
      await clearCommunityTypingLease(scope);
      return { on: false };
    }
    const lease = await renewCommunityTypingLease(scope);
    return { on: true, display_until_ms: lease.displayUntil };
  },
});
