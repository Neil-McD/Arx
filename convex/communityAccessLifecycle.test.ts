/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { executePlatformOperation } from "./platformOperationExecutor";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityPublic.ts",
  "./communityActivity.ts",
  "./communityAdmin.ts",
  "./communityAccessQueries.ts",
  "./communityCapabilityContext.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityMemberWorkflows.ts",
  "./memberEntryDestination.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-access-owner";
const MEMBER_SUBJECT = "community-access-member";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Community access owner",
      handle: "community-access-owner",
      normalizedHandle: "community-access-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Community access member",
      handle: "community-access-member",
      normalizedHandle: "community-access-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const [userId, subject] of [
      [ownerId, OWNER_SUBJECT],
      [memberId, MEMBER_SUBJECT],
    ] as const) {
      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName: subject,
        avatarUrl: `https://example.com/${subject}.png`,
        onboardingCompletedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: document.key,
          documentVersion: document.version,
          acceptedAt: nowMs,
          source: "test",
          createdAt: nowMs,
        });
      }
    }
    const insertCommunity = async (
      slug: string,
      entryPolicy: "open" | "approval" | "paid_subscription",
      offset: number,
    ) =>
      await ctx.db.insert("communities", {
        ownerId,
        slug,
        name: `Community ${slug}`,
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy,
        activeMemberCount: 1,
        createdAt: nowMs + offset,
        updatedAt: nowMs + offset,
      });

    const openCommunityId = await insertCommunity("access-lifecycle-open", "open", 1);
    const approvalCommunityId = await insertCommunity(
      "access-lifecycle-approval",
      "approval",
      2,
    );
    const paidCommunityId = await insertCommunity(
      "access-lifecycle-paid",
      "paid_subscription",
      3,
    );
    for (const [index, communityId] of [
      openCommunityId,
      approvalCommunityId,
      paidCommunityId,
    ].entries()) {
      await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: `cus_access_lifecycle_${index}`,
        providerSubscriptionId: `sub_access_lifecycle_${index}`,
        providerPriceId: "price_founder_79_monthly",
        status: "active",
        currentPeriodStartAt: nowMs - 1_000,
        currentPeriodEndAt: nowMs + 10 * 365 * 24 * 60 * 60 * 1_000,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    return {
      ownerId,
      memberId,
      openCommunityId,
      approvalCommunityId,
      paidCommunityId,
    };
  });
}

test("incomplete accounts cannot join or resolve a community destination", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const incompleteSubject = "community-access-incomplete";
  const incompleteUserId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: incompleteSubject,
      displayName: "Incomplete member",
      handle: "community-access-incomplete",
      normalizedHandle: "community-access-incomplete",
      createdAt: 1_750_000_000_000,
      updatedAt: 1_750_000_000_000,
    }),
  );
  const asIncompleteMember = t.withIdentity({ subject: incompleteSubject });

  await expect(
    asIncompleteMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).rejects.toThrow("account_setup_required");
  await expect(
    t.query(
      (internal as any).memberEntryDestination.resolveMemberEntryDestinationInternal,
      {
        userId: incompleteUserId,
        communityId: fixture.openCommunityId,
      },
    ),
  ).rejects.toThrow("account_setup_required");

  const admissionRows = await t.run(async (ctx) => ({
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", fixture.openCommunityId).eq("userId", incompleteUserId),
      )
      .collect(),
    joinRequests: await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", fixture.openCommunityId).eq("userId", incompleteUserId),
      )
      .collect(),
  }));
  expect(admissionRows).toEqual({ memberships: [], joinRequests: [] });
});

function createPlatformOperationTestContext(actor: {
  query: (reference: any, args: any) => Promise<any>;
  action: (reference: any, args: any) => Promise<any>;
}) {
  return {
    runQuery: (reference: any, args: any) => actor.query(reference, args),
    runAction: (reference: any, args: any) => actor.action(reference, args),
  };
}

