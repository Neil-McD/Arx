import { notifyConnectedApps } from "./connectedAppNotify";
// Tiers and grants (one door, docs/specs/builder-modalities-v0.md, slice 1).
// A membership holds one tier at a time; a tier gives grants, the names a
// connected app reads (for Distribution Engineer: de:connect, de:setter,
// de:cris). Apps never read prices. The base membership is the tier
// "member": its price is the one Settings edits; it gets a communityTiers row
// only once the builder names it or gives it grants. Every other tier's price
// is a communityPricePoints row carrying the tier's key, so a new amount is a
// new price and members keep the one they joined at.
//
// Grants are worked out when asked, from the membership's own price and its
// pods, never stored apart, so they can't drift from billing.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, requireCommunityManager, resolveCommunityLens } from "./communityCore";

export const BASE_TIER_KEY = "member";
const TIERS_MAX = 10;
const GRANTS_MAX = 10;
const NAME_MAX = 40;
const PRICE_MIN = 100;
const PRICE_MAX = 1_000_000;
// Grants the community gives itself: every member holds "community", and a
// pod's members "pod:<slug>". Builders name the rest.
const GRANT_PATTERN = /^[a-z0-9][a-z0-9:_.-]{0,39}$/;

export function normalizeTierGrants(raw: string[]): string[] {
  const grants: string[] = [];
  for (const value of raw) {
    const grant = String(value ?? "").trim().toLowerCase();
    if (!grant) continue;
    if (!GRANT_PATTERN.test(grant) || grant === "community" || grant.startsWith("pod:")) throw new Error("community_tier_grant_invalid");
    if (!grants.includes(grant)) grants.push(grant);
  }
  if (grants.length > GRANTS_MAX) throw new Error("community_tier_grant_invalid");
  return grants;
}

function tierKeyFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "tier";
}

// Every tier the community has had, stopped ones too: keys stay unique for
// good, and a plan is never dropped from the list. A community has few, so
// all are read (the live limit is TIERS_MAX).
async function tierRows(ctx: any, communityId: any) {
  return await ctx.db.query("communityTiers")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId)).collect();
}

async function currentTierPrice(ctx: any, communityId: any, tierKey: string) {
  const rows = await ctx.db.query("communityPricePoints")
    .withIndex("by_community_billingPeriod", (q: any) => q.eq("communityId", communityId).eq("billingPeriod", "monthly")).collect();
  return rows
    .filter((row: any) => row.isCurrent && !row.archivedAt && (tierKey === BASE_TIER_KEY ? !row.tierKey : row.tierKey === tierKey))
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function manager(ctx: any, args: { authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return { userId, community };
}

// The builder's view: every tier, its current monthly price and grants, and
// how many members hold it.
export const listCommunityTiers = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const rows = await tierRows(ctx, args.communityId);
    const base = rows.find((row: any) => row.key === BASE_TIER_KEY);
    const memberships = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(5000);
    const priceTier = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const membership of memberships) {
      if (!communityMembershipRowIsActive(membership)) continue;
      let key = BASE_TIER_KEY;
      if (membership.pricePointId) {
        const id = String(membership.pricePointId);
        if (!priceTier.has(id)) priceTier.set(id, ((await ctx.db.get(membership.pricePointId)) as any)?.tierKey ?? BASE_TIER_KEY);
        key = priceTier.get(id)!;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const tiers = [];
    const all = [
      { key: BASE_TIER_KEY, name: base?.name ?? "Membership", rank: 0, grants: base?.grants ?? [], archivedAt: undefined },
      ...rows.filter((row: any) => row.key !== BASE_TIER_KEY).sort((a: any, b: any) => a.rank - b.rank),
    ];
    for (const tier of all) {
      const price = await currentTierPrice(ctx, args.communityId, tier.key);
      tiers.push({
        key: tier.key, name: tier.name, rank: tier.rank, grants: tier.grants,
        base: tier.key === BASE_TIER_KEY, archived: Boolean(tier.archivedAt),
        monthly_amount_base_units: price ? price.amountBaseUnits : null,
        currency: price ? price.currency : "usd",
        members: counts.get(tier.key) ?? 0,
      });
    }
    return { tiers };
  },
});

