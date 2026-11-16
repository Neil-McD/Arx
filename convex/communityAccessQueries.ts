import { query } from "./_generated/server";
import { v } from "convex/values";
import { communityIsActive } from "../shared/communityLifecycle";
import { communityAgentIsOn } from "./communityApps";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  getCommunityAndMembership,
  mapCommunityAccessRow,
  normalizeSlug,
  pickMostRelevantCommunityMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

// Whether the community's guide is on, in the record the app waits for before
// it draws a community, so pages never draw with the guide and then without it.
// Only someone who may read the chat learns it, as getCommunityAgentOn required.
async function withAgentOn<T extends { community_id: string; can_read_chat?: boolean }>(ctx: any, row: T): Promise<T & { agent_on: boolean | null }> {
  return { ...row, agent_on: row.can_read_chat ? await communityAgentIsOn(ctx, row.community_id) : null };
}

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
    return await withAgentOn(ctx, await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId: args.userId,
    }));
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
    return await withAgentOn(ctx, await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId,
    }));
  },
});
