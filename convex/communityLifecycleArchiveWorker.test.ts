/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { communityArchiveRetryDelayMs } from "./communityLifecycleArchiveWorker";
import { beginCommunityArchiveOperationCore } from "./communityLifecycleOperations";

const modules = import.meta.glob([
  "./communityLifecycleCore.ts",
  "./communityLifecycleOperations.ts",
  "./communityLifecycleArchiveWorker.ts",
  "./stripeCheckoutEffectCore.ts",
  "./stripeSubscriptionEffectCore.ts",
  "./stripeCore.ts",
  "./_generated/**/*.*s",
]);

const archiveApi = (internal as any).communityLifecycleArchiveWorker;

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "archive-worker-owner",
      displayName: "Archive worker owner",
      handle: "archive-worker-owner",
      normalizedHandle: "archive-worker-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "archive-worker-member",
      displayName: "Archive worker member",
      handle: "archive-worker-member",
      normalizedHandle: "archive-worker-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "archive-worker-fixture",
      name: "Archive worker fixture",
      visibility: "unlisted",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "paid_subscription",
      active: true,
      activationSequence: 1,
      activatedAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Monthly",
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { ownerId, memberId, communityId, membershipId, pricePointId };
  });
}

async function beginArchiveForWorkerTest(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  nowMs = 2_000,
) {
  return await t.run(async (ctx) =>
    await beginCommunityArchiveOperationCore({
      ctx,
      actorUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expectedGeneration: 0,
      nowMs,
    }),
  );
}

async function beginAndClaim(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const operation = await beginArchiveForWorkerTest(t, fixture);
  const claims = await t.mutation(
    archiveApi.claimDueCommunityArchiveOperationsInternal,
    { nowMs: 2_000, limit: 1 },
  );
  expect(claims).toHaveLength(1);
  expect(claims[0]).toMatchObject({
    operationId: operation.operation_id,
    communityId: fixture.communityId,
    lifecycleGeneration: 1,
    attemptCount: 1,
  });
  return claims[0];
}

test("archive retry backoff is bounded and deterministic", () => {
  expect(communityArchiveRetryDelayMs(1)).toBe(5_000);
  expect(communityArchiveRetryDelayMs(2)).toBe(10_000);
  expect(communityArchiveRetryDelayMs(12)).toBe(3_600_000);
  expect(communityArchiveRetryDelayMs(99)).toBe(3_600_000);
});

test("a no-billing archive claim finalizes without requiring Stripe", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const claim = await beginAndClaim(t, fixture);
  const effect = await t.query(
    archiveApi.readNextCommunityArchiveEffectInternal,
    { operationId: claim.operationId, leaseId: claim.leaseId, nowMs: 2_001 },
  );
  expect(effect).toEqual({ kind: "finalize" });
  await t.mutation(archiveApi.finalizeCommunityArchiveOperationInternal, {
    operationId: claim.operationId,
    leaseId: claim.leaseId,
    nowMs: 2_002,
  });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      archivedAt: 2_002,
      archiveEffectiveAt: 2_002,
    });
    const operation = (await ctx.db.get(claim.operationId)) as any;
    expect(operation).toMatchObject({
      state: "succeeded",
      completedAt: 2_002,
    });
    expect(operation?.leaseId).toBeUndefined();
  });
});

test("the bounded action completes a no-billing archive without Stripe configuration", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("ARX_STRIPE_SECRET_KEY", "");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await beginArchiveForWorkerTest(t, fixture);
  await expect(
    t.action(archiveApi.processCommunityArchiveOperationsInternal, { limit: 1 }),
  ).resolves.toMatchObject({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archived",
    });
  });
  vi.unstubAllEnvs();
});

test("unexpected provider setup failures are recorded and retried", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("ARX_STRIPE_SECRET_KEY", "");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      provider: "stripe",
      providerCustomerId: "cus_retry",
      providerSubscriptionId: "sub_retry",
      providerPriceId: "price_retry",
      status: "active",
      currentPeriodStartAt: 1_000,
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
  });
  await beginArchiveForWorkerTest(t, fixture);
  await expect(
    t.action(archiveApi.processCommunityArchiveOperationsInternal, { limit: 1 }),
  ).resolves.toMatchObject({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
  await t.run(async (ctx) => {
    const operation = await ctx.db
      .query("communityLifecycleOperations")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .unique();
    expect(operation).toMatchObject({
      state: "requested",
      attemptCount: 1,
      errorCode: "stripe_secret_key_missing",
    });
  });
  vi.unstubAllEnvs();
});

