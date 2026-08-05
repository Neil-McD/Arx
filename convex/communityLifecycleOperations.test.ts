/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { resolveCommunityArchiveBeginPlan } from "./communityLifecycleCore";
import { beginCommunityArchiveOperationCore } from "./communityLifecycleOperations";

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
    const operatorId = await ctx.db.insert("users", {
      authSubject: "archive-operation-operator",
      displayName: "Archive operator",
      handle: "archive-operation-operator",
      normalizedHandle: "archive-operation-operator",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const readonlyOperatorId = await ctx.db.insert("users", {
      authSubject: "archive-operation-readonly",
      displayName: "Archive readonly operator",
      handle: "archive-operation-readonly",
      normalizedHandle: "archive-operation-readonly",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("operatorRoles", {
      userId: operatorId,
      role: "operator",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("operatorRoles", {
      userId: readonlyOperatorId,
      role: "readonly",
      active: true,
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
      operatorId,
      readonlyOperatorId,
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

async function beginArchiveForTest(
  t: ReturnType<typeof convexTest>,
  args: {
    actorUserId: any;
    communityId: any;
    expectedGeneration: number;
    nowMs: number;
  },
) {
  return await t.run(async (ctx) =>
    await beginCommunityArchiveOperationCore({ ctx, ...args }),
  );
}

async function failArchiveForTest(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createOperationFixture>>,
  overrides: Partial<{
    completedAt: number;
    errorCode: string;
    attemptCount: number;
  }> = {},
) {
  const begun = await beginArchiveForTest(t, {
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    expectedGeneration: 0,
    nowMs: 2_000,
  });
  const completedAt = overrides.completedAt ?? 3_000;
  await t.run(async (ctx) => {
    await ctx.db.patch(begun.operation_id as any, {
      state: "failed",
      attemptCount: overrides.attemptCount ?? 12,
      nextAttemptAt: completedAt,
      lastAttemptAt: completedAt - 100,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      errorCode:
        overrides.errorCode ?? "community_archive_provider_blocked:test_failure",
      completedAt,
      updatedAt: completedAt,
    });
  });
  return {
    operationId: begun.operation_id as any,
    lifecycleGeneration: begun.lifecycle_generation,
    completedAt,
  };
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

  const first = await beginArchiveForTest(t, args);
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

  const replay = await beginArchiveForTest(t, { ...args, nowMs: 2_500 });
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

test("the public archive command derives authenticated owner authority server-side", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  const command = (api as any).communityLifecycleOperations
    .requestMyCommunityArchive;

  await expect(
    t.mutation(command, {
      communityId: fixture.communityId,
      expectedGeneration: 0,
    }),
  ).rejects.toThrow("verified_identity_required");
  for (const subject of [
    "archive-operation-admin",
    "archive-operation-outsider",
  ]) {
    await expect(
      t.withIdentity({ subject }).mutation(command, {
        communityId: fixture.communityId,
        expectedGeneration: 0,
      }),
    ).rejects.toThrow("community_owner_required");
  }

  const result = await t
    .withIdentity({ subject: "archive-operation-owner" })
    .mutation(command, {
      communityId: fixture.communityId,
      expectedGeneration: 0,
    });
  expect(result).toMatchObject({
    ok: true,
    idempotent: false,
    lifecycle_status: "archiving",
    lifecycle_generation: 1,
    operation_state: "requested",
  });
  await expect(
    t.withIdentity({ subject: "archive-operation-owner" }).mutation(command, {
      communityId: fixture.communityId,
      expectedGeneration: 0,
    }),
  ).resolves.toMatchObject({
    ok: true,
    idempotent: true,
    operation_id: result.operation_id,
    lifecycle_generation: 1,
  });
  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archiving",
      lifecycleGeneration: 1,
      archiveRequestedByUserId: fixture.ownerId,
    });
  });
});

test("only the authenticated owner can inspect the current archive operation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  await beginArchiveForTest(t, {
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    expectedGeneration: 0,
    nowMs: 2_000,
  });

  const asOwner = t.withIdentity({ subject: "archive-operation-owner" });
  await expect(
    asOwner.query(
      (api as any).communityLifecycleOperations
        .getMyCommunityArchiveOperationStatus,
      { communityId: fixture.communityId },
    ),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    lifecycle_status: "archiving",
    lifecycle_generation: 1,
    operation: {
      kind: "archive",
      state: "requested",
      lifecycle_generation: 1,
      attempt_count: 0,
      error_code: null,
      created_at: 2_000,
    },
  });

  for (const subject of [
    "archive-operation-admin",
    "archive-operation-outsider",
  ]) {
    await expect(
      t.withIdentity({ subject }).query(
        (api as any).communityLifecycleOperations
          .getMyCommunityArchiveOperationStatus,
        { communityId: fixture.communityId },
      ),
    ).rejects.toThrow("community_owner_required");
  }
  await expect(
    t.query(
      (api as any).communityLifecycleOperations
        .getMyCommunityArchiveOperationStatus,
      { communityId: fixture.communityId },
    ),
  ).rejects.toThrow("verified_identity_required");
});

