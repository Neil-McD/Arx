import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, normalizeIdValue,
  requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { requireCommunityChannelLineage } from "./communityChannelCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";

const scope = { communityId: v.id("communities"), channelId: v.id("communityChannels"),
  userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) };
const target = v.union(v.object({ kind: v.literal("member"), userId: v.id("users") }),
  v.object({ kind: v.literal("community_agent") }));

async function requireManager(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const channel = await requireCommunityChannelLineage({ ctx, communityId: args.communityId, channelId: args.channelId });
  if (channel.status !== "active" || channel.systemRole === "general") throw new Error("community_channel_unavailable");
  return { userId, channel };
}

// One transactional upsert per channel/principal. Concurrent invocations share
// the indexed read, so Convex's conflict retry cannot create duplicate grants.
export const setParticipant = mutation({
  args: { ...scope, target, active: v.boolean() },
  handler: async (ctx, args) => {
    const manager = await requireManager(ctx, args);
    const principalKey = args.target.kind === "member" ? `user:${args.target.userId}` : "community_agent";
    const existing = await ctx.db.query("communityChannelParticipants")
      .withIndex("by_channel_principal", q => q.eq("channelId", args.channelId).eq("principalKey", principalKey)).take(2);
    if (existing.length > 1) throw new Error("community_channel_participant_duplicate");
    if (existing[0] && existing[0].communityId !== args.communityId) throw new Error("community_channel_unavailable");
    let membership: Awaited<ReturnType<typeof getUniqueCommunityMembershipByPair>> = null;
    if (args.active && args.target.kind === "member") {
      membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.target.userId });
      if (!membership || !communityMembershipRowIsActive(membership)) throw new Error("community_channel_member_inactive");
    }
    const binding = membership ? { membershipId: membership._id as any,
      membershipActivationSequence: Math.max(0, Math.floor(Number(membership.activationSequence ?? 0))) } : {};
    const status = args.active ? "active" as const : "revoked" as const;
    const previous = existing[0];
    if (!args.active && !previous) return { changed: false };
    if (previous?.status === status && (!args.active || (
      normalizeIdValue(previous.membershipId) === normalizeIdValue(binding.membershipId) &&
      previous.membershipActivationSequence === binding.membershipActivationSequence
    ))) return { changed: false };
    const now = Date.now();
    if (previous) await ctx.db.patch(previous._id, { status, ...binding, updatedAt: now });
    else await ctx.db.insert("communityChannelParticipants", { communityId: args.communityId, channelId: args.channelId,
      principalKey, status, ...binding, createdByUserId: manager.userId, createdAt: now, updatedAt: now });
    return { changed: true };
  },
});

// A channel-specific view of canonical community memberships, not another
// directory or copied profile store. Pages remain bounded for large communities.
export const listMemberAccess = query({
  args: { ...scope, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { channel, userId } = await requireManager(ctx, args);
    const agent = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId, kind: "community_agent" });
    const result = await ctx.db.query("communityMemberships")
      .withIndex("by_community_createdAt", q => q.eq("communityId", args.communityId))
      .paginate({ ...args.paginationOpts, numItems: Math.min(50, Math.max(1, args.paginationOpts.numItems)) });
    const page = await Promise.all(result.page.filter(communityMembershipRowIsActive).map(async membership => {
      const grants = await ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", q => q.eq("channelId", args.channelId).eq("principalKey", `user:${membership.userId}`)).take(2);
      if (grants.length > 1) throw new Error("community_channel_participant_duplicate");
      const grant = grants[0];
      const active = grant?.communityId === args.communityId && grant.status === "active" &&
        grant.membershipId === membership._id &&
        grant.membershipActivationSequence === Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)));
      return { user_id: membership.userId, role: membership.role, active,
        profile: await resolveUserProfileDisplayProjection(ctx, membership.userId) };
    }));
    return { ...result, page, access_mode: channel.accessMode,
      community_agent_enabled: (await getCommunityChannelCapabilities({ ctx, channel, actor: agent })).canRead };
  },
});
