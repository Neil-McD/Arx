import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  getCommunityAndMembership,
  getUniqueCommunityMembershipByPair,
  mapCommunityAccessRow,
  normalizeSlug,
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
    if (!community) return null;
    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: community._id,
      userId,
    });
    return await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId,
    });
  },
});
