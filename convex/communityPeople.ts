// One person, one action, from someone's own AI (the MCP): change their role,
// remove, ban or unban them. Each runs Studio's own function in one
// transaction, so its checks apply (managers only; only the owner touches
// admins; the owner can't be changed). Removing or banning a paying member
// would cancel their Stripe subscription, so through an AI that is refused and
// left to Studio, where a person confirms it.
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { requireCommunityManager } from "./communityCore";

const refs = { api: api as any, internal: internal as any };

// Their current membership if they have one, else their latest.
async function membershipOf(ctx: any, communityId: any, userId: any) {
  const rows = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).collect();
  return rows.find((row: any) => row.active === true) ?? rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function isPaying(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId)).collect();
  return rows.some((row: any) => String(row.providerSubscriptionId ?? "").trim() && !row.endedAt &&
    ["active", "past_due", "cancel_at_period_end"].includes(row.status));
}

export const applyPersonActionForTrustedUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    action: v.union(v.literal("set_role"), v.literal("remove"), v.literal("ban"), v.literal("unban")),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = { userId: args.userId, authSubject: args.authSubject, communityId: args.communityId };
    if (args.action === "unban") {
      await ctx.runMutation(refs.api.communityAdmin.unbanCommunityUser, { ...actor, targetUserId: args.targetUserId });
      return { unbanned: true };
    }
    const membership = await membershipOf(ctx, args.communityId, args.targetUserId);
    if (args.action === "set_role") {
      if (!membership || membership.active !== true) throw new Error("community_member_not_found");
      await ctx.runMutation(refs.api.communityAdmin.setCommunityMemberRole, {
        ...actor, targetMembershipId: membership._id, role: args.role ?? "member" });
      return { role: args.role ?? "member" };
    }
    // Remove or ban someone who is or was a member. Someone already gone is
    // still gone; a ban still bans them.
    if (!membership) throw new Error("community_member_not_found");
    if (membership.active === true) {
      if (await isPaying(ctx, membership._id)) throw new Error("paid_member_use_studio");
      await ctx.runMutation(refs.internal.communityAdmin.revokeCommunityMemberInternal, {
        ...actor, targetMembershipId: membership._id, revokedReason: args.action === "ban" ? "banned_by_manager" : "removed_by_manager",
      });
    } else if (args.action === "remove") {
      return { removed: true, already_gone: true };
    }
    if (args.action === "ban") {
      await ctx.runMutation(refs.internal.communityAdmin.blockCommunityUserInternal, {
        ...actor, targetUserId: args.targetUserId, ...(args.reason ? { reason: args.reason } : {}) });
      return { banned: true };
    }
    return { removed: true };
  },
});