async function executeSemanticList(args: {
  actor: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  userId: any;
  communityId?: any;
  communitySlug?: string;
}) {
  return await executePlatformOperation({
    operationId: "community.semantic.list",
    ctx: createPlatformOperationTestContext(args.actor),
    authSubject: MEMBER_SUBJECT,
    userId: args.userId,
    ...(args.communityId ? { communityId: args.communityId } : null),
    ...(args.communitySlug ? { communitySlug: args.communitySlug } : null),
    input: { path: "/" },
  });
}

test("open public join is authenticated, immediately authorized, and idempotent", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    t.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).rejects.toThrow("verified_identity_required");

  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toEqual({
    outcome: "joined",
    community_id: String(fixture.openCommunityId),
  });

  const nativeAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communityId: fixture.openCommunityId,
  });
  const mcpAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communitySlug: "access-lifecycle-open",
  });
  expect(nativeAccess).toEqual(mcpAccess);
  expect(nativeAccess).toMatchObject({
    ok: true,
    value: { path: "/" },
  });

  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toMatchObject({ outcome: "joined" });

  const state = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.openCommunityId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.openCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    arrivalEvents: await ctx.db
      .query("communityActivityEvents")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.openCommunityId),
      )
      .collect(),
  }));
  expect(state.community?.activeMemberCount).toBe(2);
  expect(state.memberships).toHaveLength(1);
  expect(state.memberships[0]).toMatchObject({
    userId: fixture.memberId,
    accessSource: "free_grant",
    active: true,
    activationSequence: 1,
  });
  expect(state.arrivalEvents).toEqual([
    expect.objectContaining({
      type: "member_joined",
      actorUserId: fixture.memberId,
      targetType: "membership",
      targetId: String(state.memberships[0]._id),
      dedupeKey: `member_joined:${String(state.memberships[0]._id)}:1`,
    }),
  ]);

  await t.run(async (ctx) => {
    await ctx.db.insert("communityActivityEvents", {
      communityId: fixture.openCommunityId,
      type: "resource_added",
      targetType: "resource",
      targetId: "resource-after-join",
      dedupeKey: "resource_added:resource-after-join",
      createdAt: 1_750_000_100_000,
    });
  });
  const filteredArrivals = await asMember.query(
    api.communityActivity.listCommunityActivityEvents,
    {
      communityId: fixture.openCommunityId,
      type: "member_joined",
      limit: 50,
    },
  );
  expect(filteredArrivals).toEqual([
    expect.objectContaining({
      type: "member_joined",
      actor_user_id: MEMBER_SUBJECT,
    }),
  ]);
});

test("community owner admission is a no-op with no request or membership row", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(asOwner.mutation(api.communityPublic.joinPublicCommunity, {
    communityId: fixture.approvalCommunityId,
  })).resolves.toEqual({
    outcome: "joined",
    community_id: String(fixture.approvalCommunityId),
  });

  const state = await t.run(async (ctx) => ({
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.ownerId),
      )
      .collect(),
    requests: await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.ownerId),
      )
      .collect(),
  }));
  expect(state).toEqual({ memberships: [], requests: [] });
});

test("approval rechecks target blocks and leaves admission state untouched", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(asMember.mutation(api.communityPublic.joinPublicCommunity, {
    communityId: fixture.approvalCommunityId,
  })).resolves.toMatchObject({ outcome: "approval_pending" });
  const requestId = await t.run(async (ctx) => {
    const request = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .unique();
    if (!request) throw new Error("request_missing");
    await ctx.db.insert("communityBlocks", {
      communityId: fixture.approvalCommunityId,
      userId: fixture.memberId,
      createdByUserId: fixture.ownerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return request._id;
  });

  await expect(asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
    requestId,
  })).rejects.toThrow("community_user_blocked");
  const state = await t.run(async (ctx) => ({
    request: await ctx.db.get(requestId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
  }));
  expect(state.request).toMatchObject({ status: "pending" });
  expect(state.memberships).toHaveLength(0);
  await expect(asMember.query(api.communityAccessQueries.getMyCommunityAccessBySlug, {
    communitySlug: "access-lifecycle-approval",
  })).resolves.toMatchObject({
    is_blocked: true,
    relation: null,
    join_request_status: null,
    join_request_reapply_at: null,
  });

  await expect(asOwner.mutation(api.communityAdmin.setCommunityFreeAccessMode, {
    communityId: fixture.approvalCommunityId,
    mode: "open",
  })).resolves.toMatchObject({
    entry_policy: "open",
    approved_pending_request_count: 0,
  });
  const openedState = await t.run(async (ctx) => ({
    request: await ctx.db.get(requestId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
  }));
  expect(openedState).toEqual({ request: null, memberships: [] });
});

test("legacy owner requests cannot be approved or denied", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const requestId = await t.run(async (ctx) =>
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.approvalCommunityId,
      userId: fixture.ownerId,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  await expect(asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
    requestId,
  })).rejects.toThrow("community_owner_join_request_forbidden");
  await expect(asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, {
    requestId,
  })).rejects.toThrow("community_owner_join_request_forbidden");
  expect(await t.run(async (ctx) => ctx.db.get(requestId)))
    .toMatchObject({ status: "pending" });
});

