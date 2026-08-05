/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderInference.ts",
  "./founderInferenceMigration.ts",
  "./founderBilling.ts",
  "./providerConnections.ts",
  "./_generated/**/*.*s",
]);

async function insertOwner(ctx: any, suffix: string, nowMs: number) {
  return await ctx.db.insert("users", {
    authSubject: `billing-lifecycle-${suffix}`,
    displayName: `Billing ${suffix}`,
    handle: `billing-${suffix}`,
    normalizedHandle: `billing-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function insertCommunity(args: {
  ctx: any;
  ownerId: any;
  suffix: string;
  lifecycleStatus: "active" | "archived";
  lifecycleGeneration: number;
  nowMs: number;
}) {
  return await args.ctx.db.insert("communities", {
    ownerId: args.ownerId,
    slug: `billing-lifecycle-${args.suffix}`,
    name: `Billing ${args.suffix}`,
    visibility: "unlisted",
    lifecycleStatus: args.lifecycleStatus,
    lifecycleGeneration: args.lifecycleGeneration,
    inferenceFundingPolicy: "managed_required",
    entryPolicy: "approval",
    activeMemberCount: 1,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function insertActiveBuilderSubscription(args: {
  ctx: any;
  ownerId: any;
  communityId: any;
  suffix: string;
  nowMs: number;
}) {
  const community = await args.ctx.db.get(args.communityId);
  await args.ctx.db.insert("founderSubscriptions", {
    ownerUserId: args.ownerId,
    communityId: args.communityId,
    communityLifecycleGeneration: Number(community?.lifecycleGeneration ?? 0),
    provider: "stripe",
    providerCustomerId: `cus_${args.suffix}`,
    providerSubscriptionId: `sub_${args.suffix}`,
    providerPriceId: "price_founder_79_monthly",
    status: "active",
    currentPeriodStartAt: args.nowMs - 1_000,
    currentPeriodEndAt: args.nowMs + 30 * 24 * 60 * 60 * 1_000,
    cancelAtPeriodEnd: false,
    lastProviderEventCreatedAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

test("operator billing projects archived communities as dormant but restore-ready", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertOwner(ctx, "operator", nowMs);
    const activeId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "operator-active",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      nowMs,
    });
    const archivedId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "operator-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      nowMs: nowMs + 1,
    });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { activeId, archivedId };
  });

  const overview = await t.withIdentity({
    subject: "billing-lifecycle-operator",
  }).query((api as any).founderBilling.getFounderBillingOverview, {});
  expect(overview.communities).toEqual(expect.arrayContaining([
    expect.objectContaining({
      community_id: String(fixture.activeId),
      lifecycle_status: "active",
      lifecycle_generation: 0,
      operational_funding: true,
      restore_eligibility: {
        state: "not_archived",
        action: null,
        requires_verified_checkout: false,
      },
    }),
    expect.objectContaining({
      community_id: String(fixture.archivedId),
      lifecycle_status: "archived",
      lifecycle_generation: 1,
      operational_funding: false,
      restore_eligibility: {
        state: "ready",
        action: "restore_now",
        requires_verified_checkout: false,
      },
    }),
  ]));
  expect(overview.managed_monthly_total_base_units).toBe(0);
});

test("managed monthly totals exclude archived subscription drift", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertOwner(ctx, "managed", nowMs);
    const activeId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "managed-active",
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      nowMs,
    });
    const archivedId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "managed-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 3,
      nowMs: nowMs + 1,
    });
    await insertActiveBuilderSubscription({
      ctx,
      ownerId,
      communityId: activeId,
      suffix: "managed_active",
      nowMs,
    });
    await insertActiveBuilderSubscription({
      ctx,
      ownerId,
      communityId: archivedId,
      suffix: "managed_archived",
      nowMs,
    });
    return { activeId, archivedId };
  });

  const overview = await t.withIdentity({
    subject: "billing-lifecycle-managed",
  }).query((api as any).founderBilling.getFounderBillingOverview, {});
  expect(overview.managed_monthly_total_base_units).toBe(7_900);
  expect(overview.communities).toEqual(expect.arrayContaining([
    expect.objectContaining({
      community_id: String(fixture.activeId),
      operational_funding: true,
    }),
    expect.objectContaining({
      community_id: String(fixture.archivedId),
      operational_funding: false,
      restore_eligibility: expect.objectContaining({
        state: "funding_attention",
        action: "manage_builder",
      }),
    }),
  ]));
});

test("archived managed communities without funding require verified checkout", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  await t.run(async (ctx) => {
    const ownerId = await insertOwner(ctx, "checkout", nowMs);
    await insertCommunity({
      ctx,
      ownerId,
      suffix: "checkout-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 4,
      nowMs,
    });
  });

  const overview = await t.withIdentity({
    subject: "billing-lifecycle-checkout",
  }).query((api as any).founderBilling.getFounderBillingOverview, {});
  expect(overview.communities).toEqual([
    expect.objectContaining({
      lifecycle_status: "archived",
      lifecycle_generation: 4,
      operational_funding: false,
      restore_eligibility: {
        state: "checkout_required",
        action: "buy_builder",
        requires_verified_checkout: true,
      },
    }),
  ]);
  expect(overview.managed_monthly_total_base_units).toBe(0);
});

test("archived current-generation checkout drift is visible and blocks restore", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  await t.run(async (ctx) => {
    const ownerId = await insertOwner(ctx, "pending-drift", nowMs);
    const communityId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "pending-drift-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 5,
      nowMs,
    });
    await ctx.db.insert("checkoutSessions", {
      sessionId: "billing-lifecycle-pending-drift",
      mode: "founder_subscription",
      provider: "stripe",
      communityId,
      communityLifecycleGeneration: 5,
      ownerUserId: ownerId,
      status: "pending",
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  const overview = await t.withIdentity({
    subject: "billing-lifecycle-pending-drift",
  }).query((api as any).founderBilling.getFounderBillingOverview, {});
  expect(overview.communities).toEqual([
    expect.objectContaining({
      lifecycle_status: "archived",
      funding_state: "checkout_pending",
      checkout_pending: true,
      restore_eligibility: {
        state: "funding_attention",
        action: null,
        requires_verified_checkout: false,
      },
    }),
  ]);
});

test("operator funding never hides archived managed-financial drift", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  await t.run(async (ctx) => {
    const ownerId = await insertOwner(ctx, "operator-drift", nowMs);
    const communityId = await insertCommunity({
      ctx,
      ownerId,
      suffix: "operator-drift-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 6,
      nowMs,
    });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("checkoutSessions", {
      sessionId: "billing-lifecycle-operator-drift",
      mode: "founder_subscription",
      provider: "stripe",
      communityId,
      communityLifecycleGeneration: 6,
      ownerUserId: ownerId,
      status: "pending",
      expiresAt: nowMs + 60_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  const overview = await t.withIdentity({
    subject: "billing-lifecycle-operator-drift",
  }).query((api as any).founderBilling.getFounderBillingOverview, {});
  expect(overview.communities[0]).toMatchObject({
    funding_state: "builder_included",
    checkout_pending: true,
    restore_eligibility: {
      state: "funding_attention",
      action: null,
      requires_verified_checkout: false,
    },
  });
});