test("an operator can inspect and idempotently requeue one exact terminal archive failure", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  const failed = await failArchiveForTest(t, fixture);
  const asOperator = t.withIdentity({ subject: "archive-operation-operator" });
  const inspect = (api as any).communityLifecycleOperations
    .getCommunityArchiveOperationForOperator;
  const requeue = (api as any).communityLifecycleOperations
    .requeueFailedCommunityArchiveOperationForOperator;

  await expect(
    asOperator.query(inspect, { operationId: failed.operationId }),
  ).resolves.toMatchObject({
    ok: true,
    idempotent: false,
    community: {
      community_id: String(fixture.communityId),
      slug: "archive-operation-fixture",
      lifecycle_status: "archiving",
      lifecycle_generation: 1,
    },
    operation: {
      operation_id: String(failed.operationId),
      state: "failed",
      lifecycle_generation: 1,
      attempt_count: 12,
      completed_at: 3_000,
      error_code: "community_archive_provider_blocked:test_failure",
    },
  });

  for (const subject of [
    "archive-operation-owner",
    "archive-operation-admin",
    "archive-operation-readonly",
    "archive-operation-outsider",
  ]) {
    await expect(
      t.withIdentity({ subject }).query(inspect, {
        operationId: failed.operationId,
      }),
    ).rejects.toThrow("operator_access_forbidden");
  }

  const args = {
    operationId: failed.operationId,
    expectedGeneration: 1,
    expectedFailureCompletedAt: 3_000,
    idempotencyKey: "archive-requeue-0001",
  };
  await expect(asOperator.mutation(requeue, args)).resolves.toMatchObject({
    ok: true,
    idempotent: false,
    community: {
      lifecycle_status: "archiving",
      lifecycle_generation: 1,
    },
    operation: {
      operation_id: String(failed.operationId),
      state: "requested",
      attempt_count: 0,
      last_attempt_at: null,
      completed_at: null,
      error_code: null,
    },
  });
  await expect(asOperator.mutation(requeue, args)).resolves.toMatchObject({
    ok: true,
    idempotent: true,
    operation: {
      operation_id: String(failed.operationId),
      state: "requested",
    },
  });
  await expect(
    asOperator.mutation(requeue, {
      ...args,
      expectedFailureCompletedAt: 3_001,
    }),
  ).rejects.toThrow("community_archive_requeue_idempotency_conflict");

  await t.run(async (ctx) => {
    await expect(ctx.db.get(fixture.communityId)).resolves.toMatchObject({
      lifecycleStatus: "archiving",
      lifecycleGeneration: 1,
      updatedAt: 2_000,
    });
    const operation = await ctx.db.get(failed.operationId);
    expect(operation).toMatchObject({
      state: "requested",
      attemptCount: 0,
    });
    for (const field of [
      "lastAttemptAt",
      "leaseId",
      "leaseExpiresAt",
      "errorCode",
      "completedAt",
    ]) {
      expect(operation).not.toHaveProperty(field);
    }
    const audits = await ctx.db
      .query("criticalAuditEvents")
      .withIndex("by_type_createdAt", (q) =>
        q.eq("eventType", "community_archive_requeued"),
      )
      .collect();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      status: "succeeded",
      severity: "warning",
      actorUserId: fixture.operatorId,
      communityId: fixture.communityId,
      provider: "polynet",
      providerObjectId: String(failed.operationId),
      metadata: {
        lifecycleGeneration: 1,
        previousAttemptCount: 12,
        previousLastAttemptAt: 2_900,
        previousFailureCompletedAt: 3_000,
        previousErrorCode: "community_archive_provider_blocked:test_failure",
      },
    });
  });
});

