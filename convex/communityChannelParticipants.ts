import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, normalizeIdValue,
  requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { requireCommunityChannelLineage, resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { resolveCommunityPresenceAuthorization } from "./communityPresenceCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";

const scope = { communityId: v.id("communities"), channelId: v.id("communityChannels"),
  userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) };
const target = v.union(v.object({ kind: v.literal("member"), userId: v.id("users") }),
  v.object({ kind: v.literal("community_agent") }));

// Read-only roster for an authorized channel viewer. This is deliberately
// separate from the manager-only grant editor below; no grant metadata escapes.
export const listChannelRoster = query({
  args: { ...scope, channelId: v.optional(v.id("communityChannels")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canRead" });
    const community = (await ctx.db.get(args.communityId))!;
    const prefix = `channel-roster-v1:${args.communityId}:${args.channelId ?? "general"}:`;
    const supplied = args.paginationOpts.cursor;
    if (supplied !== null && !supplied.startsWith(prefix)) throw new Error("community_channel_roster_cursor_invalid");
    const cursor = supplied === null ? null : supplied.slice(prefix.length);
    const size = Math.min(50, Math.max(2, Math.floor(args.paginationOpts.numItems)));
    const result = await ctx.db.query("communityMemberships")
      .withIndex("by_community_createdAt", q => q.eq("communityId", args.communityId))
      .order("asc").paginate({ cursor, numItems: cursor === null ? size - 1 : size, maximumRowsRead: size * 3 });
    const page: Array<{ user_id: typeof userId; role: string;
      profile: Awaited<ReturnType<typeof resolveUserProfileDisplayProjection>>; last_seen_at: number | null; active_until: number | null }> = [];
    const seen = new Set<string>();
    const append = async (candidateId: typeof userId, expectedMembershipId?: string) => {
      if (seen.has(String(candidateId))) return;
      const authorization = await resolveCommunityPresenceAuthorization({ ctx, community, userId: candidateId });
      if (!authorization.authorized || (expectedMembershipId && String(authorization.membership?._id) !== expectedMembershipId)) return;
      const candidate = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: candidateId });
      if (!(await getCommunityChannelCapabilities({ ctx, channel, actor: candidate })).canRead) return;
      seen.add(String(candidateId));
      const presence = await ctx.db.query("communityPresence")
        .withIndex("by_community_user", q => q.eq("communityId", args.communityId).eq("userId", candidateId)).first();
      page.push({ user_id: candidateId, role: candidateId === community.ownerId ? "owner" : authorization.membership!.role,
        profile: await resolveUserProfileDisplayProjection(ctx, candidateId), last_seen_at: presence?.lastSeenAt ?? null, active_until: presence?.activeUntil ?? null });
    };
    if (cursor === null) await append(community.ownerId);
    for (const member of result.page) {
      if (member.userId !== community.ownerId && communityMembershipRowIsActive(member)) await append(member.userId, String(member._id));
    }
    const agent = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId, kind: "community_agent" });
    const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor: agent });
    return { page, isDone: result.isDone, continueCursor: result.isDone ? null : prefix + result.continueCursor,
      agents: capabilities.canRead ? [{ key: "community_agent" as const, capabilities }] : [] };
  },
});

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
    return setChannelParticipantCore(ctx, { ...args, createdByUserId: manager.userId });
  },
});

/** Caller must establish manager authority; grants retain activation lineage. */
export async function setChannelParticipantCore(ctx: any, args: {
  communityId: any; channelId: any; createdByUserId: any; active: boolean;
  target: { kind: "member"; userId: any } | { kind: "community_agent" };
}) {
    const principalKey = args.target.kind === "member" ? `user:${args.target.userId}` : "community_agent";
    const existing = await ctx.db.query("communityChannelParticipants")
      .withIndex("by_channel_principal", (q: any) => q.eq("channelId", args.channelId).eq("principalKey", principalKey)).take(2);
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
      principalKey, status, ...binding, createdByUserId: args.createdByUserId, createdAt: now, updatedAt: now });
    return { changed: true };
}

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