test("legacy terminal status filters are harmless while canonical filters remain usable", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  await t.run(async (ctx) => {
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.approvalCommunityId,
      userId: fixture.memberId,
      status: "approved",
      createdAt: 1_750_000_000_100,
      updatedAt: 1_750_000_000_100,
    });
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.approvalCommunityId,
      userId: fixture.memberId,
      status: "canceled",
      createdAt: 1_750_000_000_200,
      updatedAt: 1_750_000_000_200,
    });
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.approvalCommunityId,
      userId: fixture.ownerId,
      status: "denied",
      deniedAt: 1_750_000_000_300,
      reapplyAt: 1_750_000_000_400,
      createdAt: 1_750_000_000_300,
      updatedAt: 1_750_000_000_300,
    });
  });

  await expect(asOwner.query(api.communityAdmin.listCommunityJoinRequests, {
    communityId: fixture.approvalCommunityId,
    includeStatuses: ["approved", "canceled", "unknown"],
  })).resolves.toEqual([]);
  await expect(asOwner.query(api.communityAdmin.listCommunityJoinRequests, {
    communityId: fixture.approvalCommunityId,
    includeStatuses: ["denied"],
  })).resolves.toEqual([
    expect.objectContaining({ status: "denied" }),
  ]);
});

test("unfunded managed communities remain public while AI funding fails closed", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const nowMs = Date.now();

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.openCommunityId, {
      inferenceFundingPolicy: "managed_required",
    });
    const existingSubscription = await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_community", (q) => q.eq("communityId", fixture.openCommunityId))
      .first();
    if (!existingSubscription) throw new Error("fixture_founder_subscription_missing");
    await ctx.db.patch(existingSubscription._id, {
      status: "canceled",
      currentPeriodEndAt: nowMs - 1,
      endedAt: nowMs,
      revokedReason: "test_unfunded_state",
      updatedAt: nowMs,
    });
    await expect(
      resolveCommunityInferenceFundingAdmission(ctx, fixture.openCommunityId),
    ).resolves.toEqual({ ok: false, code: "founder_subscription_inactive" });
  });

  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    t.query(api.communityPublic.resolvePublicFunnelStatsBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    t.mutation(api.communityPublic.recordPublicFunnelVisitBySlug, {
      communitySlug: "access-lifecycle-open",
      visitorKey: "unfunded-managed-visitor",
    }),
  ).resolves.toEqual({ ok: true });
  const discover = await t.query(
    api.communityPublic.listPublicDiscoverCommunities,
    {},
  );
  expect(discover.communities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: "access-lifecycle-open" }),
    ]),
  );
  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toMatchObject({ outcome: "joined" });
});

