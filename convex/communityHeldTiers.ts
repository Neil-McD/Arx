// The plans a member holds now (one door, docs/specs/builder-modalities-v0.md):
// the one their Polynet price sells, while it still lets them in, and each one
// the community's app reports selling them. Read by the grants a connected app
// sees (communityTiers.resolveMemberGrants) and by the pods plans include
// (communityPlanPods.ts), so the two can't disagree.
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, resolveCommunityLens } from "./communityCore";

export const BASE_TIER_KEY = "member";

export type HeldTier = { key: string; name: string; rank: number; grants: string[]; podChannelIds: any[] };

/** Null when they are not in now (no active membership, not entitled, blocked, archived community). */
export async function heldTiers(ctx: any, communityId: any, userId: any): Promise<{ membership: any; tiers: HeldTier[] } | null> {
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId, userId });
  if (!membership || !communityMembershipRowIsActive(membership)) return null;
  // Allowed exactly when Polynet itself lets them in: the one community lens.
  const community = await ctx.db.get(communityId);
  if (!community || !(await resolveCommunityLens({ ctx, community, membership, userId })).entitled) return null;
  const tierKeys = new Set<string>();
  const subscriptions = membership.accessSource === "paid_subscription"
    ? await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).collect()
    : [];
  const polynetPays = membership.accessSource !== "paid_subscription" || subscriptions.some((row: any) => ["active", "past_due", "cancel_at_period_end"].includes(row.status));
  if (membership.accessSource !== "app_grant" && polynetPays) {
    const price = membership.pricePointId ? await ctx.db.get(membership.pricePointId) as any : null;
    tierKeys.add(price?.tierKey ?? BASE_TIER_KEY);
  }
  const appSales = (await ctx.db.query("communityAppGrants")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(20)).filter((row: any) => row.active);
  for (const sale of appSales) tierKeys.add(sale.tierKey ?? BASE_TIER_KEY);
  if (!tierKeys.size) tierKeys.add(BASE_TIER_KEY);
  const tiers: HeldTier[] = [];
  for (const key of tierKeys) {
    const row = await ctx.db.query("communityTiers").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key)).first();
    tiers.push({
      key, name: row?.name ?? (key === BASE_TIER_KEY ? "Membership" : key), rank: key === BASE_TIER_KEY ? 0 : row?.rank ?? 0,
      grants: row?.grants ?? [], podChannelIds: row?.podChannelIds ?? [],
    });
  }
  return { membership, tiers };
}

/** Everyone holding a plan now, by its key (Polynet's price or the app's sale). Bounded: most communities are small. */
export async function tierHolderIds(ctx: any, communityId: any, key: string): Promise<string[]> {
  const holders = new Set<string>();
  const memberships = await ctx.db.query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(2000);
  const priceTier = new Map<string, string>();
  for (const membership of memberships) {
    if (!communityMembershipRowIsActive(membership) || membership.accessSource === "app_grant") continue;
    let held = BASE_TIER_KEY;
    if (membership.pricePointId) {
      const id = String(membership.pricePointId);
      if (!priceTier.has(id)) priceTier.set(id, ((await ctx.db.get(membership.pricePointId)) as any)?.tierKey ?? BASE_TIER_KEY);
      held = priceTier.get(id)!;
    }
    if (held === key) holders.add(String(membership.userId));
  }
  const appSales = await ctx.db.query("communityAppGrants")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId)).take(2000);
  for (const sale of appSales) if (sale.active && sale.userId && (sale.tierKey ?? BASE_TIER_KEY) === key) holders.add(String(sale.userId));
  return [...holders].slice(0, 2000);
}
