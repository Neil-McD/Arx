import { convexTest } from "convex-test";
import { beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const stripe = vi.hoisted(() => ({ updates: [] as Array<{ id: string; params: any; options: any }>, price: "price_setter", amount: 19700, pending: false }));
vi.mock("./stripeCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stripeCore")>()),
  getStripeClient: () => ({
    subscriptions: {
      retrieve: async () => ({ id: "sub_1", items: { data: [{ id: "si_1", price: { id: stripe.price, unit_amount: stripe.amount } }] } }),
      update: async (id: string, params: any, options: any) => {
        stripe.updates.push({ id, params, options });
        return { id, ...(stripe.pending ? { pending_update: { subscription_items: params.items } } : {}) };
      },
    },
  }),
}));

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();
beforeEach(() => { stripe.updates.length = 0; stripe.price = "price_setter"; stripe.amount = 19700; stripe.pending = false; });

// Distribution Engineer's community: Connect $47, Setter $197, CRIS $297 (with the agency pod); Ana pays Polynet for Setter.
async function setup(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx: any) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
      email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, emailVerifiedAt: NOW, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const ana = await user("ana");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "de-pilot", name: "Distribution Engineer", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    });
    const price = (name: string, amount: number, providerPriceId: string, tierKey?: string) => ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name, amountBaseUnits: amount, currency: "usd", currencyDecimals: 2, isCurrent: true,
      providerAccountId: "acct_owner", providerPriceId, ...(tierKey ? { tierKey } : {}), createdAt: NOW, updatedAt: NOW,
    });
    await price("Connect", 4700, "price_connect");
    const setter = await price("Setter", 19700, "price_setter", "setter");
    await price("CRIS", 29700, "price_cris", "cris");
    const podId = await ctx.db.insert("communityChannels", {
      communityId, slug: "agency", name: "Drop-in agency", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1,
      createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityPods", { communityId, channelId: podId, purpose: "", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "member", name: "Connect", rank: 0, grants: ["de:connect"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "setter", name: "Setter", rank: 1, grants: ["de:setter"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "cris", name: "CRIS", rank: 2, grants: ["de:cris"], podChannelIds: [podId], createdAt: NOW, updatedAt: NOW });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: ana, role: "member", accessSource: "paid_subscription", pricePointId: setter,
      state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    });
    const subscriptionId = await ctx.db.insert("communitySubscriptions", {
      communityId, userId: ana, membershipId, pricePointId: setter, source: "stripe", status: "active",
      providerSubscriptionId: "sub_1", providerAccountId: "acct_owner", currentPeriodEndAt: NOW + 86_400_000, cancelAtPeriodEnd: false, createdAt: NOW, updatedAt: NOW,
    });
    return { ownerId, ana, communityId, podId, subscriptionId };
  });
}

const asAna = (t: ReturnType<typeof convexTest>) => t.withIdentity({ subject: "ana-subject" });
const notice = async (t: ReturnType<typeof convexTest>, ids: any, providerPriceId: string) => t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
  communityId: ids.communityId, userId: ids.ana, source: "stripe", status: "active", providerAccountId: "acct_owner", providerPriceId, providerSubscriptionId: "sub_1",
  // As Stripe's notice handler sends it: the price point the subscription had.
  pricePointId: (await t.run(async (ctx: any) => (await ctx.db.get(ids.subscriptionId)).pricePointId)),
} as any);
const inPod = async (t: ReturnType<typeof convexTest>, ids: any) => (await t.run(async (ctx: any) => (await ctx.db.query("communityChannelParticipants")
  .withIndex("by_channel_principal", (q: any) => q.eq("channelId", ids.podId).eq("principalKey", `user:${ids.ana}`)).first())))?.status === "active";
const heldTier = async (t: ReturnType<typeof convexTest>, ids: any) => t.run(async (ctx: any) => {
  const membership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ids.ana));
  return ((await ctx.db.get(membership.pricePointId)) as any).tierKey ?? "member";
});

