// One person, one action, from someone's own AI (the MCP): change their role,
// remove, ban or unban them. Each runs Studio's own function in one
// transaction, so its checks apply (managers only; only the owner touches
// admins; the owner can't be changed). Removing or banning a paying member
// would cancel their Stripe subscription, so through an AI that is refused and
// left to Studio, where a person confirms it.
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, requireCommunityManager } from "./communityCore";

const refs: { api: any; internal: any } = { api, internal };

// Their current membership if they have one, else their latest.
async function membershipOf(ctx: any, communityId: any, userId: any) {
  const rows = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).collect();
  return rows.find((row: any) => communityMembershipRowIsActive(row)) ?? rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export const applyPersonActionForTrustedUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    // Changing a role and lifting a ban take nothing from anyone, so an AI may
    // do them. Removing and banning are a person's click in the app
    // (docs/specs/agent-access-v0.md) and are not here.
    action: v.union(v.literal("set_role"), v.literal("unban")),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = { userId: args.userId, authSubject: args.authSubject, communityId: args.communityId };
    if (args.action === "unban") {
      await ctx.runMutation(refs.api.communityAdmin.unbanCommunityUser, { ...actor, targetUserId: args.targetUserId });
      return { unbanned: true };
    }
    const membership = await membershipOf(ctx, args.communityId, args.targetUserId);
    if (!membership || !communityMembershipRowIsActive(membership)) throw new Error("community_member_not_found");
    await ctx.runMutation(refs.api.communityAdmin.setCommunityMemberRole, {
      ...actor, targetMembershipId: membership._id, role: args.role ?? "member" });
    return { role: args.role ?? "member" };
  },
});

// Where a person's record is in the app's Members page (/members/<key>), for
// an owner or admin: the membership's id, "owner" for the owner, or null when
// they aren't a member. An AI is handed this address instead of removing or
// banning someone itself.
export const memberRecordKeyInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), targetUserId: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const targetUserId = ctx.db.normalizeId("users", args.targetUserId);
    if (!targetUserId) return null;
    if (String((community as any).ownerId) === String(targetUserId)) return "owner";
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: targetUserId });
    return membership && communityMembershipRowIsActive(membership as any) ? String((membership as any)._id) : null;
  },
});

// One person in a selection, with their own receipt, all in one transaction:
// the receipt is reserved, the change made and the receipt completed together,
// so a retried selection replays what was done for them instead of doing it
// again.
export const applyMemberSelectionItemInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
    communityId: v.id("communities"),
    itemKey: v.string(),
    requestFingerprint: v.string(),
    targetUserId: v.id("users"),
    action: v.union(v.literal("set_role"), v.literal("unban")),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const receipt = { communityId: args.communityId, userId: args.userId, principalKind: "external_mcp", toolName: "polynet_call",
      idempotencyKey: args.itemKey, requestFingerprint: args.requestFingerprint };
    const reservation: any = await ctx.runMutation(refs.internal.polynetCanonicalReceipts.reserveCanonicalOperationReceiptInternal, receipt);
    if (!reservation.ok) throw new Error(String(reservation.code ?? "member_action_refused"));
    if (reservation.status === "completed") return { ...(reservation.result ?? {}), deduped: true };
    const scope = { userId: args.userId, communityId: args.communityId };
    const result: Record<string, unknown> = await ctx.runMutation(refs.internal.communityPeople.applyPersonActionForTrustedUserInternal, {
        ...scope, authSubject: args.authSubject, targetUserId: args.targetUserId, action: args.action,
        ...(args.role ? { role: args.role } : {}) });
    await ctx.runMutation(refs.internal.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal,
      { ...receipt, attemptToken: reservation.attemptToken, result });
    return result;
  },
});