test("the worker converges paid-member access while preserving unrelated community data", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const { founderId, memberSubscriptionId, checkoutId, manualMembershipId } =
    await t.run(async (ctx) => {
      const manualMemberId = await ctx.db.insert("users", {
        authSubject: "archive-worker-manual-member",
        displayName: "Archive worker manual member",
        handle: "archive-worker-manual-member",
        normalizedHandle: "archive-worker-manual-member",
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      const manualMembershipId = await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: manualMemberId,
        role: "member",
        accessSource: "manual_grant",
        active: true,
        activationSequence: 1,
        activatedAt: 1_000,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      await ctx.db.patch(fixture.communityId, { activeMemberCount: 3 });
      return {
        manualMembershipId,
        founderId: await ctx.db.insert("founderSubscriptions", {
          ownerUserId: fixture.ownerId,
          communityId: fixture.communityId,
          provider: "stripe",
          providerCustomerId: "cus_founder",
          providerSubscriptionId: "sub_founder",
          providerPriceId: "price_founder",
          status: "active",
          currentPeriodStartAt: 1_000,
          currentPeriodEndAt: 10_000,
          cancelAtPeriodEnd: false,
          lastProviderEventCreatedAt: 1_000,
          createdAt: 1_000,
          updatedAt: 1_000,
        }),
        memberSubscriptionId: await ctx.db.insert("communitySubscriptions", {
          communityId: fixture.communityId,
          userId: fixture.memberId,
          membershipId: fixture.membershipId,
          pricePointId: fixture.pricePointId,
          source: "stripe",
          status: "active",
          providerSubscriptionId: "sub_member",
          providerAccountId: "acct_builder",
          cancelAtPeriodEnd: false,
          createdAt: 1_000,
          updatedAt: 1_000,
        }),
        checkoutId: await ctx.db.insert("checkoutSessions", {
          sessionId: "checkout-local-only",
          mode: "community_join",
          provider: "stripe",
          communityId: fixture.communityId,
          communityLifecycleGeneration: 0,
          ownerUserId: fixture.memberId,
          status: "pending",
          expiresAt: 10_000,
          createdAt: 1_000,
          updatedAt: 1_000,
        }),
      };
    });
  const claim = await beginAndClaim(t, fixture);
  const next = async (nowMs: number) => await t.query(
    archiveApi.readNextCommunityArchiveEffectInternal,
    { operationId: claim.operationId, leaseId: claim.leaseId, nowMs },
  );
  const complete = async (
    effectKind: string,
    rowId: string,
    nowMs: number,
    providerObjectId?: string,
    providerAccountId?: string,
  ) =>
    await t.mutation(archiveApi.completeCommunityArchiveEffectInternal, {
      operationId: claim.operationId,
      leaseId: claim.leaseId,
      effectKind,
      rowId,
      nowMs,
      providerObjectId,
      providerAccountId,
    });

  await expect(next(2_001)).resolves.toMatchObject({
    kind: "founder_subscription",
    rowId: founderId,
    providerSubscriptionId: "sub_founder",
    accountScope: { kind: "platform" },
  });
  await expect(
    complete(
      "founder_subscription",
      String(founderId),
      2_002,
      "sub_wrong",
    ),
  ).rejects.toThrow("community_archive_effect_row_mismatch");
  await complete(
    "founder_subscription",
    String(founderId),
    2_003,
    "sub_founder",
  );
  await expect(next(2_004)).resolves.toMatchObject({
    kind: "community_subscription",
    rowId: memberSubscriptionId,
    providerSubscriptionId: "sub_member",
    accountScope: { kind: "connected", providerAccountId: "acct_builder" },
  });
  await complete(
    "community_subscription",
    String(memberSubscriptionId),
    2_005,
    "sub_member",
    "acct_builder",
  );
  await complete(
    "community_subscription",
    String(memberSubscriptionId),
    2_005,
    "sub_member",
    "acct_builder",
  );
  await expect(next(2_006)).resolves.toMatchObject({
    kind: "checkout",
    rowId: checkoutId,
    providerCheckoutSessionId: null,
    accountScope: null,
  });
  await complete("checkout", String(checkoutId), 2_007);
  await expect(next(2_008)).resolves.toEqual({ kind: "finalize" });
  await t.mutation(archiveApi.finalizeCommunityArchiveOperationInternal, {
    operationId: claim.operationId,
    leaseId: claim.leaseId,
    nowMs: 2_009,
  });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(founderId)).resolves.toMatchObject({
      status: "ended",
      endedAt: 2_003,
      revokedReason: "community_archived",
    });
    await expect(ctx.db.get(memberSubscriptionId)).resolves.toMatchObject({
      status: "ended",
      endedAt: 2_005,
    });
    await expect(ctx.db.get(checkoutId)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(ctx.db.get(fixture.membershipId)).resolves.toMatchObject({
      active: false,
      revokedAt: 2_005,
      revokedReason: "community_archived",
    });
    await expect(ctx.db.get(manualMembershipId)).resolves.toMatchObject({
      active: true,
    });
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      activeMemberCount: 2,
    });
  });
});

