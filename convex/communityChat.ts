// Typing presence for community chat. The module keeps its name because the
// cached production web calls these as communityChat:*; the old thread chat
// that lived here was retired in POL-26.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCommunityChatAccess, resolveUserIdForAuthenticatedRequest } from "./communityCore";
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
      users: presence.users,
      total_count: presence.totalCount,
      total_count_capped: presence.totalCountCapped,
    };
  },
});
