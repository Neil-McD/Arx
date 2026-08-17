import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

/**
 * Authenticated, stateless compatibility tombstones for cached clients that
 * predate the irreducible member-entry flow. These operations intentionally
 * retain their API names while never reading or writing retired onboarding
 * state. Remove them only after the cached-client compatibility window closes.
 */

const disabledConfig = {
  enabled: false,
  intro_video_url: null,
  updated_at: null,
} as const;

async function requireAuthenticatedCommunityMember(ctx: any, args: {
  userId?: any;
  authSubject?: string;
  communityId: any;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
}

export const getCommunityOnboardingConfig = query({
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
    return disabledConfig;
  },
});

export const saveCommunityOnboardingConfig = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    enabled: v.boolean(),
    introVideoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    return disabledConfig;
  },
});

const retiredSessionMutationArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
  communityId: v.id("communities"),
  sessionId: v.id("communityOnboardingSessions"),
};

export const completeMyCommunityOnboardingOrientation = mutation({
  args: retiredSessionMutationArgs,
  handler: async (ctx, args) => {
    await requireAuthenticatedCommunityMember(ctx, args);
    return null;
  },
});

export const dismissMyCommunityOnboardingSession = mutation({
  args: retiredSessionMutationArgs,
  handler: async (ctx, args) => {
    await requireAuthenticatedCommunityMember(ctx, args);
    return { dismissed: true };
  },
});

export const completeMyCommunityOnboardingMcpHandoff = mutation({
  args: retiredSessionMutationArgs,
  handler: async (ctx, args) => {
    await requireAuthenticatedCommunityMember(ctx, args);
    return null;
  },
});

export const acknowledgeMyCommunityOnboardingAgentTurn = mutation({
  args: retiredSessionMutationArgs,
  handler: async (ctx, args) => {
    await requireAuthenticatedCommunityMember(ctx, args);
    return null;
  },
});
