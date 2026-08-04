/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { resolveCommunityArchiveBeginPlan } from "./communityLifecycleCore";

const modules = import.meta.glob([
  "./communityLifecycleCore.ts",
  "./communityLifecycleOperations.ts",
  "./_generated/**/*.*s",
]);

async function createOperationFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "archive-operation-owner",
      displayName: "Archive owner",
      handle: "archive-operation-owner",
      normalizedHandle: "archive-operation-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const adminId = await ctx.db.insert("users", {
      authSubject: "archive-operation-admin",
      displayName: "Archive admin",
      handle: "archive-operation-admin",
      normalizedHandle: "archive-operation-admin",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: "archive-operation-outsider",
      displayName: "Archive outsider",
      handle: "archive-operation-outsider",
      normalizedHandle: "archive-operation-outsider",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "archive-operation-fixture",
      name: "Archive operation fixture",
      oneLiner: "Preserve this community exactly.",
      avatarUrl: "https://example.com/archive-avatar.png",
      bannerUrl: "https://example.com/archive-banner.png",
      visibility: "published",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const adminMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: adminId,
      role: "admin",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Preserved plan",
      amountBaseUnits: 2_900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const protectedCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "polynet",
      name: "Polynet",
      visibility: "published",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const archivedCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "already-archived-operation",
      name: "Already archived",
      visibility: "unlisted",
      lifecycleStatus: "archived",
      lifecycleGeneration: 4,
      archivedAt: 1_500,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_500,
    });
    const orphanedSunsettingCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "orphaned-archiving-operation",
      name: "Orphaned archiving",
      visibility: "unlisted",
      lifecycleStatus: "archiving",
      lifecycleGeneration: 3,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_500,
    });
    return {
      ownerId,
      adminId,
      outsiderId,
      communityId,
      adminMembershipId,
      pricePointId,
      channelId,
      protectedCommunityId,
      archivedCommunityId,
      orphanedSunsettingCommunityId,
    };
  });
}

test("archive begin is atomic, idempotent, and preserves community data", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  const args = {
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    expectedGeneration: 0,
    nowMs: 2_000,
  };

  const first = await t.mutation(
    internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
    args,
  );
  expect(first).toMatchObject({
    ok: true,
    idempotent: false,
    lifecycle_status: "archiving",
    lifecycle_generation: 1,
    operation_state: "requested",
  });

  await t.run(async (ctx) => {
    const community = await ctx.db.get(fixture.communityId);
    const membership = await ctx.db.get(fixture.adminMembershipId);
    const pricePoint = await ctx.db.get(fixture.pricePointId);
    const channel = await ctx.db.get(fixture.channelId);
    const operations = await ctx.db
      .query("communityLifecycleOperations")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect();
    expect(community).toMatchObject({
      lifecycleStatus: "archiving",
      lifecycleGeneration: 1,
      archiveRequestedAt: 2_000,
      archiveRequestedByUserId: fixture.ownerId,
      name: "Archive operation fixture",
      oneLiner: "Preserve this community exactly.",
      avatarUrl: "https://example.com/archive-avatar.png",
      bannerUrl: "https://example.com/archive-banner.png",
      visibility: "published",
      entryPolicy: "paid_subscription",
      activeMemberCount: 2,
      updatedAt: 2_000,
    });
    expect(membership).toMatchObject({ active: true, role: "admin", updatedAt: 1_000 });
    expect(pricePoint).toMatchObject({ isCurrent: true, amountBaseUnits: 2_900, updatedAt: 1_000 });
    expect(channel).toMatchObject({ status: "active", name: "General", updatedAt: 1_000 });
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      lifecycleGeneration: 1,
      kind: "archive",
      state: "requested",
      requestedByUserId: fixture.ownerId,
      attemptCount: 0,
      nextAttemptAt: 2_000,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
  });

  const replay = await t.mutation(
    internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
    { ...args, nowMs: 2_500 },
  );
  expect(replay).toMatchObject({
    ok: true,
    idempotent: true,
    operation_id: first.operation_id,
    lifecycle_generation: 1,
  });
  await t.run(async (ctx) => {
    const community = await ctx.db.get(fixture.communityId);
    const operations = await ctx.db
      .query("communityLifecycleOperations")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect();
    expect(community?.updatedAt).toBe(2_000);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.updatedAt).toBe(2_000);
  });
});

