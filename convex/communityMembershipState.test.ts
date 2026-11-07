/// <reference types="vite/client" />
// A membership is in one state, and only the lifecycle module moves it:
// what a payment update, a removal and the backfill may and may not do.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { communityMembershipState, requireCommunityChatAccess } from "./communityCore";
import {
  canEndCommunityMembership,
  communityMembershipStateAfterSubscriptionUpdate,
} from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const payerId = await user("payer");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "state-club", name: "State club", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    } as any);
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 500, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_state", providerPriceId: "price_state", createdAt: NOW, updatedAt: NOW,
    } as any);
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId, userId: payerId, role: "member", accessSource: "paid_subscription", pricePointId,
      state: "active", active: true, activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communitySubscriptions", {
      communityId, userId: payerId, membershipId, pricePointId, source: "stripe", status: "active",
      providerSubscriptionId: "sub_state", providerAccountId: "acct_state", currentPeriodStartAt: NOW,
      currentPeriodEndAt: NOW + 86_400_000, cancelAtPeriodEnd: false, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { ownerId, payerId, communityId, membershipId };
  });
  const sync = (status: string, extra: Record<string, unknown> = {}) =>
    t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
      communityId: ids.communityId, userId: ids.payerId, source: "stripe", status,
      providerAccountId: "acct_state", providerSubscriptionId: "sub_state", ...extra,
    });
  const membership = () => t.run((ctx) => ctx.db.get(ids.membershipId)) as Promise<any>;
  const canChat = () => t.run((ctx) =>
    requireCommunityChatAccess({ ctx, communityId: ids.communityId, userId: ids.payerId }).then(() => true, () => false));
  return { t, ids, sync, membership, canChat };
}

test("a refund puts a payer on hold; a routine update can't lift it, a new paid invoice does", async () => {
  const { sync, membership, canChat } = await fixture();
  await sync("ended", { revokedReason: "subscription_refunded" });
  expect((await membership()).state).toBe("payment_hold");
  expect(await canChat()).toBe(false);

  await sync("active", { preserveRiskRevocation: true });
  expect((await membership()).state).toBe("payment_hold");
  expect(await canChat()).toBe(false);

  await sync("active");
  expect(await membership()).toMatchObject({ state: "active", active: true, activationSequence: 2 });
  expect(await canChat()).toBe(true);
});

test("a lapsed payer comes back when the subscription grants access again", async () => {
  const { sync, membership, canChat } = await fixture();
  await sync("canceled");
  expect(await membership()).toMatchObject({ state: "lapsed", active: false, revokedReason: "subscription_canceled" });
  expect(await canChat()).toBe(false);
  await sync("active");
  expect(await membership()).toMatchObject({ state: "active", activationSequence: 2 });
});

test("a removed member is never brought back by a payment update", async () => {
  const { t, ids, sync, membership, canChat } = await fixture();
  // As a manager's removal leaves it (the removal itself is covered with the admin tests).
  await t.run((ctx) => ctx.db.patch(ids.membershipId, {
    state: "removed", active: false, revokedAt: NOW, revokedReason: "removed_by_manager",
  } as any));
  await sync("active");
  expect((await membership()).state).toBe("removed");
  expect(await canChat()).toBe(false);
});

test("leaving is for active members: a retry changes nothing and a removal can't be erased by leaving", async () => {
  const { t, ids, membership } = await fixture();
  const asPayer = t.withIdentity({ subject: "payer-subject" });
  await t.run((ctx) => ctx.db.patch(ids.membershipId, {
    state: "removed", active: false, revokedAt: NOW, revokedReason: "removed_by_manager",
  } as any));
  await asPayer.mutation(api.communityAdmin.leaveCommunity, { communityId: ids.communityId });
  expect((await membership())?.state).toBe("removed");

  // The platform home community keeps a departure as `left`; leaving again is fine.
  const homeMembershipId = await t.run(async (ctx) => {
    const homeId = await ctx.db.insert("communities", {
      ownerId: ids.ownerId, slug: "polynet", name: "Polynet", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    } as any);
    const id = await ctx.db.insert("communityMemberships", {
      communityId: homeId, userId: ids.payerId, role: "member", accessSource: "free_grant",
      state: "active", active: true, activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { homeId, id };
  });
  await asPayer.mutation(api.communityAdmin.leaveCommunity, { communityId: homeMembershipId.homeId });
  await asPayer.mutation(api.communityAdmin.leaveCommunity, { communityId: homeMembershipId.homeId });
  expect((await t.run((ctx) => ctx.db.get(homeMembershipId.id)) as any).state).toBe("left");
});

test("only an active membership can end, and nothing ends a removal or a departure", () => {
  for (const to of ["left", "removed", "lapsed", "payment_hold"] as const) expect(canEndCommunityMembership("active", to)).toBe(true);
  for (const from of ["left", "removed"] as const) {
    for (const to of ["active", "left", "removed", "lapsed", "payment_hold"] as const) expect(canEndCommunityMembership(from, to)).toBe(false);
  }
  expect(canEndCommunityMembership("lapsed", "removed")).toBe(false);
  const update = (current: any, grantsAccess: boolean, liftsHold: boolean, reason = "subscription_canceled") =>
    communityMembershipStateAfterSubscriptionUpdate({ current, grantsAccess, liftsHold, reason });
  expect(update("left", true, true)).toBe("left");
  expect(update("removed", true, true)).toBe("removed");
  expect(update("payment_hold", true, false)).toBe("payment_hold");
  expect(update("payment_hold", false, false)).toBe("payment_hold");
  expect(update("active", false, false, "subscription_dispute_opened")).toBe("payment_hold");
});

test("rows from before `state` read as the state their old fields meant, and the backfill writes it once", async () => {
  const old = (fields: Record<string, unknown>) =>
    ({ _id: "m", communityId: "c", userId: "u", role: "member", createdAt: 1, updatedAt: 1, ...fields }) as any;
  expect(communityMembershipState(old({ active: true }))).toBe("active");
  expect(communityMembershipState(old({}))).toBe("active");
  expect(communityMembershipState(old({ active: false, revokedAt: 5, revokedReason: "left_by_member" }))).toBe("left");
  expect(communityMembershipState(old({ active: false, revokedAt: 5, revokedReason: "removed_by_manager_stripe_canceled" }))).toBe("removed");
  expect(communityMembershipState(old({ active: false, revokedAt: 5, revokedReason: "banned_by_manager" }))).toBe("removed");
  expect(communityMembershipState(old({ active: false, revokedAt: 5, revokedReason: "subscription_dispute_lost" }))).toBe("payment_hold");
  expect(communityMembershipState(old({ active: false, revokedAt: 5, revokedReason: "subscription_canceled" }))).toBe("lapsed");

  const { t, ids } = await fixture();
  await t.run((ctx) => ctx.db.patch(ids.membershipId, {
    state: undefined, active: false, revokedAt: NOW, revokedReason: "removed_by_manager",
  } as any));
  const first: any = await t.mutation(internal.communityMembershipLifecycle.backfillCommunityMembershipStateInternal, {});
  expect(first).toMatchObject({ done: true, filled: { removed: 1 } });
  const second: any = await t.mutation(internal.communityMembershipLifecycle.backfillCommunityMembershipStateInternal, {});
  expect(second.filled).toEqual({});
});