test("archive recovery fails closed on authority, stale evidence, leases, and lifecycle drift", async () => {
  const requeue = (api as any).communityLifecycleOperations
    .requeueFailedCommunityArchiveOperationForOperator;
  const baseArgs = (operationId: any) => ({
    operationId,
    expectedGeneration: 1,
    expectedFailureCompletedAt: 3_000,
    idempotencyKey: "archive-requeue-edge-0001",
  });

  {
    const t = convexTest(schema, modules);
    const fixture = await createOperationFixture(t);
    const failed = await failArchiveForTest(t, fixture);
    await expect(
      t.withIdentity({ subject: "archive-operation-owner" }).mutation(
        requeue,
        baseArgs(failed.operationId),
      ),
    ).rejects.toThrow("operator_access_forbidden");
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        { ...baseArgs(failed.operationId), expectedGeneration: 2 },
      ),
    ).rejects.toThrow("community_archive_requeue_generation_stale");
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        { ...baseArgs(failed.operationId), expectedFailureCompletedAt: 2_999 },
      ),
    ).rejects.toThrow("community_archive_requeue_failure_stale");
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        { ...baseArgs(failed.operationId), idempotencyKey: "too-short" },
      ),
    ).rejects.toThrow("community_archive_requeue_idempotency_key_invalid");
  }

  {
    const t = convexTest(schema, modules);
    const fixture = await createOperationFixture(t);
    const failed = await failArchiveForTest(t, fixture);
    await t.run(async (ctx) => {
      await ctx.db.patch(failed.operationId, {
        leaseId: "stale-but-inconsistent-lease",
        leaseExpiresAt: 2_500,
      });
    });
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        baseArgs(failed.operationId),
      ),
    ).rejects.toThrow("community_archive_requeue_lease_present");
  }

  {
    const t = convexTest(schema, modules);
    const fixture = await createOperationFixture(t);
    const failed = await failArchiveForTest(t, fixture);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, {
        lifecycleStatus: "archived",
        archivedAt: 3_000,
      });
    });
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        baseArgs(failed.operationId),
      ),
    ).rejects.toThrow("community_archive_lifecycle_mismatch");
  }

  {
    const t = convexTest(schema, modules);
    const fixture = await createOperationFixture(t);
    const begun = await beginArchiveForTest(t, {
      actorUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expectedGeneration: 0,
      nowMs: 2_000,
    });
    await expect(
      t.withIdentity({ subject: "archive-operation-operator" }).mutation(
        requeue,
        baseArgs(begun.operation_id),
      ),
    ).rejects.toThrow("community_archive_operation_not_failed");
  }
});

