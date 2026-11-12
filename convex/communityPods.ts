// Pods (docs/specs/pods-v0.md, slice 1). A pod is an invite-only room
// (communityChannels, restricted) with its purpose in communityPods. Who may
// see a pod is the room's own access check: builders and admins see every
// pod; a member sees the pods they were added to. Nothing about a pod is
// read by anyone else.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannelPage } from "./communityChannelCore";
import { normalizeIdValue, requireCommunityManager } from "./communityCore";

const PODS_CAP = 50;
const MEMBERS_CAP = 200;
const PURPOSE_MAX = 280;

export const listCommunityPods = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // "View as a member": a builder sees only the pods they are in.
    asMember: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const canManage = actor.isManager && !args.asMember;
    const { page } = await listAuthorizedCommunityChannelPage({
      ctx, communityId: args.communityId, actor, section: "private", paginationOpts: { cursor: null, numItems: PODS_CAP },
    });
    const pods = [];
    for (const channel of page as any[]) {
      const grants = (await ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id)).take(MEMBERS_CAP))
        .filter((row: any) => row.status === "active");
      const isMember = grants.some((row: any) => row.principalKey === actor.principalKey);
      if (!canManage && !isMember) continue;
      const record = await ctx.db.query("communityPods")
        .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId).eq("channelId", channel._id)).first();
      const latest = await ctx.db.query("communityInteractionRoots")
        .withIndex("by_channel_updatedAt", (q: any) => q.eq("channelId", channel._id)).order("desc").first();
      pods.push({
        channel_id: normalizeIdValue(channel._id),
        slug: String(channel.slug ?? ""),
        name: String(channel.name ?? ""),
        purpose: record?.purpose ?? "",
        members: grants.filter((row: any) => String(row.principalKey).startsWith("user:")).length,
        last_active_at: latest ? new Date(Number(latest.updatedAt ?? latest.createdAt)).toISOString() : null,
        is_member: isMember,
      });
    }
    return { can_manage: canManage, pods };
  },
});

// What the pod is for, in a sentence. Builders and admins only.
export const savePodPurpose = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), purpose: v.string() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const channel = await ctx.db.get(args.channelId);
    if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(args.communityId) || channel.accessMode !== "restricted" || channel.status !== "active") {
      throw new Error("community_pod_not_found");
    }
    const purpose = args.purpose.replace(/\s+/g, " ").trim().slice(0, PURPOSE_MAX);
    const nowMs = Date.now();
    const existing = await ctx.db.query("communityPods")
      .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId).eq("channelId", args.channelId)).first();
    if (existing) await ctx.db.patch(existing._id, { purpose, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose, createdAt: nowMs, updatedAt: nowMs });
    return null;
  },
});