test("member-subscription completion fails closed when its membership is missing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const memberSubscriptionId = await t.run(async (ctx) =>
    await ctx.db.insert("communitySubscriptions", {
      communityId: fixture.communityId,
      userId: fixture.memberId,
      membershipId: fixture.membershipId,
      pricePointId: fixture.pricePointId,
      source: "stripe",
      status: "active",
      providerSubscriptionId: "sub_missing_membership",
      providerAccountId: "acct_builder",
      cancelAtPeriodEnd: false,
      createdAt: 1_000,
      updatedAt: 1_000,
    }),
  );
  const claim = await beginAndClaim(t, fixture);
  await t.run(async (ctx) => {
    await ctx.db.delete(fixture.membershipId);
  });

  await expect(
    t.mutation(archiveApi.completeCommunityArchiveEffectInternal, {
      operationId: claim.operationId,
      leaseId: claim.leaseId,
      effectKind: "community_subscription",
      rowId: String(memberSubscriptionId),
      nowMs: 2_005,
      providerObjectId: "sub_missing_membership",
      providerAccountId: "acct_builder",
    }),
  ).rejects.toThrow("community_subscription_membership_missing");
  await t.run(async (ctx) => {
    await expect(ctx.db.get(memberSubscriptionId)).resolves.toMatchObject({
      status: "active",
    });
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archiving",
    });
  });
});

test("expired leases are reclaimed and nonterminal failures back off", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const first = await beginAndClaim(t, fixture);
  const reclaimed = await t.mutation(
    archiveApi.claimDueCommunityArchiveOperationsInternal,
    { nowMs: 122_000, limit: 1 },
  );
  expect(reclaimed).toHaveLength(1);
  expect(reclaimed[0]).toMatchObject({
    operationId: first.operationId,
    attemptCount: 2,
  });
  expect(reclaimed[0].leaseId).not.toBe(first.leaseId);
  await expect(
    t.mutation(archiveApi.releaseCommunityArchiveOperationInternal, {
      operationId: first.operationId,
      leaseId: first.leaseId,
      nowMs: 122_001,
      errorCode: "stale_worker",
      terminal: true,
    }),
  ).rejects.toThrow("community_archive_operation_lease_lost");
  await t.mutation(archiveApi.releaseCommunityArchiveOperationInternal, {
    operationId: reclaimed[0].operationId,
    leaseId: reclaimed[0].leaseId,
    nowMs: 122_001,
    errorCode: "stripe_rate_limited",
    terminal: false,
  });
  await t.run(async (ctx) => {
    const operation = (await ctx.db.get(first.operationId)) as any;
    expect(operation).toMatchObject({
      state: "requested",
      attemptCount: 2,
      nextAttemptAt: 132_001,
      errorCode: "stripe_rate_limited",
    });
    expect(operation?.leaseId).toBeUndefined();
  });
});