test("owner lifecycle management reads expose only inactive identity and current receipt state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  await beginArchiveForTest(t, {
    actorUserId: fixture.ownerId,
    communityId: fixture.communityId,
    expectedGeneration: 0,
    nowMs: 2_000,
  });

  const asOwner = t.withIdentity({ subject: "archive-operation-owner" });
  await expect(
    asOwner.query(
      (api as any).communityLifecycleOperations
        .getMyCommunityLifecycleManagementBySlug,
      { communitySlug: "archive-operation-fixture" },
    ),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    slug: "archive-operation-fixture",
    name: "Archive operation fixture",
    lifecycle_status: "archiving",
    lifecycle_generation: 1,
    archive_requested_at: 2_000,
    operation: {
      kind: "archive",
      state: "requested",
      lifecycle_generation: 1,
    },
  });

  const archivingInventory = await asOwner.query(
    (api as any).communityLifecycleOperations
      .listMyInactiveCommunityLifecycleRows,
    {
      lifecycleStatus: "archiving",
      paginationOpts: { cursor: null, numItems: 25 },
    },
  );
  expect(archivingInventory).toMatchObject({
    continue_cursor: expect.any(String),
    is_done: true,
  });
  expect(archivingInventory.items.map((item: any) => item.slug)).toEqual([
    "orphaned-archiving-operation",
    "archive-operation-fixture",
  ]);
  const archivedInventory = await asOwner.query(
    (api as any).communityLifecycleOperations
      .listMyInactiveCommunityLifecycleRows,
    {
      lifecycleStatus: "archived",
      paginationOpts: { cursor: null, numItems: 25 },
    },
  );
  expect(archivedInventory).toMatchObject({
    continue_cursor: expect.any(String),
    is_done: true,
  });
  expect(archivedInventory.items.map((item: any) => item.slug)).toEqual([
    "already-archived-operation",
  ]);
  for (const item of [
    ...archivingInventory.items,
    ...archivedInventory.items,
  ]) {
    expect(item).not.toHaveProperty("operation");
    expect(item).not.toHaveProperty("owner_id");
    expect(item).not.toHaveProperty("entry_policy");
    expect(item).not.toHaveProperty("active_member_count");
  }

  await expect(
    t.withIdentity({ subject: "archive-operation-outsider" }).query(
      (api as any).communityLifecycleOperations
        .getMyCommunityLifecycleManagementBySlug,
      { communitySlug: "archive-operation-fixture" },
    ),
  ).rejects.toThrow("community_owner_required");
});

test("owner status excludes archive receipts from stale lifecycle generations", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createOperationFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityLifecycleOperations", {
      communityId: fixture.communityId,
      lifecycleGeneration: 1,
      kind: "archive",
      state: "succeeded",
      requestedByUserId: fixture.ownerId,
      attemptCount: 1,
      nextAttemptAt: 2_000,
      lastAttemptAt: 2_000,
      completedAt: 2_000,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.patch(fixture.communityId, {
      lifecycleStatus: "active",
      lifecycleGeneration: 2,
      updatedAt: 3_000,
    });
  });

  await expect(
    t.withIdentity({ subject: "archive-operation-owner" }).query(
      (api as any).communityLifecycleOperations
        .getMyCommunityArchiveOperationStatus,
      { communityId: fixture.communityId },
    ),
  ).resolves.toMatchObject({
    lifecycle_status: "active",
    lifecycle_generation: 2,
    operation: null,
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
    beginArchiveForTest(t, {
      actorUserId: overrides.actorUserId ?? fixture.ownerId,
      communityId: overrides.communityId ?? fixture.communityId,
      expectedGeneration: overrides.expectedGeneration ?? 0,
      nowMs: 2_000,
    });

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
    beginArchiveForTest(t, args),
    beginArchiveForTest(t, args),
  ]);
  expect(new Set(results.map((result: any) => result.operation_id)).size).toBe(1);
  expect(results.filter((result: any) => result.idempotent === false)).toHaveLength(1);
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
    beginArchiveForTest(t, {
      actorUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expectedGeneration: 0,
      nowMs: Number.NaN,
    }),
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
      communityLifecycleGeneration: 0,
      userId: fixture.adminId,
      membershipId: fixture.adminMembershipId,
      pricePointId: fixture.pricePointId,
      source: "external_sync",
      status: "active",
      cancelAtPeriodEnd: false,
      lastSourceEventCreatedAt: 1_500,
      createdAt: 1_500,
      updatedAt: 1_500,
    });
  });

  await expect(
    beginArchiveForTest(t, {
      actorUserId: fixture.ownerId,
      communityId: fixture.communityId,
      expectedGeneration: 0,
      nowMs: 2_000,
    }),
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
