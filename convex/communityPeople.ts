// One person, one action, from someone's own AI (the MCP) or the guide:
// change their role or unban them. Each runs Studio's own function in one
// transaction, so its checks apply (managers only; only the owner touches
// admins; the owner can't be changed). Removing and banning end a paying
// member's subscription, so they are not here: after the person's yes to the
// guide, the executor runs the Members page's own actions
// (communityAdmin.removeCommunityMember, banCommunityMember).
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, requireCommunityManager } from "./communityCore";
import { setCommunityMemberRoleForUser, unbanCommunityUserForUser } from "./communityAdmin";

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
    // do them. Removing and banning run the Members page's own actions, after
    // the person's yes (docs/specs/agent-access-v0.md).
    action: v.union(v.literal("set_role"), v.literal("unban")),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    if (args.action === "unban") {
      await unbanCommunityUserForUser(ctx, { userId: args.userId, communityId: args.communityId, targetUserId: args.targetUserId });
      return { unbanned: true };
    }
    const membership = await membershipOf(ctx, args.communityId, args.targetUserId);
    if (!membership || !communityMembershipRowIsActive(membership)) throw new Error("community_member_not_found");
    await setCommunityMemberRoleForUser(ctx, {
      userId: args.userId, communityId: args.communityId, targetMembershipId: membership._id, role: args.role ?? "member" });
    return { role: args.role ?? "member" };
  },
});

// Where a person's record is in the app's Members page (/members/<key>), for
// an owner or admin: the membership's id, "owner" for the owner, or null when
// they aren't a member. A person's own AI is handed this address instead of
// removing or banning someone itself; after a yes to the guide it names the
// membership the Members page's own removal takes.
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

// People named to an AI's member action, as the refs the action takes. An
// AI knows a person by their handle (members/<handle>.json), so a handle is
// accepted as well as user:<id>. A name that is nobody at all is reported,
// never guessed at; whether a real person is a member here is each action's
// own check, answered per person.
export const resolveMemberRefsInternal = internalQuery({
  args: { communityId: v.id("communities"), actorUserId: v.id("users"), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.actorUserId });
    const ownerId = String((community as any).ownerId ?? "");
    const refs: string[] = [];
    const missing: string[] = [];
    for (const raw of args.refs.slice(0, 100)) {
      const text = String(raw ?? "").trim();
      const bare = text.replace(/^user:/, "").replace(/^@/, "");
      if (/^user:/.test(text)) {
        // Explicit user:<id> refs pass through without probing global user
        // existence; each downstream member action validates membership in this
        // community per item (supporting partial-batch responses).
        const normalized = ctx.db.normalizeId("users", bare);
        if (normalized) refs.push(`user:${String(normalized)}`);
        else missing.push(text.slice(0, 80));
        continue;
      }
      const byHandle = bare
        ? await ctx.db.query("users").withIndex("by_normalizedHandle", (q) => q.eq("normalizedHandle", bare.toLowerCase())).first()
        : null;
      const userId = byHandle?._id ?? null;
      if (!userId) {
        missing.push(text.slice(0, 80));
        continue;
      }
      // Scope handle lookups strictly to this community (owner, current/past
      // member, or blocked user here) so non-members on the platform can never
      // be probed by handle.
      const inCommunity =
        String(userId) === ownerId ||
        Boolean(await membershipOf(ctx, args.communityId, userId)) ||
        Boolean(
          await ctx.db
            .query("communityBlocks")
            .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", userId))
            .first(),
        );
      if (inCommunity) refs.push(`user:${String(userId)}`);
      else missing.push(text.slice(0, 80));
    }
    return { refs, missing };
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
    // Whose receipt this is: a person's own AI, or the guide in their private talk.
    principalKind: v.optional(v.union(v.literal("external_mcp"), v.literal("community_agent_for_member"))),
  },
  handler: async (ctx, { principalKind, ...args }): Promise<Record<string, unknown>> => {
    const receipt = { communityId: args.communityId, userId: args.userId, principalKind: principalKind ?? "external_mcp", toolName: "polynet_call",
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
