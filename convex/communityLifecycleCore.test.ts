/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import {
  assertCommunityMayBeArchived,
  communityAcceptsNewOperationsAtGeneration,
  requireActiveCommunity,
  requireCommunityOwnerAnyLifecycle,
  requireMatchingCommunityLifecycleGeneration,
  requireOperationalCommunity,
} from "./communityLifecycleCore";
import {
  requireCommunityChatAccess,
  requireCommunityManager,
  requireCommunityModerator,
  requireCommunityOwner,
  resolveCommunityAccessBundle,
  resolveCommunityMembershipEntitlementState,
} from "./communityCore";
import {
  communityAcceptsNewOperations,
  communityIsOperational,
  normalizeCommunityLifecycleGeneration,
  normalizeCommunityLifecycleStatus,
} from "../shared/communityLifecycle";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob([
  "./communityCore.ts",
  "./communityLifecycleCore.ts",
  "./communityLifecycleMigration.ts",
  "./_generated/**/*.*s",
]);

test("new-operation epoch admission fails closed for missing or malformed lifecycle state", () => {
  expect(communityAcceptsNewOperationsAtGeneration({
    community: { lifecycleStatus: "active", lifecycleGeneration: 3 },
    expectedGeneration: 3,
  })).toBe(true);
  for (const community of [
    null,
    { lifecycleStatus: "archiving", lifecycleGeneration: 3 },
    { lifecycleStatus: "active", lifecycleGeneration: 4 },
    { lifecycleStatus: "invalid", lifecycleGeneration: 3 },
    { lifecycleStatus: "active", lifecycleGeneration: -1 },
  ]) {
    expect(communityAcceptsNewOperationsAtGeneration({
      community: community as any,
      expectedGeneration: 3,
    })).toBe(false);
  }
});

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "lifecycle-owner",
      displayName: "Lifecycle owner",
      handle: "lifecycle-owner",
      normalizedHandle: "lifecycle-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "lifecycle-member",
      displayName: "Lifecycle member",
      handle: "lifecycle-member",
      normalizedHandle: "lifecycle-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const base = {
      ownerId,
      name: "Lifecycle fixture",
      visibility: "unlisted" as const,
      inferenceFundingPolicy: "managed_required" as const,
      entryPolicy: "open" as const,
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    const legacyActiveId = await ctx.db.insert("communities", {
      ...base,
      slug: "lifecycle-legacy-active",
    });
    const archivingId = await ctx.db.insert("communities", {
      ...base,
      slug: "lifecycle-archiving",
      lifecycleStatus: "archiving",
      lifecycleGeneration: 1,
    });
    const archivedId = await ctx.db.insert("communities", {
      ...base,
      slug: "lifecycle-archived",
      lifecycleStatus: "archived",
      lifecycleGeneration: 2,
      archivedAt: 2_000,
      archiveRequestedByUserId: ownerId,
    });
    for (const communityId of [legacyActiveId, archivingId, archivedId]) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: memberId,
        role: "admin",
        accessSource: "free_grant",
        active: true,
        activationSequence: 1,
        activatedAt: 1_000,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
    }
    return { ownerId, memberId, legacyActiveId, archivingId, archivedId };
  });
}

test("legacy lifecycle fields normalize without changing active behavior", () => {
  expect(normalizeCommunityLifecycleStatus(undefined)).toBe("active");
  expect(normalizeCommunityLifecycleGeneration(undefined)).toBe(0);
  expect(() => normalizeCommunityLifecycleStatus("archvied")).toThrow(
    "community_lifecycle_status_invalid",
  );
  expect(() => normalizeCommunityLifecycleGeneration(-1)).toThrow(
    "community_lifecycle_generation_invalid",
  );
  for (const malformed of [null, "0", 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => normalizeCommunityLifecycleGeneration(malformed)).toThrow(
      "community_lifecycle_generation_invalid",
    );
  }
  expect(communityIsOperational(null)).toBe(false);
  expect(communityIsOperational(undefined)).toBe(false);
  expect(communityAcceptsNewOperations(null)).toBe(false);
  expect(() => requireOperationalCommunity({})).not.toThrow();
  expect(() => requireActiveCommunity({})).not.toThrow();
});