test("a member sees their plan and the others on sale", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const mine = await asAna(t).query(api.communityPlanChange.getMyCommunityPlan, { communityId: ids.communityId });
  expect(mine).toMatchObject({ member: true, can_change: true, current: { key: "setter", name: "Setter" } });
  expect(mine.plans.map((plan: any) => [plan.key, plan.name, plan.amount_base_units, plan.current, plan.includes])).toEqual([
    [null, "Connect", 4700, false, []], ["setter", "Setter", 19700, true, []], ["cris", "CRIS", 29700, false, ["Drop-in agency"]],
  ]);
});

test("moving up charges the difference now and only moves once paid; Stripe's notice moves the plan and its pod", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  expect(await asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan: "cris" })).toEqual({ status: "changing" });
  expect(stripe.updates).toHaveLength(1);
  expect(stripe.updates[0]).toMatchObject({ id: "sub_1", params: { items: [{ id: "si_1", price: "price_cris" }], proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete" }, options: { stripeAccount: "acct_owner" } });
  // Nothing changes before Stripe says so.
  expect(await heldTier(t, ids)).toBe("setter");
  expect(await inPod(t, ids)).toBe(false);
  await notice(t, ids, "price_cris");
  expect(await heldTier(t, ids)).toBe("cris");
  expect(await inPod(t, ids)).toBe(true);
  // And down again: moved now, the unused part credited; out of the pod once Stripe says so.
  stripe.price = "price_cris"; stripe.amount = 29700;
  await asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan: "setter" });
  expect(stripe.updates[1].params).toMatchObject({ items: [{ id: "si_1", price: "price_setter" }], proration_behavior: "create_prorations" });
  await notice(t, ids, "price_setter");
  expect(await heldTier(t, ids)).toBe("setter");
  expect(await inPod(t, ids)).toBe(false);
});

test("an upgrade whose payment fails stays on the old plan", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  stripe.pending = true;
  expect(await asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan: "cris" })).toEqual({ status: "payment_problem" });
  expect(await heldTier(t, ids)).toBe("setter");
});

test("only a member paying Polynet monthly, for a plan on sale they don't already hold", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const change = (plan: string | null) => asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan });
  await expect(change("setter")).rejects.toThrow(/already_on_plan/);
  await expect(change("nope")).rejects.toThrow(/plan_unavailable/);
  await expect(change("Bad!")).rejects.toThrow(/plan_unavailable/);
  // Leaving at the period's end: no plan changes.
  await t.run((ctx: any) => ctx.db.patch(ids.subscriptionId, { status: "cancel_at_period_end" }));
  await expect(change("cris")).rejects.toThrow(/plan_change_unavailable/);
  expect((await asAna(t).query(api.communityPlanChange.getMyCommunityPlan, { communityId: ids.communityId })).can_change).toBe(false);
  // Bought in the app: changed there, not here.
  await t.run(async (ctx: any) => {
    await ctx.db.patch(ids.subscriptionId, { status: "active" });
    const membership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ids.ana));
    await ctx.db.patch(membership._id, { accessSource: "app_grant" });
  });
  await expect(change("cris")).rejects.toThrow(/plan_change_unavailable/);
  expect(stripe.updates).toHaveLength(0);
});

test("up or down is judged by what Stripe bills now, and an archived community takes no changes", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  // Stripe already bills Connect (a switch not recorded here yet): Setter from there is up.
  stripe.price = "price_connect"; stripe.amount = 4700;
  await asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan: "cris" });
  expect(stripe.updates[0].params.proration_behavior).toBe("always_invoice");
  await t.run((ctx: any) => ctx.db.patch(ids.communityId, { lifecycleStatus: "archived" }));
  await expect(asAna(t).action(api.communityPlanChange.changeMyCommunityPlan, { communityId: ids.communityId, plan: null })).rejects.toThrow();
  expect(stripe.updates).toHaveLength(1);
});
