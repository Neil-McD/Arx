import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { resolveMemberGrants } from "./communityTiers";
import { listCurrentCommunitySellablePlans } from "./communityPublic";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

async function setup(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const payerId = await user("payer");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "de-pilot", name: "Distribution Engineer", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    } as any);
    const basePriceId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Distribution Engineer", amountBaseUnits: 4700, currency: "usd", currencyDecimals: 2,
      isCurrent: true, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId, stripeAccountId: "acct_de", accountType: "express", transfersEnabled: true, status: "ready",
      detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [],
      createdAt: NOW, updatedAt: NOW,
    } as any);
    return { ownerId, payerId, communityId, basePriceId };
  });
}

// One door, slice 1: a membership holds one tier; each tier gives grants;
// today's single price is the base tier and nothing about it changes.
test("tiers sit beside the base price: Settings, the doorstep and checkout keep the base; a tier sells only by name", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  // The builder names the base membership's grants and adds two tiers.
  await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, key: "member", name: "Connect", grants: ["de:connect"] });
  const setter = await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, name: "Setter", grants: ["de:connect", "DE:Setter"], monthlyAmountBaseUnits: 19700 });
  const cris = await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, name: "CRIS", grants: ["de:cris"], monthlyAmountBaseUnits: 29700 });
  expect([setter.key, cris.key]).toEqual(["setter", "cris"]);
  const listed = await asOwner.query(api.communityTiers.listCommunityTiers, { communityId: ids.communityId });
  expect(listed.tiers.map((tier: any) => [tier.key, tier.name, tier.monthly_amount_base_units, tier.grants])).toEqual([
    ["member", "Connect", 4700, ["de:connect"]],
    ["setter", "Setter", 19700, ["de:connect", "de:setter"]],
    ["cris", "CRIS", 29700, ["de:cris"]],
  ]);
  // Bad grants are refused: the community's own names are reserved.
  for (const grants of [["community"], ["pod:founders"], ["has space"]]) {
    await expect(asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, name: "Bad", grants, monthlyAmountBaseUnits: 1000 }))
      .rejects.toThrow(/community_tier_grant_invalid/);
  }
  // Only builders manage tiers.
  await expect(t.withIdentity({ subject: "payer-subject" }).query(api.communityTiers.listCommunityTiers, { communityId: ids.communityId })).rejects.toThrow();

  // The doorstep still sells the base membership only.
  const plans = await t.run((ctx) => listCurrentCommunitySellablePlans(ctx, ids.communityId));
  expect(plans.map((plan: any) => Number(plan.amount_base_units ?? plan.amountBaseUnits))).toEqual([4700]);
  // Checkout: the base price by default, a tier's by its key, nothing for an unknown tier.
  const config = (tierKey?: string) => t.query(internal.communityCommerce.resolvePublicCommunityCheckoutConfigInternal, {
    communitySlug: "de-pilot", billingPeriod: "monthly", ...(tierKey ? { tierKey } : {}),
  });
  expect(await config()).toMatchObject({ amountBaseUnits: 4700, tierName: null });
  expect(await config("setter")).toMatchObject({ amountBaseUnits: 19700, tierName: "Setter" });
  await expect(config("nope")).rejects.toThrow(/community_tier_not_found/);

  // Settings changes the base price only: the tiers' prices are untouched.
  await asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
    communityId: ids.communityId, name: "Distribution Engineer", slug: "de-pilot", monthlyAmountBaseUnits: 5700, currency: "usd", currencyDecimals: 2,
  });
  expect((await asOwner.query(api.communityTiers.listCommunityTiers, { communityId: ids.communityId })).tiers.map((tier: any) => tier.monthly_amount_base_units))
    .toEqual([5700, 19700, 29700]);
  expect(await config("cris")).toMatchObject({ amountBaseUnits: 29700 });

  // A tier's new price is for new joins; archiving stops new joins only.
  await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, key: "setter", name: "Setter", grants: ["de:setter"], monthlyAmountBaseUnits: 24700 });
  expect(await config("setter")).toMatchObject({ amountBaseUnits: 24700 });
  await asOwner.mutation(api.communityTiers.archiveCommunityTier, { communityId: ids.communityId, key: "cris" });
  await expect(config("cris")).rejects.toThrow(/community_tier_not_found/);
  // Many stopped plans later, a new one is still listed and its key unique.
  await t.run(async (ctx) => {
    for (let n = 0; n < 40; n += 1) await ctx.db.insert("communityTiers", { communityId: ids.communityId, key: `old-${n}`, name: `Old ${n}`, rank: 10 + n, grants: [], archivedAt: NOW, createdAt: NOW, updatedAt: NOW });
  });
  const again = await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, name: "Old 39", grants: [], monthlyAmountBaseUnits: 1000 });
  expect(again.key).toBe("old-39-2");
  expect((await asOwner.query(api.communityTiers.listCommunityTiers, { communityId: ids.communityId })).tiers.map((tier: any) => tier.key)).toContain("old-39-2");
});

test("a member's grants: community, their tier's, and each pod they can enter; nothing once they're out", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, name: "Setter", grants: ["de:setter"], monthlyAmountBaseUnits: 19700 });
  const grants = () => t.run((ctx) => resolveMemberGrants(ctx, ids.communityId, ids.payerId));
  expect(await grants()).toEqual({ allowed: false, tier: null, grants: [] });
  const membershipId = await t.run(async (ctx) => {
    const setterPrice = (await ctx.db.query("communityPricePoints").collect()).find((row: any) => row.tierKey === "setter")!;
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId: ids.communityId, userId: ids.payerId, role: "member", accessSource: "paid_subscription", pricePointId: setterPrice._id,
      state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    const pod = await ctx.db.insert("communityChannels", {
      communityId: ids.communityId, slug: "founders", name: "Founders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdByUserId: ids.ownerId, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityChannelParticipants", {
      communityId: ids.communityId, channelId: pod, principalKey: `user:${ids.payerId}`, membershipId, membershipActivationSequence: 1,
      status: "active", createdByUserId: ids.ownerId, createdAt: NOW, updatedAt: NOW,
    } as any);
    return membershipId;
  });
  expect(await grants()).toEqual({ allowed: true, tier: { key: "setter", name: "Setter" }, grants: ["community", "de:setter", "pod:founders"] });
  // Rejoined later (a new activation): the old pod grant no longer counts.
  await t.run((ctx) => ctx.db.patch(membershipId, { activationSequence: 2 } as any));
  expect((await grants()).grants).toEqual(["community", "de:setter"]);
  // Out of the community: nothing.
  await t.run((ctx) => ctx.db.patch(membershipId, { state: "lapsed" } as any));
  expect(await grants()).toEqual({ allowed: false, tier: null, grants: [] });
});
