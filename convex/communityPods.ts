// Pods (docs/specs/pods-v0.md, slices 1 and 2a). A pod is an invite-only room
// (communityChannels, restricted) plus communityPods: what it is for, listed
// or hidden, seats, and its hosts. Who may see inside a pod is the room's own
// access check. A listed pod shows members who aren't in it only its outside:
// what it is for, its hosts and seats left, never who is in it or what is said.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannelPage } from "./communityChannelCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { normalizeIdValue, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { displayName } from "./communityFounderBrief";

const PODS_CAP = 50;
const MEMBERS_CAP = 200;
const REQUESTS_CAP = 100;
const PURPOSE_MAX = 280;
const SEATS_MAX = 500;

type Ctx = any;

async function viewerOf(ctx: Ctx, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  return { userId, actor };
}

async function podRecord(ctx: Ctx, communityId: any, channelId: any) {
  return await ctx.db.query("communityPods")
    .withIndex("by_community_channel", (q: any) => q.eq("communityId", communityId).eq("channelId", channelId)).first();
}

async function memberGrants(ctx: Ctx, channelId: any) {
  return (await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channelId)).take(MEMBERS_CAP))
    .filter((row: any) => row.status === "active" && String(row.principalKey).startsWith("user:"));
}

const userIdOf = (principalKey: string) => principalKey.slice("user:".length);

async function activePodRoom(ctx: Ctx, communityId: any, channelId: any) {
  const channel = await ctx.db.get(channelId);
  if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId)
    || channel.accessMode !== "restricted" || channel.status !== "active") throw new Error("community_pod_not_found");
  return channel;
}

function isHost(record: any, userId: any): boolean {
  return Boolean(record?.hostUserIds?.some((id: any) => String(id) === String(userId)));
}

// Builders and admins manage every pod; a pod's hosts manage theirs.
async function requirePodManager(ctx: Ctx, authSubject: string | undefined, communityId: any, channelId: any) {
  const { userId, actor } = await viewerOf(ctx, authSubject, communityId);
  const channel = await activePodRoom(ctx, communityId, channelId);
  const record = await podRecord(ctx, communityId, channelId);
  if (!actor.isManager && !isHost(record, userId)) throw new Error("community_pod_manager_required");
  return { userId, actor, channel, record };
}

async function hostNames(ctx: Ctx, record: any, names: Map<string, string>) {
  const list: string[] = [];
  for (const id of (record?.hostUserIds ?? []).slice(0, 5)) list.push(await displayName(ctx, id, names));
  return list;
}

export const listCommunityPods = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // "View as a member": a builder sees only the pods they are in, and the
    // listed ones from outside.
    asMember: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, actor } = await viewerOf(ctx, args.authSubject, args.communityId);
    const canManage = actor.isManager && !args.asMember;
    const names = new Map<string, string>();
    const { page } = await listAuthorizedCommunityChannelPage({
      ctx, communityId: args.communityId, actor, section: "private", paginationOpts: { cursor: null, numItems: PODS_CAP },
    });
    const pods = [];
    const inside = new Set<string>();
    for (const channel of page as any[]) {
      const grants = await memberGrants(ctx, channel._id);
      const isMember = grants.some((row: any) => row.principalKey === actor.principalKey);
      const record = await podRecord(ctx, args.communityId, channel._id);
      const hosting = isHost(record, userId);
      if (!canManage && !isMember && !hosting) continue;
      inside.add(normalizeIdValue(channel._id));
      const latest = await ctx.db.query("communityInteractionRoots")
        .withIndex("by_channel_updatedAt", (q: any) => q.eq("channelId", channel._id)).order("desc").first();
      const waiting = canManage || hosting
        ? (await ctx.db.query("communityPodRequests").withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "pending")).take(REQUESTS_CAP)).length
          + (await ctx.db.query("communityPodRequests").withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "waitlist")).take(REQUESTS_CAP)).length
        : 0;
      pods.push({
        channel_id: normalizeIdValue(channel._id),
        slug: String(channel.slug ?? ""),
        name: String(channel.name ?? ""),
        purpose: record?.purpose ?? "",
        visibility: record?.visibility === "listed" ? "listed" as const : "hidden" as const,
        seats: typeof record?.seats === "number" ? record.seats : null,
        members: grants.length,
        last_active_at: latest ? new Date(Number(latest.updatedAt ?? latest.createdAt)).toISOString() : null,
        is_member: isMember,
        is_host: hosting,
        can_manage: canManage || hosting,
        waiting,
      });
    }

    // Listed pods this person isn't in, from the outside only.
    const outside = [];
    if (!canManage) {
      const records = await ctx.db.query("communityPods")
        .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId)).take(PODS_CAP);
      for (const record of records) {
        if (record.visibility !== "listed" || inside.has(normalizeIdValue(record.channelId))) continue;
        const channel = await ctx.db.get(record.channelId) as any;
        if (!channel || channel.accessMode !== "restricted" || channel.status !== "active") continue;
        const taken = typeof record.seats === "number" ? (await memberGrants(ctx, record.channelId)).length : 0;
        const request = await ctx.db.query("communityPodRequests")
          .withIndex("by_channel_user", (q: any) => q.eq("channelId", record.channelId).eq("userId", userId)).first();
        outside.push({
          channel_id: normalizeIdValue(record.channelId),
          name: String(channel.name ?? ""),
          purpose: record.purpose,
          hosts: await hostNames(ctx, record, names),
          seats_left: typeof record.seats === "number" ? Math.max(0, record.seats - taken) : null,
          my_request: request && request.status !== "approved" ? request.status : null,
        });
      }
    }
    return { can_manage: canManage, pods, outside };
  },
});