test("lifecycle generation matching treats legacy absence as generation zero, never a wildcard", () => {
  expect(
    requireMatchingCommunityLifecycleGeneration({
      community: {},
      expectedGeneration: undefined,
      errorCode: "community_checkout_lifecycle_stale",
    }),
  ).toBe(0);
  expect(() =>
    requireMatchingCommunityLifecycleGeneration({
      community: { lifecycleGeneration: 1 },
      expectedGeneration: undefined,
      errorCode: "community_checkout_lifecycle_stale",
    }),
  ).toThrow("community_checkout_lifecycle_stale");
  expect(() =>
    requireMatchingCommunityLifecycleGeneration({
      community: { lifecycleGeneration: 1 },
      expectedGeneration: "1",
      errorCode: "community_checkout_lifecycle_stale",
    }),
  ).toThrow("community_lifecycle_generation_invalid");
});

test("archiving immediately rejects normal operations and newly initiated work", () => {
  const community = { lifecycleStatus: "archiving" } as const;
  expect(() => requireOperationalCommunity(community)).toThrow(
    "community_archiving",
  );
  expect(() => requireActiveCommunity(community)).toThrow(
    "community_archiving",
  );
});

test("archived communities reject operational and active access", () => {
  const community = { lifecycleStatus: "archived" } as const;
  expect(() => requireOperationalCommunity(community)).toThrow(
    "community_archived",
  );
  expect(() => requireActiveCommunity(community)).toThrow("community_archived");
});

test("the platform-home community is protected from lifecycle transitions", () => {
  expect(() => assertCommunityMayBeArchived({ slug: " POLYNET " })).toThrow(
    "community_lifecycle_protected",
  );
  expect(() => assertCommunityMayBeArchived({ slug: "other" })).not.toThrow();
});

test("archived status overrides owner and administrator authority", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  await t.run(async (ctx) => {
    const archived = await ctx.db.get(fixture.archivedId);
    const archivedMember = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", fixture.archivedId).eq("userId", fixture.memberId),
      )
      .unique();
    expect(archived).not.toBeNull();

    await expect(
      resolveCommunityMembershipEntitlementState({
        ctx,
        community: archived!,
        membership: null,
        userId: fixture.ownerId,
      }),
    ).resolves.toMatchObject({ isEntitled: false });

    const ownerAccess = await resolveCommunityAccessBundle({
      ctx,
      community: archived!,
      membership: null,
      userId: fixture.ownerId,
    });
    expect(ownerAccess).toMatchObject({
      lifecycle_status: "archived",
      lifecycle_generation: 2,
      relation: "owner",
      is_owner: true,
      is_entitled: false,
      primary_cta: null,
      can_enter_community: false,
      can_post_message: false,
      can_manage_members: false,
      can_manage_resources: false,
      can_manage_branding: false,
    });

    const adminAccess = await resolveCommunityAccessBundle({
      ctx,
      community: archived!,
      membership: archivedMember,
      userId: fixture.memberId,
    });
    expect(adminAccess).toMatchObject({
      lifecycle_status: "archived",
      is_entitled: false,
      can_enter_community: false,
      can_manage_members: false,
    });

    await expect(
      requireCommunityChatAccess({
        ctx,
        communityId: fixture.archivedId,
        userId: fixture.ownerId,
      }),
    ).rejects.toThrow("community_archived");
    await expect(
      requireCommunityManager({
        ctx,
        communityId: fixture.archivedId,
        userId: fixture.memberId,
      }),
    ).rejects.toThrow("community_archived");
    await expect(
      requireCommunityModerator({
        ctx,
        communityId: fixture.archivedId,
        userId: fixture.memberId,
      }),
    ).rejects.toThrow("community_archived");
    await expect(
      requireCommunityOwner({
        ctx,
        communityId: fixture.archivedId,
        userId: fixture.ownerId,
      }),
    ).rejects.toThrow("community_archived");
    await expect(
      requireCommunityOwnerAnyLifecycle({
        ctx,
        communityId: fixture.archivedId,
        userId: fixture.ownerId,
      }),
    ).resolves.toMatchObject({ community: { _id: fixture.archivedId } });
  });
});

