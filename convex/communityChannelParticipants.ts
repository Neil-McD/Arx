import { notifyConnectedApps } from "./connectedAppNotify";
import { schedulePodBillingCheck } from "./communityPodBillingCheck";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, normalizeIdValue,
  requireCommunityManager, resolvePublicUserId, resolveUserIdForAuthenticatedRequest } from "./communityCore";
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
    const prefix = `channel-roster-v2:${args.communityId}:${args.channelId ?? "general"}:`;
    const supplied = args.paginationOpts.cursor;
    if (supplied !== null && !supplied.startsWith(prefix)) throw new Error("community_channel_roster_cursor_invalid");
    let phase: "presence" | "members" = "presence";
    let cursor: string | null = null;
    if (supplied !== null) {
      try {
        const state = JSON.parse(supplied.slice(prefix.length));
        if ((state.phase !== "presence" && state.phase !== "members") || (state.cursor !== null && typeof state.cursor !== "string")) throw new Error();
        phase = state.phase; cursor = state.cursor;
      } catch { throw new Error("community_channel_roster_cursor_invalid"); }
    } else if (!(await ctx.db.query("communityPresence")
      .withIndex("by_community_lastSeenAt", q => q.eq("communityId", args.communityId)).first())) {
      // Empty communities need no empty presence page before their membership list.
      phase = "members";
    }
    const size = Math.min(50, Math.max(2, Math.floor(args.paginationOpts.numItems)));
    const page: Array<{ user_id: string; role: string; membership_id?: string; membership_created_at?: string;
      profile: Awaited<ReturnType<typeof resolveUserProfileDisplayProjection>>; last_seen_at: number | null; active_until: number | null }> = [];
    const seen = new Set<string>();
    const append = async (candidateId: typeof userId, expectedMembershipId?: string, expectedPresenceId?: string) => {
      if (seen.has(String(candidateId))) return;
      const authorization = await resolveCommunityPresenceAuthorization({ ctx, community, userId: candidateId });
      if (!authorization.authorized || (expectedMembershipId && String(authorization.membership?._id) !== expectedMembershipId)) return;
      const candidate = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: candidateId });
      if (!(await getCommunityChannelCapabilities({ ctx, channel, actor: candidate })).canRead) return;
      const presence = await ctx.db.query("communityPresence")
        .withIndex("by_community_user", q => q.eq("communityId", args.communityId).eq("userId", candidateId)).first();
      if (phase === "members" ? Boolean(presence) : String(presence?._id) !== expectedPresenceId) return;
      seen.add(String(candidateId));
      page.push({ user_id: (await resolvePublicUserId(ctx, candidateId)) ?? String(candidateId), role: candidateId === community.ownerId ? "owner" : authorization.membership!.role,
        ...(actor.isManager && candidateId !== community.ownerId && authorization.membership ? { membership_id: String(authorization.membership._id), membership_created_at: new Date(authorization.membership.createdAt).toISOString() } : {}),
        profile: await resolveUserProfileDisplayProjection(ctx, candidateId), last_seen_at: presence?.lastSeenAt ?? null, active_until: presence?.activeUntil ?? null });
    };
    let isDone: boolean;
    let continueCursor: string | null;
    if (phase === "presence") {
      const result = await ctx.db.query("communityPresence")
        .withIndex("by_community_lastSeenAt", q => q.eq("communityId", args.communityId))
        .order("desc").paginate({ cursor, numItems: size, maximumRowsRead: size * 3 });
      for (const presence of result.page) await append(presence.userId, undefined, String(presence._id));
      isDone = false;
      continueCursor = prefix + JSON.stringify(result.isDone
        ? { phase: "members", cursor: null } : { phase, cursor: result.continueCursor });
    } else {
      const result = await ctx.db.query("communityMemberships")
        .withIndex("by_community_createdAt", q => q.eq("communityId", args.communityId))
        .order("asc").paginate({ cursor, numItems: cursor === null ? size - 1 : size, maximumRowsRead: size * 3 });
      if (cursor === null) await append(community.ownerId);
      for (const member of result.page) {
        if (member.userId !== community.ownerId && communityMembershipRowIsActive(member)) await append(member.userId, String(member._id));
      }
      isDone = result.isDone;
      continueCursor = result.isDone ? null : prefix + JSON.stringify({ phase, cursor: result.continueCursor });
    }
    const agent = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId, kind: "community_agent" });
    const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor: agent });
    return { page, isDone, continueCursor,
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
    // A seat their plan gives can't be taken away here: it follows the plan.
    if (!args.active && args.target.kind === "member") {
      const seat = (await ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", q => q.eq("channelId", args.channelId).eq("principalKey", `user:${(args.target as any).userId}`)).take(1))[0];
      if (seatReasons(seat as any).includes("plan")) throw new Error("community_pod_seat_from_plan");
    }
    const result = await setChannelParticipantCore(ctx, { ...args, createdByUserId: manager.userId });
    // Off a paid pod: stop their billing for it now.
    if (!args.active && args.target.kind === "member" && result.changed) {
      await schedulePodBillingCheck(ctx, { channelId: args.channelId, userId: args.target.userId });
    }
    return result;
  },
});

