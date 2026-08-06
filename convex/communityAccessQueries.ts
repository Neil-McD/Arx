import { query } from "./_generated/server";
import { v } from "convex/values";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  getCommunityAndMembership,
  mapCommunityAccessRow,
  normalizeSlug,
  pickMostRelevantCommunityMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

export const getMyCommunityAccess = query({
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
    (args as { userId?: any }).userId = userId;
    const { community, membership } = await getCommunityAndMembership({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId: args.userId,
    });
  },
});

export const getMyCommunityAccessBySlug = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community || !communityIsActive(community)) return null;
    const membershipRows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", userId))
      .collect()) as CommunityMembershipLike[];
    const membership = pickMostRelevantCommunityMembership(membershipRows);
    return await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId,
    });
  },
});