test("legacy active communities remain accessible while archiving is contained", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  await t.run(async (ctx) => {
    await expect(
      requireCommunityChatAccess({
        ctx,
        communityId: fixture.legacyActiveId,
        userId: fixture.ownerId,
      }),
    ).resolves.toMatchObject({ community: { _id: fixture.legacyActiveId } });
    await expect(
      requireCommunityChatAccess({
        ctx,
        communityId: fixture.archivingId,
        userId: fixture.memberId,
      }),
    ).rejects.toThrow("community_archiving");
  });
});

test("the membership activation kernel permits existing access but blocks new inactive-community access", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);

  await t.run(async (ctx) => {
    await expect(
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.archivingId,
        userId: fixture.memberId,
        accessSource: "free_grant",
        activationReason: "existing_member_refresh",
        nowMs: 3_000,
      }),
    ).resolves.toMatchObject({ accessGranted: false });

    const newMemberId = await ctx.db.insert("users", {
      authSubject: "lifecycle-new-member",
      displayName: "Lifecycle new member",
      handle: "lifecycle-new-member",
      normalizedHandle: "lifecycle-new-member",
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    await expect(
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.archivingId,
        userId: newMemberId,
        accessSource: "free_grant",
        activationReason: "new_archiving_member",
        nowMs: 3_000,
      }),
    ).rejects.toThrow("community_archiving");
    await expect(
      activateCommunityMembershipCore({
        ctx,
        communityId: fixture.archivedId,
        userId: newMemberId,
        accessSource: "manual_grant",
        activationReason: "new_archived_member",
        nowMs: 3_000,
      }),
    ).rejects.toThrow("community_archived");
  });
});

test("the bounded migration is idempotent and does not reorder communities", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const paginationOpts = { cursor: null, numItems: 100 };

  const before = await t.query(
    internal.communityLifecycleMigration.auditCommunityLifecyclePageInternal,
    { paginationOpts },
  );
  expect(before).toMatchObject({
    scanned: 3,
    counts: {
      active: 1,
      archiving: 1,
      archived: 1,
      missingStatus: 1,
      missingGeneration: 1,
      invalidGeneration: 0,
      inconsistent: 0,
    },
    isDone: true,
  });

  const first = await t.mutation(
    internal.communityLifecycleMigration.backfillCommunityLifecyclePageInternal,
    { paginationOpts },
  );
  expect(first).toMatchObject({
    scanned: 3,
    patched: 1,
    alreadyCanonical: 2,
    blocked: 0,
    isDone: true,
  });
  await t.run(async (ctx) => {
    const legacy = await ctx.db.get(fixture.legacyActiveId);
    expect(legacy).toMatchObject({
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      updatedAt: 1_000,
    });
  });

  const replay = await t.mutation(
    internal.communityLifecycleMigration.backfillCommunityLifecyclePageInternal,
    { paginationOpts },
  );
  expect(replay).toMatchObject({
    scanned: 3,
    patched: 0,
    alreadyCanonical: 3,
    blocked: 0,
    isDone: true,
  });
});

test("the migration reports suspicious lifecycle evidence instead of rewriting it", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const base = {
      ownerId: fixture.ownerId,
      name: "Suspicious lifecycle fixture",
      visibility: "unlisted" as const,
      inferenceFundingPolicy: "managed_required" as const,
      entryPolicy: "open" as const,
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    await ctx.db.insert("communities", {
      ...base,
      slug: "lifecycle-invalid-generation",
      lifecycleStatus: "active",
      lifecycleGeneration: -1,
    });
    await ctx.db.insert("communities", {
      ...base,
      slug: "lifecycle-inconsistent-evidence",
      archivedAt: 2_000,
    });
  });

  const paginationOpts = { cursor: null, numItems: 100 };
  const audit = await t.query(
    internal.communityLifecycleMigration.auditCommunityLifecyclePageInternal,
    { paginationOpts },
  );
  expect(audit).toMatchObject({
    scanned: 5,
    counts: {
      missingStatus: 2,
      missingGeneration: 2,
      invalidGeneration: 1,
      inconsistent: 1,
    },
  });
  const backfill = await t.mutation(
    internal.communityLifecycleMigration.backfillCommunityLifecyclePageInternal,
    { paginationOpts },
  );
  expect(backfill).toMatchObject({
    scanned: 5,
    patched: 1,
    alreadyCanonical: 2,
    blocked: 2,
  });
});