// Add a tier, or change one (key): its name, grants, and (not the base
// membership's, which Settings sets) its monthly price.
export const saveCommunityTier = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    key: v.optional(v.string()),
    name: v.string(),
    grants: v.array(v.string()),
    monthlyAmountBaseUnits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { community } = await manager(ctx, args);
    const name = args.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (!name) throw new Error("community_tier_name_required");
    const grants = normalizeTierGrants(args.grants);
    const nowMs = Date.now();
    const rows = await tierRows(ctx, args.communityId);
    let key = args.key ?? null;
    let row = key ? rows.find((tier: any) => tier.key === key) ?? null : null;
    if (key && key !== BASE_TIER_KEY && !row) throw new Error("community_tier_not_found");
    if (!key) {
      if (rows.filter((tier: any) => tier.key !== BASE_TIER_KEY && !tier.archivedAt).length >= TIERS_MAX) throw new Error("community_tiers_full");
      const base = tierKeyFor(name);
      const taken = new Set([BASE_TIER_KEY, ...rows.map((tier: any) => tier.key)]);
      key = base;
      for (let n = 2; taken.has(key); n++) key = `${base.slice(0, 28)}-${n}`;
    }
    const grantsChanged = JSON.stringify(row?.grants ?? []) !== JSON.stringify(grants);
    if (row) await ctx.db.patch(row._id, { name, grants, updatedAt: nowMs });
    else {
      const rank = key === BASE_TIER_KEY ? 0 : Math.max(0, ...rows.map((tier: any) => tier.rank)) + 1;
      await ctx.db.insert("communityTiers", { communityId: args.communityId, key, name, rank, grants, createdAt: nowMs, updatedAt: nowMs });
    }
    // A tier's monthly price. The base membership's is Settings' to change.
    if (key !== BASE_TIER_KEY) {
      const amount = Math.floor(Number(args.monthlyAmountBaseUnits ?? 0));
      if (amount < PRICE_MIN || amount > PRICE_MAX) throw new Error("community_tier_price_invalid");
      const current = await currentTierPrice(ctx, args.communityId, key);
      if (current && current.amountBaseUnits === amount) {
        await ctx.db.patch(current._id, { name, updatedAt: nowMs });
      } else {
        // A new amount is a new price for new joins; members keep theirs.
        if (current) await ctx.db.patch(current._id, { isCurrent: false, archivedAt: nowMs, updatedAt: nowMs });
        const base = await currentTierPrice(ctx, args.communityId, BASE_TIER_KEY);
        await ctx.db.insert("communityPricePoints", {
          communityId: args.communityId, billingPeriod: "monthly", name, amountBaseUnits: amount,
          currency: base?.currency ?? "usd", currencyDecimals: base?.currencyDecimals ?? 2,
          isCurrent: true, tierKey: key, createdAt: nowMs, updatedAt: nowMs,
        } as any);
      }
    }
    void community;
    // Grants changed: everyone holding this plan gets access.changed, so
    // connected apps re-read what they have (bounded; most communities are small).
    if (grantsChanged) {
      const holders = new Set<string>();
      const memberships = await ctx.db.query("communityMemberships")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(2000);
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
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId)).take(2000);
      for (const sale of appSales) if (sale.active && sale.userId && sale.tierKey === key) holders.add(String(sale.userId));
      for (const userId of [...holders].slice(0, 2000)) await notifyConnectedApps(ctx, args.communityId, userId as any);
    }
    return { key };
  },
});

// Stop selling a tier. Members on it keep it, its grants and their price.
export const archiveCommunityTier = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), key: v.string() },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    if (args.key === BASE_TIER_KEY) throw new Error("community_tier_base_required");
    const row = (await tierRows(ctx, args.communityId)).find((tier: any) => tier.key === args.key);
    if (!row) throw new Error("community_tier_not_found");
    const nowMs = Date.now();
    await ctx.db.patch(row._id, { archivedAt: nowMs, updatedAt: nowMs });
    const current = await currentTierPrice(ctx, args.communityId, args.key);
    if (current) await ctx.db.patch(current._id, { isCurrent: false, archivedAt: nowMs, updatedAt: nowMs });
    return null;
  },
});

// What a person has in a community, as a connected app will read it (slice 2
// serves this): in or not, their tier, and its grants plus "community" and
// "pod:<slug>" for each pod they can enter now.
export async function resolveMemberGrants(ctx: any, communityId: any, userId: any): Promise<{
  allowed: boolean; tier: { key: string; name: string } | null; grants: string[];
}> {
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId, userId });
  if (!membership || !communityMembershipRowIsActive(membership)) return { allowed: false, tier: null, grants: [] };
  // Allowed exactly when Polynet itself lets them in: the one community lens
  // (a live subscription, an active app sale, a free or comped membership;
  // never when blocked or the community is archived).
  const community = await ctx.db.get(communityId);
  if (!community || !(await resolveCommunityLens({ ctx, community, membership, userId })).entitled) {
    return { allowed: false, tier: null, grants: [] };
  }
  // Every tier this person holds: the one their Polynet price sells (if that
  // still lets them in) and each one the community's app reports selling them.
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
  const held = [];
  for (const key of tierKeys) {
    const row = await ctx.db.query("communityTiers").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key)).first();
    held.push({ key, name: row?.name ?? (key === BASE_TIER_KEY ? "Membership" : key), rank: key === BASE_TIER_KEY ? 0 : row?.rank ?? 0, grants: row?.grants ?? [] as string[] });
  }
  // The tier shown is the highest held; the grants are all of them.
  held.sort((a, b) => b.rank - a.rank);
  const tier = held[0];
  const grants = ["community"];
  for (const entry of held) for (const grant of entry.grants) if (!grants.includes(grant)) grants.push(grant);
  const sequence = Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)));
  const rooms = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_community_principal_status", (q: any) => q.eq("communityId", communityId).eq("principalKey", `user:${userId}`).eq("status", "active")).take(100);
  for (const grant of rooms) {
    if (String(grant.membershipId) !== String(membership._id) || Number(grant.membershipActivationSequence ?? 0) !== sequence) continue;
    const room = await ctx.db.get(grant.channelId) as any;
    if (room?.accessMode === "restricted" && room.status === "active" && room.slug) grants.push(`pod:${room.slug}`);
  }
  return { allowed: true, tier: { key: tier.key, name: tier.name }, grants };
}
