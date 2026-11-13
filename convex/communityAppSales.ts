// One door, slice 2b (docs/specs/builder-modalities-v0.md): a builder's app
// reports the sales it makes through its own checkout. "This email bought
// Setter" or "it ended". Polynet records a grant the app owns
// (communityAppGrants), lets a verified account with that email into the
// community, and charges nothing: the commission follows the checkout.
//
// Access is the union of every basis (communityCore.hasActiveAppGrant is read
// by the lens): a free or comped membership, a live Polynet subscription, or
// an active app sale. Ending one never ends access another still gives.
// Someone who left or was removed is not put back by an app sale; a blocked
// person never is.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  communityMembershipState,
  getUniqueCommunityMembershipByPair,
  normalizeCommunitySubscriptionStatus,
  communitySubscriptionStatusGrantsAccess,
} from "./communityCore";
import { activateCommunityMembershipCore, endedCommunityMembershipFields } from "./communityMembershipLifecycle";
import { memberAccessChanged } from "./communityPlanPods";
import { schedulePodBillingCheck } from "./communityPodBillingCheck";
import { adjustCommunityActiveMemberCountForMembershipTransition } from "./communityCore";

const EXTERNAL_REF_MAX = 120;

// The one account with this email, if its email is verified (as checkout's own lookup).
async function verifiedUserIdForEmail(ctx: any, email: string): Promise<any | null> {
  const users = await ctx.db.query("users").withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", email)).take(2);
  return users.length === 1 && typeof users[0].emailVerifiedAt === "number" ? users[0]._id : null;
}

async function activeAppGrants(ctx: any, communityId: any, userId: any) {
  return (await ctx.db.query("communityAppGrants")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).collect())
    .filter((row: any) => row.active);
}

async function blocked(ctx: any, communityId: any, userId: any): Promise<boolean> {
  const rows = await ctx.db.query("communityBlocks").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(500);
  return rows.some((row: any) => String(row.userId) === String(userId) && !row.liftedAt);
}

// Does anything other than an app sale still let this member in?
async function otherBasis(ctx: any, community: any, membership: any): Promise<boolean> {
  const source = String(membership.accessSource ?? "");
  if (source === "" || source === "free_grant" || source === "manual_grant") return true;
  if (String(community.entryPolicy ?? "") !== "paid_subscription" && source !== "app_grant") return true;
  if (source !== "paid_subscription") return false;
  const subscriptions = await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).collect();
  return subscriptions.some((row: any) => communitySubscriptionStatusGrantsAccess(normalizeCommunitySubscriptionStatus(row.status)));
}

export type AppSaleOutcome = "in" | "waiting_for_account" | "kept_out" | "ended" | "kept_by_other_access";

// Make the membership match the app sales now on record for this person.
export async function applyAppGrants(ctx: any, communityId: any, userId: any, nowMs: number): Promise<AppSaleOutcome> {
  const community = await ctx.db.get(communityId) as any;
  if (!community) return "kept_out";
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId, userId });
  const active = await activeAppGrants(ctx, communityId, userId);
  if (active.length) {
    if (membership && communityMembershipRowIsActive(membership)) {
      // Already in: their tier may have changed.
      await memberAccessChanged(ctx, communityId, userId);
      return "in";
    }
    const state = membership ? communityMembershipState(membership) : null;
    // Left or removed by choice, on hold over a payment, or blocked: not put back.
    if ((state && state !== "lapsed") || await blocked(ctx, communityId, userId) || String(community.ownerId) === String(userId)) return "kept_out";
    await activateCommunityMembershipCore({ ctx, communityId, userId, accessSource: "app_grant" as any, activationReason: "connected_app_sale", nowMs });
    return "in";
  }
  if (!membership || !communityMembershipRowIsActive(membership)) return "ended";
  if (await otherBasis(ctx, community, membership)) {
    await memberAccessChanged(ctx, communityId, userId);
    return "kept_by_other_access";
  }
  const ending = endedCommunityMembershipFields({ membership, to: "lapsed", reason: "connected_app_sale_ended", nowMs });
  await ctx.db.patch(membership._id, ending);
  await adjustCommunityActiveMemberCountForMembershipTransition({ ctx, communityId, before: membership, after: { ...membership, ...ending } });
  await schedulePodBillingCheck(ctx, { communityId, userId });
  await memberAccessChanged(ctx, communityId, userId);
  return "ended";
}

// The app's report: one row per app and email, its latest word.
export const recordAppSaleInternal = internalMutation({
  args: {
    appId: v.string(),
    communityId: v.id("communities"),
    email: v.string(),
    active: v.boolean(),
    tierKey: v.optional(v.string()),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ outcome: AppSaleOutcome }> => {
    const email = args.email.trim().toLowerCase();
    if (!email || email.length > 320 || !email.includes("@")) throw new Error("email_required");
    const tierKey = args.tierKey ? args.tierKey.trim().toLowerCase() : "member";
    if (tierKey !== "member") {
      const tier = await ctx.db.query("communityTiers")
        .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", tierKey)).first();
      if (!tier) throw new Error("community_tier_not_found");
    }
    const externalRef = args.externalRef ? args.externalRef.trim().slice(0, EXTERNAL_REF_MAX) : undefined;
    const nowMs = Date.now();
    const userId = await verifiedUserIdForEmail(ctx, email);
    const existing = await ctx.db.query("communityAppGrants")
      .withIndex("by_app_email", (q: any) => q.eq("appId", args.appId).eq("email", email)).first();
    const fields = { active: args.active, tierKey, ...(externalRef ? { externalRef } : {}), ...(userId ? { userId } : {}), updatedAt: nowMs };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("communityAppGrants", { appId: args.appId, communityId: args.communityId, email, createdAt: nowMs, ...fields } as any);
    if (!userId) return { outcome: args.active ? "waiting_for_account" : "ended" };
    return { outcome: await applyAppGrants(ctx, args.communityId, userId, nowMs) };
  },
});

// Signing in with a verified email collects every app sale made to it.
export async function attachAppGrantsForVerifiedEmail(ctx: any, userId: any, email: unknown, nowMs: number): Promise<number> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return 0;
  const rows = await ctx.db.query("communityAppGrants").withIndex("by_email", (q: any) => q.eq("email", normalized)).take(20);
  const communities = new Set<string>();
  for (const row of rows) {
    if (row.userId && String(row.userId) === String(userId)) continue;
    await ctx.db.patch(row._id, { userId, updatedAt: nowMs });
    communities.add(String(row.communityId));
  }
  for (const communityId of communities) {
    const row = rows.find((grant: any) => String(grant.communityId) === communityId);
    await applyAppGrants(ctx, row.communityId, userId, nowMs);
  }
  return communities.size;
}