test("claiming terminally reconciles missing or lifecycle-mismatched communities", async () => {
  for (const mismatch of ["missing", "lifecycle"] as const) {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const operation = await beginArchiveForWorkerTest(t, fixture);
    await t.run(async (ctx) => {
      if (mismatch === "missing") {
        await ctx.db.delete(fixture.communityId);
      } else {
        await ctx.db.patch(fixture.communityId, {
          lifecycleStatus: "archived",
          archivedAt: 2_001,
          updatedAt: 2_001,
        });
      }
    });

    await expect(
      t.mutation(archiveApi.claimDueCommunityArchiveOperationsInternal, {
        nowMs: 2_002,
        limit: 1,
      }),
    ).resolves.toHaveLength(0);
    await t.run(async (ctx) => {
      await expect(ctx.db.get(operation.operation_id as any)).resolves.toMatchObject({
        state: "failed",
        errorCode:
          mismatch === "missing"
            ? "community_not_found"
            : "community_archive_lifecycle_mismatch",
        completedAt: 2_002,
      });
    });
  }
});

test("a valid lease can record terminal lifecycle drift after claim", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const claim = await beginAndClaim(t, fixture);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "archived",
      archivedAt: 2_001,
      updatedAt: 2_001,
    });
  });

  await expect(
    t.query(archiveApi.readNextCommunityArchiveEffectInternal, {
      operationId: claim.operationId,
      leaseId: claim.leaseId,
      nowMs: 2_002,
    }),
  ).rejects.toThrow("community_archive_lifecycle_mismatch");
  await expect(
    t.mutation(archiveApi.releaseCommunityArchiveOperationInternal, {
      operationId: claim.operationId,
      leaseId: claim.leaseId,
      nowMs: 2_003,
      errorCode: "community_archive_lifecycle_mismatch",
      terminal: true,
    }),
  ).resolves.toMatchObject({ ok: true, terminal: true });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(claim.operationId)).resolves.toMatchObject({
      state: "failed",
      errorCode: "community_archive_lifecycle_mismatch",
      completedAt: 2_003,
    });
  });
});

test("the twelfth failed claim exhausts the retry budget while containment remains", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const operation = await beginArchiveForWorkerTest(t, fixture);
  await t.run(async (ctx) => {
    await ctx.db.patch(operation.operation_id as any, {
      attemptCount: 11,
      nextAttemptAt: 2_001,
      updatedAt: 2_001,
    });
  });
  const claims = await t.mutation(
    archiveApi.claimDueCommunityArchiveOperationsInternal,
    { nowMs: 2_002, limit: 1 },
  );
  expect(claims[0]).toMatchObject({ attemptCount: 12 });
  await expect(
    t.mutation(archiveApi.releaseCommunityArchiveOperationInternal, {
      operationId: claims[0].operationId,
      leaseId: claims[0].leaseId,
      nowMs: 2_003,
      errorCode: "stripe_rate_limited",
      terminal: false,
    }),
  ).resolves.toMatchObject({ terminal: true });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(operation.operation_id as any)).resolves.toMatchObject({
      state: "failed",
      attemptCount: 12,
    });
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archiving",
    });
  });
});

test("more than ten local effects pause at the bound and resume to completion", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("ARX_STRIPE_SECRET_KEY", "");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 11; index += 1) {
      await ctx.db.insert("checkoutSessions", {
        sessionId: `checkout-bounded-${index}`,
        mode: "community_join",
        provider: "stripe",
        communityId: fixture.communityId,
        communityLifecycleGeneration: 0,
        ownerUserId: fixture.memberId,
        status: "pending",
        expiresAt: 10_000,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      });
    }
  });
  const operation = await beginArchiveForWorkerTest(t, fixture);
  await expect(
    t.action(archiveApi.processCommunityArchiveOperationsInternal, { limit: 1 }),
  ).resolves.toMatchObject({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
  await t.run(async (ctx) => {
    const pending = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", fixture.communityId).eq("status", "pending"),
      )
      .collect();
    expect(pending).toHaveLength(1);
    await ctx.db.patch(operation.operation_id as any, {
      nextAttemptAt: 0,
    });
  });
  await expect(
    t.action(archiveApi.processCommunityArchiveOperationsInternal, { limit: 1 }),
  ).resolves.toMatchObject({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archived",
    });
  });
  vi.unstubAllEnvs();
});