test("archived communities are frozen across ordinary access and public projections", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
    communitySlug: "access-lifecycle-open",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.openCommunityId, {
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
    });
    await expect(
      resolveCommunityInferenceFundingAdmission(ctx, fixture.openCommunityId),
    ).resolves.toEqual({ ok: false, code: "community_not_found" });
  });

  for (const actor of [asOwner, asMember]) {
    const rail = await actor.query(api.communityAdmin.listCommunityMemberships, {
      selectMode: "minimal",
    });
    expect(rail).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          community_id: String(fixture.openCommunityId),
        }),
      ]),
    );
    await expect(
      actor.query(api.communityAccessQueries.getMyCommunityAccess, {
        communityId: fixture.openCommunityId,
      }),
    ).rejects.toThrow("community_archived");
  }

  await expect(
    asMember.query(api.communityAccessQueries.getMyCommunityAccessBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toBeNull();
  await expect(
    asMember.query(api.communityPublic.getCommunityPresenceSummary, {
      communityId: fixture.openCommunityId,
    }),
  ).rejects.toThrow("community_archived");
  await expect(
    executeSemanticList({
      actor: asMember,
      userId: fixture.memberId,
      communityId: fixture.openCommunityId,
    }),
  ).resolves.toEqual({
    ok: false,
    code: "semantic_not_found",
    message: "Semantic path not found or not accessible.",
  });

  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toEqual({ ok: false });
  await expect(
    t.query(api.communityPublic.resolvePublicFunnelStatsBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toEqual({ ok: false });
  await expect(
    t.query(
      api.communityIntelligenceDirectory.resolvePublicCommunityMemoryOverviewBySlug,
      { communitySlug: "access-lifecycle-open" },
    ),
  ).resolves.toEqual({ ok: false });
  await expect(
    t.mutation(api.communityPublic.recordPublicFunnelVisitBySlug, {
      communitySlug: "access-lifecycle-open",
      visitorKey: "archived-community-visitor",
    }),
  ).resolves.toEqual({ ok: false });

  const discover = await t.query(
    api.communityPublic.listPublicDiscoverCommunities,
    {},
  );
  expect(discover.communities).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: "access-lifecycle-open" }),
    ]),
  );
  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).rejects.toThrow("community_archived");
  await expect(
    asMember.mutation(api.communityPublic.cancelMyJoinRequestBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).rejects.toThrow("community_archived");
});

