/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityColdArchive.ts",
  "./criticalAudit.ts",
  "./founderBilling.ts",
  "./_generated/**/*.*s",
]);

const PRICE_ID = "price_founder_79";
const NOW_MS = 1_760_000_000_000;

function installFounderPricingEnv() {
  const prior = {
    price: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = PRICE_ID;
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  return () => {
    for (const [key, value] of [
      ["POLYNET_FOUNDER_STRIPE_PRICE_ID", prior.price],
      ["POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", prior.input],
      ["POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", prior.output],
      ["POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", prior.reservation],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function createArchivedFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  cleanupStatus: "pending" | "complete" | "blocked" = "complete",
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `restore-owner-${suffix}`,
      displayName: "Restore owner",
      handle: `restore-owner-${suffix}`,
      normalizedHandle: `restore-owner-${suffix}`,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `restore-community-${suffix}`,
      name: "Restore community",
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const archiveJobId = await ctx.db.insert("communityArchiveBillingJobs", {
      communityId,
      lifecycleGeneration: 1,
      status: cleanupStatus,
      attemptCount: cleanupStatus === "blocked" ? 12 : 0,
      nextAttemptAt: NOW_MS,
      completedAt: cleanupStatus === "complete" ? NOW_MS : undefined,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return { archiveJobId, communityId, ownerId };
  });
}

async function prepareAndAttachRestoreCheckout(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createArchivedFixture>>,
  sessionId: string,
) {
  await t.mutation(
    (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId,
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expiresAt: NOW_MS + 24 * 60 * 60 * 1_000,
      nowMs: NOW_MS,
    },
  );
  await t.mutation(
    (internal as any).founderBilling.attachFounderStripeCheckoutSessionInternal,
    {
      sessionId,
      providerCheckoutSessionId: `cs_${sessionId}`,
      providerCustomerId: `cus_${sessionId}`,
      providerSubscriptionId: null,
      providerPriceId: PRICE_ID,
      nowMs: NOW_MS + 1,
    },
  );
}

function paidSyncArgs(sessionId: string) {
  return {
    localSessionId: sessionId,
    providerCheckoutSessionId: `cs_${sessionId}`,
    providerCustomerId: `cus_${sessionId}`,
    providerSubscriptionId: `sub_${sessionId}`,
    providerPriceId: PRICE_ID,
    subscriptionStatus: "active",
    currentPeriodStartAt: NOW_MS + 2,
    currentPeriodEndAt: NOW_MS + 30 * 24 * 60 * 60 * 1_000,
    cancelAtPeriodEnd: false,
    providerEventCreatedAt: NOW_MS + 2,
  };
}

test.sequential("restoration requires completed archive billing cleanup", async () => {
  const restoreEnv = installFounderPricingEnv();
  try {
    for (const status of ["pending", "blocked"] as const) {
      const t = convexTest(schema, modules);
      const fixture = await createArchivedFixture(t, status, status);
      await expect(
        t.mutation(
          (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
          {
            sessionId: `restore-${status}`,
            ownerUserId: fixture.ownerId,
            communityId: fixture.communityId,
            expiresAt: NOW_MS + 60_000,
            nowMs: NOW_MS,
          },
        ),
      ).rejects.toThrow("community_restore_billing_cleanup_incomplete");
    }
  } finally {
    restoreEnv();
  }
});

test.sequential("billing exposes restore only after archive cleanup completes", async () => {
  const restoreEnv = installFounderPricingEnv();
  try {
    const t = convexTest(schema, modules);
    const fixture = await createArchivedFixture(t, "overview", "pending");
    const asOwner = t.withIdentity({ subject: "restore-owner-overview" });

    const pending = await asOwner.query(
      (api as any).founderBilling.getFounderBillingOverview,
      {},
    );
    expect(pending.communities[0]).toMatchObject({
      lifecycle_status: "archived",
      archive_billing_cleanup_status: "pending",
      allowed_actions: [],
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.archiveJobId, {
        status: "complete",
        completedAt: NOW_MS + 1,
        updatedAt: NOW_MS + 1,
      });
    });
    const complete = await asOwner.query(
      (api as any).founderBilling.getFounderBillingOverview,
      {},
    );
    expect(complete.communities[0]).toMatchObject({
      lifecycle_status: "archived",
      archive_billing_cleanup_status: "complete",
      allowed_actions: ["buy_builder"],
    });
  } finally {
    restoreEnv();
  }
});

test.sequential("only verified paid checkout fulfillment restores exactly once", async () => {
  const restoreEnv = installFounderPricingEnv();
  try {
    const t = convexTest(schema, modules);
    const fixture = await createArchivedFixture(t, "verified");
    const sessionId = "restore-verified";
    await prepareAndAttachRestoreCheckout(t, fixture, sessionId);
    const syncArgs = paidSyncArgs(sessionId);

    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        syncArgs,
      ),
    ).resolves.toMatchObject({ ignored: true });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          subscriptionStatus: "past_due",
          verifiedCheckoutPayment: true,
        },
      ),
    ).resolves.toMatchObject({
      ignored: true,
      reason: "community_restore_subscription_inactive",
    });

    const restored = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      { ...syncArgs, verifiedCheckoutPayment: true },
    );
    expect(restored).toMatchObject({
      ok: true,
      ignored: false,
      communityRestored: true,
      lifecycleGeneration: 2,
    });

    const replay = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      { ...syncArgs, verifiedCheckoutPayment: true },
    );
    expect(replay).toMatchObject({
      ok: true,
      ignored: false,
      founderSubscriptionId: restored.founderSubscriptionId,
      communityRestored: false,
      lifecycleGeneration: null,
    });

    const state = await t.run(async (ctx) => ({
      community: await ctx.db.get(fixture.communityId),
      subscriptions: await ctx.db.query("founderSubscriptions").collect(),
      usageCycles: await ctx.db.query("founderUsageCycles").collect(),
      checkout: await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .first(),
      audits: await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_type_createdAt", (q) =>
          q.eq("eventType", "community_restored"),
        )
        .collect(),
    }));
    expect(state.community).toMatchObject({
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      inferenceFundingPolicy: "managed_required",
    });
    expect(state.subscriptions).toHaveLength(1);
    expect(state.usageCycles).toHaveLength(1);
    expect(state.checkout).toMatchObject({
      status: "complete",
      communityLifecycleGeneration: 1,
    });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      communityId: fixture.communityId,
      provider: "stripe",
      providerObjectId: `sub_${sessionId}`,
      metadata: { lifecycleGeneration: 2 },
    });
  } finally {
    restoreEnv();
  }
});

test.sequential("a stale archived generation cannot be restored", async () => {
  const restoreEnv = installFounderPricingEnv();
  try {
    const t = convexTest(schema, modules);
    const fixture = await createArchivedFixture(t, "stale");
    const sessionId = "restore-stale";
    await prepareAndAttachRestoreCheckout(t, fixture, sessionId);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, {
        lifecycleStatus: "archived",
        lifecycleGeneration: 2,
        updatedAt: NOW_MS + 2,
      });
    });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...paidSyncArgs(sessionId),
          verifiedCheckoutPayment: true,
        },
      ),
    ).resolves.toMatchObject({
      ignored: true,
      reason: "founder_subscription_not_local",
    });
    const state = await t.run(async (ctx) => ({
      community: await ctx.db.get(fixture.communityId),
      subscriptions: await ctx.db.query("founderSubscriptions").collect(),
    }));
    expect(state.community).toMatchObject({
      lifecycleStatus: "archived",
      lifecycleGeneration: 2,
    });
    expect(state.subscriptions).toHaveLength(0);
  } finally {
    restoreEnv();
  }
});