export type PodSeatReason = "host" | "paid" | "plan";

/** Why a seat is open; none when it is closed. An open seat from before reasons is the host's. */
export function seatReasons(row: { status?: string; reasons?: PodSeatReason[] } | null | undefined): PodSeatReason[] {
  if (!row || row.status !== "active") return [];
  return row.reasons?.length ? [...row.reasons] : ["host"];
}

/** Caller must establish manager authority; grants retain activation lineage.
 * A member's seat is open while any reason holds. Opening adds `reason` (the
 * host's unless said); closing removes `reason`, or without one the host's and
 * the paid one: the seat a plan gives stays until the plan's sync removes it. */
export async function setChannelParticipantCore(ctx: any, args: {
  communityId: any; channelId: any; createdByUserId: any; active: boolean;
  target: { kind: "member"; userId: any } | { kind: "community_agent" };
  reason?: PodSeatReason;
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
    const previous = existing[0];
    const sameBinding = Boolean(previous) &&
      normalizeIdValue(previous.membershipId) === normalizeIdValue((binding as any).membershipId) &&
      previous.membershipActivationSequence === (binding as any).membershipActivationSequence;
    if (args.target.kind === "community_agent") {
      const status = args.active ? "active" as const : "revoked" as const;
      if (!args.active && !previous) return { changed: false };
      if (previous?.status === status && (!args.active || sameBinding)) return { changed: false };
      const now = Date.now();
      if (previous) await ctx.db.patch(previous._id, { status, ...binding, updatedAt: now });
      else await ctx.db.insert("communityChannelParticipants", { communityId: args.communityId, channelId: args.channelId,
        principalKey, status, ...binding, createdByUserId: args.createdByUserId, createdAt: now, updatedAt: now });
      return { changed: true };
    }
    // A seat from an earlier membership (they left and came back) carries no reasons into this one.
    const before = args.active && previous && !sameBinding ? [] : seatReasons(previous);
    const reasons: PodSeatReason[] = args.active
      ? [...new Set([...before, args.reason ?? "host"])] as PodSeatReason[]
      : before.filter((reason) => (args.reason ? reason !== args.reason : reason === "plan"));
    const status = reasons.length ? "active" as const : "revoked" as const;
    if (!previous && status === "revoked") return { changed: false };
    const sameReasons = before.length === reasons.length && before.every((reason) => reasons.includes(reason));
    if (previous && previous.status === status && sameReasons && (status === "revoked" || !args.active || sameBinding)
      && (status === "revoked" || previous.reasons?.length)) return { changed: false };
    const now = Date.now();
    const fields = { status, reasons: status === "active" ? reasons : [], ...(args.active ? binding : {}), updatedAt: now };
    if (previous) await ctx.db.patch(previous._id, fields);
    else await ctx.db.insert("communityChannelParticipants", { communityId: args.communityId, channelId: args.channelId,
      principalKey, ...fields, ...binding, createdByUserId: args.createdByUserId, createdAt: now });
    // A pod grant is part of a member's access (pod:<slug>) for connected apps.
    if (args.target.kind === "member") await notifyConnectedApps(ctx, args.communityId, args.target.userId);
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