test("archive begin fails closed across authority and lifecycle edge cases", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  const begin = (overrides: Partial<{
    actorUserId: typeof fixture.ownerId;
    communityId: typeof fixture.communityId;
    expectedGeneration: number;
  }> = {}) =>
    t.mutation(
      internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
      {
        actorUserId: overrides.actorUserId ?? fixture.ownerId,
        communityId: overrides.communityId ?? fixture.communityId,
        expectedGeneration: overrides.expectedGeneration ?? 0,
        nowMs: 2_000,
      },
    );

  await expect(begin({ actorUserId: fixture.adminId })).rejects.toThrow(
    "community_owner_required",
  );
  await expect(begin({ actorUserId: fixture.outsiderId })).rejects.toThrow(
    "community_owner_required",
  );
  await expect(begin({ communityId: fixture.protectedCommunityId })).rejects.toThrow(
    "community_lifecycle_protected",
  );
  await expect(begin({ expectedGeneration: 1 })).rejects.toThrow(
    "community_archive_generation_stale",
  );
  await expect(
    begin({ communityId: fixture.archivedCommunityId, expectedGeneration: 4 }),
  ).rejects.toThrow("community_already_archived");
  await expect(
    begin({
      communityId: fixture.orphanedSunsettingCommunityId,
      expectedGeneration: 2,
    }),
  ).rejects.toThrow("community_archive_operation_missing");
});

test("concurrent archive requests converge on one lifecycle operation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  const args = {
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    expectedGeneration: 0,
    nowMs: 2_000,
  };
  const results = await Promise.all([
    t.mutation(
      internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
      args,
    ),
    t.mutation(
      internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
      args,
    ),
  ]);
  expect(new Set(results.map((result) => result.operation_id)).size).toBe(1);
  expect(results.filter((result) => result.idempotent === false)).toHaveLength(1);
  await t.run(async (ctx) => {
    const operations = await ctx.db
      .query("communityLifecycleOperations")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect();
    expect(operations).toHaveLength(1);
  });
});

test("archive generation cannot overflow", () => {
  expect(() =>
    resolveCommunityArchiveBeginPlan({
      community: {
        slug: "generation-exhausted",
        lifecycleStatus: "active",
        lifecycleGeneration: Number.MAX_SAFE_INTEGER,
      },
      expectedGeneration: Number.MAX_SAFE_INTEGER,
    }),
  ).toThrow("community_lifecycle_generation_exhausted");
});

test("archive begin rejects invalid timestamps before writing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);

  await expect(
    t.mutation(
      internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
      {
        actorUserId: fixture.ownerId,
        communityId: fixture.communityId,
        expectedGeneration: 0,
        nowMs: Number.NaN,
      },
    ),
  ).rejects.toThrow("community_archive_timestamp_invalid");

  await t.run(async (ctx) => {
    const community = await ctx.db.get(fixture.communityId);
    const operations = await ctx.db.query("communityLifecycleOperations").collect();
    expect(community?.lifecycleStatus).toBe("active");
    expect(operations).toHaveLength(0);
  });
});

test("archive begin preflight blocks unsupported billing before containment", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communitySubscriptions", {
      communityId: fixture.communityId,
      userId: fixture.adminId,
      membershipId: fixture.adminMembershipId,
      pricePointId: fixture.pricePointId,
      source: "external_sync",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: 1_500,
      updatedAt: 1_500,
    });
  });

  await expect(
    t.mutation(
      internal.communityLifecycleOperations.beginCommunityArchiveOperationInternal,
      {
        actorUserId: fixture.ownerId,
        communityId: fixture.communityId,
        expectedGeneration: 0,
        nowMs: 2_000,
      },
    ),
  ).rejects.toThrow(
    "community_archive_billing_preflight_blocked:external_subscription_cancellation_unsupported",
  );
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
    });
    await expect(
      ctx.db.query("communityLifecycleOperations").collect(),
    ).resolves.toHaveLength(0);
  });
});