test("approval join fails closed until manager approval and closes again after revocation", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-approval",
    }),
  ).resolves.toEqual({
    outcome: "approval_pending",
    community_id: String(fixture.approvalCommunityId),
  });

  const pendingState = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.approvalCommunityId),
    requests: await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    arrivalEvents: await ctx.db
      .query("communityActivityEvents")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.approvalCommunityId),
      )
      .collect(),
  }));
  expect(pendingState.community?.activeMemberCount).toBe(1);
  expect(pendingState.memberships).toHaveLength(0);
  expect(pendingState.requests).toHaveLength(1);
  expect(pendingState.requests[0].status).toBe("pending");
  expect(pendingState.arrivalEvents).toHaveLength(0);
  const requestId = pendingState.requests[0]._id;
  await expect(
    asOwner.query(api.communityAdmin.listCommunityJoinRequests, {
      communityId: fixture.approvalCommunityId,
      includeStatuses: ["pending"],
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      id: String(requestId),
      community_id: String(fixture.approvalCommunityId),
      status: "pending",
    }),
  ]);

  const pendingNativeAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communityId: fixture.approvalCommunityId,
  });
  const pendingMcpAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communitySlug: "access-lifecycle-approval",
  });
  expect(pendingNativeAccess).toEqual(pendingMcpAccess);
  expect(pendingNativeAccess).toMatchObject({
    ok: false,
    code: "community_access_closed",
  });

  await expect(
    asMember.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      requestId,
    }),
  ).rejects.toThrow("community_forbidden");

  await expect(
    asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      requestId,
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    asMember.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      requestId,
    }),
  ).rejects.toThrow("join_request_not_found");
  await expect(
    asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
      requestId,
    }),
  ).resolves.toEqual({ ok: true });
  await expect(
    asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, {
      requestId,
    }),
  ).rejects.toThrow("join_request_not_found");

  const approvedState = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.approvalCommunityId),
    request: await ctx.db.get(requestId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    arrivalEvents: await ctx.db
      .query("communityActivityEvents")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.approvalCommunityId),
      )
      .collect(),
  }));
  expect(approvedState.community?.activeMemberCount).toBe(2);
  expect(approvedState.request).toBeNull();
  expect(approvedState.memberships).toHaveLength(1);
  expect(approvedState.memberships[0]).toMatchObject({
    active: true,
    activationSequence: 1,
  });
  expect(approvedState.arrivalEvents).toEqual([
    expect.objectContaining({
      type: "member_joined",
      actorUserId: fixture.memberId,
      targetType: "membership",
      targetId: String(approvedState.memberships[0]._id),
    }),
  ]);
  const membershipId = approvedState.memberships[0]._id;

  const approvedNativeAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communityId: fixture.approvalCommunityId,
  });
  const approvedMcpAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communitySlug: "access-lifecycle-approval",
  });
  expect(approvedNativeAccess).toEqual(approvedMcpAccess);
  expect(approvedNativeAccess).toMatchObject({ ok: true });

  await expect(
    asOwner.action(api.communityAdmin.removeCommunityMember, {
      communityId: fixture.approvalCommunityId,
      targetMembershipId: membershipId,
    }),
  ).resolves.toEqual({ ok: true, stripe_canceled_count: 0 });
  await expect(
    asOwner.action(api.communityAdmin.removeCommunityMember, {
      communityId: fixture.approvalCommunityId,
      targetMembershipId: membershipId,
    }),
  ).resolves.toEqual({ ok: true, stripe_canceled_count: 0 });

  const revokedState = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.approvalCommunityId),
    requests: await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    membership: await ctx.db.get(membershipId),
  }));
  expect(revokedState.community?.activeMemberCount).toBe(1);
  expect(revokedState.membership).toMatchObject({
    active: false,
    activationSequence: 1,
    revokedReason: "removed_by_manager",
  });
  expect(revokedState.requests).toHaveLength(1);
  expect(revokedState.requests[0]?.status).toBe("denied");
  expect(revokedState.requests[0]?.reapplyAt).toBeGreaterThan(
    revokedState.requests[0]?.deniedAt ?? 0,
  );

  const revokedNativeAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communityId: fixture.approvalCommunityId,
  });
  const revokedMcpAccess = await executeSemanticList({
    actor: asMember,
    userId: fixture.memberId,
    communitySlug: "access-lifecycle-approval",
  });
  expect(revokedNativeAccess).toEqual(revokedMcpAccess);
  expect(revokedNativeAccess).toMatchObject({
    ok: false,
    code: "community_access_closed",
  });

  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-approval",
    }),
  ).resolves.toMatchObject({
    outcome: "approval_denied",
    community_id: String(fixture.approvalCommunityId),
  });
});

test("denied join-request decisions are idempotent and cannot later grant access", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
    communitySlug: "access-lifecycle-approval",
  });
  const requestId = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect();
    return rows[0]._id;
  });

  await expect(
    asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, { requestId }),
  ).resolves.toEqual({ ok: true });
  await expect(
    asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, { requestId }),
  ).resolves.toEqual({ ok: true });
  await expect(
    asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, { requestId }),
  ).rejects.toThrow("join_request_already_decided");

  const terminalState = await t.run(async (ctx) => ({
    request: await ctx.db.get(requestId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.approvalCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
  }));
  expect(terminalState.request?.status).toBe("denied");
  expect(terminalState.memberships).toHaveLength(0);
});

test("paid public join never materializes access without an entitlement", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-paid",
    }),
  ).resolves.toEqual({
    outcome: "paid_plan_required",
    community_id: String(fixture.paidCommunityId),
  });

  const state = await t.run(async (ctx) => ({
    community: await ctx.db.get(fixture.paidCommunityId),
    memberships: await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", fixture.paidCommunityId)
          .eq("userId", fixture.memberId),
      )
      .collect(),
    arrivalEvents: await ctx.db
      .query("communityActivityEvents")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.paidCommunityId),
      )
      .collect(),
  }));
  expect(state.community?.activeMemberCount).toBe(1);
  expect(state.memberships).toHaveLength(0);
  expect(state.arrivalEvents).toHaveLength(0);
});