// A pod from inside: what it is for, its hosts, its members and, for those
// who manage it, the people asking to join. The room's own read check.
export const getPod = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const { userId, actor } = await viewerOf(ctx, args.authSubject, args.communityId);
    const channel = await activePodRoom(ctx, args.communityId, args.channelId);
    if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) throw new Error("community_pod_not_found");
    const record = await podRecord(ctx, args.communityId, args.channelId);
    const canManage = actor.isManager || isHost(record, userId);
    const names = new Map<string, string>();
    const members = [];
    for (const grant of await memberGrants(ctx, args.channelId)) {
      const memberId = userIdOf(String(grant.principalKey));
      members.push({ user_id: memberId, name: await displayName(ctx, memberId, names), is_host: isHost(record, memberId) });
    }
    const requests = [];
    if (canManage) {
      for (const status of ["pending", "waitlist"] as const) {
        const rows = await ctx.db.query("communityPodRequests")
          .withIndex("by_channel_status", (q: any) => q.eq("channelId", args.channelId).eq("status", status)).take(REQUESTS_CAP);
        for (const row of rows) requests.push({ user_id: normalizeIdValue(row.userId), name: await displayName(ctx, row.userId, names), status, created_at: new Date(row.createdAt).toISOString() });
      }
    }
    return {
      channel_id: normalizeIdValue(channel._id),
      name: String(channel.name ?? ""),
      purpose: record?.purpose ?? "",
      visibility: record?.visibility === "listed" ? "listed" as const : "hidden" as const,
      seats: typeof record?.seats === "number" ? record.seats : null,
      hosts: await hostNames(ctx, record, names),
      members,
      can_manage: canManage,
      can_edit: actor.isManager,
      requests,
    };
  },
});

// What the pod is for, whether it is listed, and its seats. Builders and admins.
export const savePodDetails = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    purpose: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("listed"), v.literal("hidden"))),
    // 0 or less clears the limit.
    seats: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    await activePodRoom(ctx, args.communityId, args.channelId);
    const patch: Record<string, unknown> = {};
    if (args.purpose !== undefined) patch.purpose = args.purpose.replace(/\s+/g, " ").trim().slice(0, PURPOSE_MAX);
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.seats !== undefined) patch.seats = args.seats > 0 ? Math.min(SEATS_MAX, Math.floor(args.seats)) : undefined;
    const nowMs = Date.now();
    const existing = await podRecord(ctx, args.communityId, args.channelId);
    if (existing) await ctx.db.patch(existing._id, { ...patch, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", ...patch, createdAt: nowMs, updatedAt: nowMs } as any);
    return null;
  },
});

// Make a member a host of this pod (added to the pod if they aren't in it), or
// stop. Builders and admins.
export const setPodHost = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.id("users"), host: v.boolean() },
  handler: async (ctx, args) => {
    const managerId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: managerId });
    await activePodRoom(ctx, args.communityId, args.channelId);
    if (args.host) await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: managerId, active: true, target: { kind: "member", userId: args.userId } });
    const nowMs = Date.now();
    const existing = await podRecord(ctx, args.communityId, args.channelId);
    const current = (existing?.hostUserIds ?? []).filter((id: any) => String(id) !== String(args.userId));
    const hostUserIds = args.host ? [...current, args.userId] : current;
    if (existing) await ctx.db.patch(existing._id, { hostUserIds, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", hostUserIds, createdAt: nowMs, updatedAt: nowMs });
    return null;
  },
});

// Ask to join a listed pod; a full pod puts you on its waitlist.
export const requestToJoinPod = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    await activePodRoom(ctx, args.communityId, args.channelId);
    const record = await podRecord(ctx, args.communityId, args.channelId);
    if (record?.visibility !== "listed") throw new Error("community_pod_not_found");
    const grants = await memberGrants(ctx, args.channelId);
    if (grants.some((row: any) => row.principalKey === `user:${normalizeIdValue(userId)}`)) return { status: "member" as const };
    const status = typeof record.seats === "number" && grants.length >= record.seats ? "waitlist" as const : "pending" as const;
    const nowMs = Date.now();
    const existing = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", userId)).first();
    if (existing && (existing.status === "pending" || existing.status === "waitlist")) return { status: existing.status };
    if (existing) await ctx.db.patch(existing._id, { status, decidedByUserId: undefined, updatedAt: nowMs });
    else await ctx.db.insert("communityPodRequests", { communityId: args.communityId, channelId: args.channelId, userId, status, createdAt: nowMs, updatedAt: nowMs });
    return { status };
  },
});

// A host says yes (the person joins the pod) or no.
export const decidePodRequest = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.id("users"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const { userId: deciderId } = await requirePodManager(ctx, args.authSubject, args.communityId, args.channelId);
    const request = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).first();
    if (!request || (request.status !== "pending" && request.status !== "waitlist")) throw new Error("community_pod_request_not_found");
    if (args.approve) {
      await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: deciderId, active: true, target: { kind: "member", userId: args.userId } });
    }
    await ctx.db.patch(request._id, { status: args.approve ? "approved" : "declined", decidedByUserId: deciderId, updatedAt: Date.now() });
    return null;
  },
});
