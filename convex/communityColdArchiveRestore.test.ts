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

async function grantOperatorOwner(
  t: ReturnType<typeof convexTest>,
  userId: any,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("operatorRoles", {
      userId,
      role: "owner",
      active: true,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
  });
}

test.sequential("a plan can't be bought for an archived community, whatever its cleanup", async () => {
  const restoreEnv = installFounderPricingEnv();
  try {
    for (const status of ["pending", "blocked", "complete"] as const) {
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
      ).rejects.toThrow("community_restore_payment_not_required");
    }
  } finally {
    restoreEnv();
  }
});

test.sequential("billing offers no plan action for an archived community, before or after cleanup", async () => {
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
      allowed_actions: [],
    });
  } finally {
    restoreEnv();
  }
});

test.sequential("operator owner restoration is direct and idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createArchivedFixture(t, "operator");
  await grantOperatorOwner(t, fixture.ownerId);
  const asOwner = t.withIdentity({ subject: "restore-owner-operator" });

  const restored = await asOwner.mutation(
    (api as any).communityColdArchive.restoreCommunityWithoutPayment,
    {
      communityId: fixture.communityId,
      lifecycleGeneration: 1,
    },
  );
  expect(restored).toMatchObject({
    ok: true,
    changed: true,
    lifecycle_status: "active",
    lifecycle_generation: 2,
  });

  const replay = await asOwner.mutation(
    (api as any).communityColdArchive.restoreCommunityWithoutPayment,
    {
      communityId: fixture.communityId,
      lifecycleGeneration: 1,
    },
  );
  expect(replay).toMatchObject({
    ok: true,
    changed: false,
    lifecycle_status: "active",
    lifecycle_generation: 2,
  });

  const state = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.communityId),
    audits: await ctx.db
      .query("criticalAuditEvents")
      .withIndex("by_type_createdAt", (q) =>
        q.eq("eventType", "community_restored"),
      )
      .collect(),
    digestSchedules: await ctx.db
      .query("communityWeeklyDigestSchedules")
      .withIndex("by_community", (q) => q.eq("communityId", fixture.communityId))
      .collect(),
  }));
  expect(state.community).toMatchObject({
    lifecycleStatus: "active",
    lifecycleGeneration: 2,
    inferenceFundingPolicy: "managed_required",
  });
  expect(state.audits).toHaveLength(1);
  expect(state.digestSchedules).toHaveLength(1);
  expect(state.digestSchedules[0]).toMatchObject({
    communityLifecycleGeneration: 2,
    status: "scheduled",
    failureCount: 0,
  });
  expect(state.audits[0]).toMatchObject({
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    provider: "polynet",
    metadata: { lifecycleGeneration: 2 },
  });
});

test.sequential("owner restoration is free after cleanup and does not create AI funding", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createArchivedFixture(t, "free", "complete");
  const asOwner = t.withIdentity({ subject: "restore-owner-free" });

  const overview = await asOwner.query(
    (api as any).founderBilling.getFounderBillingOverview,
    {},
  );
  expect(overview.communities[0]).toMatchObject({
    lifecycle_status: "archived",
    archive_billing_cleanup_status: "complete",
    allowed_actions: [],
  });

  const restored = await asOwner.mutation(
    (api as any).communityColdArchive.restoreCommunityWithoutPayment,
    {
      communityId: fixture.communityId,
      lifecycleGeneration: 1,
    },
  );
  expect(restored).toMatchObject({
    ok: true,
    changed: true,
    lifecycle_status: "active",
    lifecycle_generation: 2,
    restoration_authority: "free",
  });

  const state = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.communityId),
    subscriptions: await ctx.db.query("founderSubscriptions").collect(),
  }));
  expect(state.community).toMatchObject({
    lifecycleStatus: "active",
    lifecycleGeneration: 2,
  });
  expect(state.subscriptions).toHaveLength(0);
});

test.sequential("operator restoration requires current completed cleanup", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createArchivedFixture(t, "operator-cleanup", "pending");
  await grantOperatorOwner(t, fixture.ownerId);
  const asOwner = t.withIdentity({ subject: "restore-owner-operator-cleanup" });

  await expect(
    asOwner.mutation(
      (api as any).communityColdArchive.restoreCommunityWithoutPayment,
      {
        communityId: fixture.communityId,
        lifecycleGeneration: 1,
      },
    ),
  ).rejects.toThrow("community_restore_billing_cleanup_incomplete");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.archiveJobId, {
      status: "complete",
      completedAt: NOW_MS + 1,
      updatedAt: NOW_MS + 1,
    });
  });
  await expect(
    asOwner.mutation(
      (api as any).communityColdArchive.restoreCommunityWithoutPayment,
      {
        communityId: fixture.communityId,
        lifecycleGeneration: 2,
      },
    ),
  ).rejects.toThrow("community_restore_lifecycle_generation_conflict");
});

test.sequential("platform home cannot enter operator restoration", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createArchivedFixture(t, "operator-home");
  await grantOperatorOwner(t, fixture.ownerId);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, { slug: "polynet" });
  });
  const asOwner = t.withIdentity({ subject: "restore-owner-operator-home" });
  await expect(
    asOwner.mutation(
      (api as any).communityColdArchive.restoreCommunityWithoutPayment,
      {
        communityId: fixture.communityId,
        lifecycleGeneration: 1,
      },
    ),
  ).rejects.toThrow("community_restore_platform_home_forbidden");
});
