import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { requireCommunityChatAccess } from "./communityCore";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();
const PERIOD_END = NOW + 20 * 24 * 60 * 60 * 1000;

// A paid community with one paying member and one free member.
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const payerId = await user("payer");
    const freeId = await user("free");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "paid-club", name: "Paid club", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW,
    } as any);
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 500, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_paid", providerPriceId: "price_paid", createdAt: NOW, updatedAt: NOW,
    } as any);
    const membership = (userId: any, accessSource: string) => ctx.db.insert("communityMemberships", {
      communityId, userId, role: "member", accessSource, ...(accessSource === "paid_subscription" ? { pricePointId } : {}),
      active: true, activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    const payerMembershipId = await membership(payerId, "paid_subscription");
    await membership(freeId, "manual_grant");
    await ctx.db.insert("communitySubscriptions", {
      communityId, userId: payerId, membershipId: payerMembershipId, pricePointId, source: "stripe", status: "active",
      providerSubscriptionId: "sub_payer", providerAccountId: "acct_paid", currentPeriodStartAt: NOW, currentPeriodEndAt: PERIOD_END,
      cancelAtPeriodEnd: false, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { communityId, payerId, freeId };
  });
  const canChat = (userId: any) => t.run(async (ctx) =>
    requireCommunityChatAccess({ ctx, communityId: ids.communityId, userId }).then(() => true, () => false));
  return { t, ids, canChat };
}

test("a paying member who leaves keeps access until the paid period ends; Stripe is told to stop renewing", async () => {
  const { t, ids, canChat } = await fixture();
  const left = await t.withIdentity({ subject: "payer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  expect(left).toMatchObject({ ok: true, access_until: new Date(PERIOD_END).toISOString() });
  expect(await canChat(ids.payerId)).toBe(true);
  const subscription = await t.run((ctx) => ctx.db.query("communitySubscriptions").first());
  expect(subscription).toMatchObject({ status: "cancel_at_period_end", cancelAtPeriodEnd: true });
  // Stripe is told not to renew (scheduled right away), for exactly this subscription.
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled.map((job: any) => [job.name, job.args[0]])).toEqual([
    ["communityAdmin:cancelCommunitySubscriptionsAtPeriodEndInternal", { targets: [{ providerSubscriptionId: "sub_payer", providerAccountId: "acct_paid" }] }],
  ]);
  // Leaving again changes nothing more.
  await t.withIdentity({ subject: "payer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  expect(await canChat(ids.payerId)).toBe(true);
});

test("when the paid period ends, Stripe's notice ends the member's access", async () => {
  const { t, ids, canChat } = await fixture();
  await t.withIdentity({ subject: "payer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  await t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
    communityId: ids.communityId, userId: ids.payerId, source: "stripe", status: "canceled",
    providerAccountId: "acct_paid", providerSubscriptionId: "sub_payer",
  });
  expect(await canChat(ids.payerId)).toBe(false);
});

test("a member who doesn't pay leaves straight away", async () => {
  const { t, ids, canChat } = await fixture();
  const left = await t.withIdentity({ subject: "free-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  expect(left).toEqual({ ok: true });
  expect(await canChat(ids.freeId)).toBe(false);
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
});

test("a failed Stripe call is retried with growing gaps, then reported once out of retries", async () => {
  const { t } = await fixture();
  // No Stripe key in tests: every call fails, as an outage would.
  const targets = [{ providerSubscriptionId: "sub_payer", providerAccountId: "acct_paid" }];
  expect(await t.action(internal.communityAdmin.cancelCommunitySubscriptionsAtPeriodEndInternal, { targets })).toMatchObject({ ok: false, retrying: true });
  const queued = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const retry = queued[queued.length - 1] as any;
  expect([retry.name, retry.args[0]]).toEqual(["communityAdmin:cancelCommunitySubscriptionsAtPeriodEndInternal", { targets, attempt: 1 }]);
  expect(await t.action(internal.communityAdmin.cancelCommunitySubscriptionsAtPeriodEndInternal, { targets, attempt: 6 })).toEqual({ ok: false });
});

test("a renewal Stripe reports after the member left is re-cancelled, not reopened", async () => {
  const { t, ids, canChat } = await fixture();
  await t.withIdentity({ subject: "payer-subject" }).mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  const before = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).length;
  await t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
    communityId: ids.communityId, userId: ids.payerId, source: "stripe", status: "active", cancelAtPeriodEnd: false,
    providerAccountId: "acct_paid", providerSubscriptionId: "sub_payer",
  });
  expect(await t.run((ctx) => ctx.db.query("communitySubscriptions").first())).toMatchObject({ status: "cancel_at_period_end", cancelAtPeriodEnd: true });
  expect(await canChat(ids.payerId)).toBe(true);
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(jobs.length).toBe(before + 1);
  expect((jobs[jobs.length - 1] as any).args[0]).toEqual({ targets: [{ providerSubscriptionId: "sub_payer", providerAccountId: "acct_paid" }] });
});
