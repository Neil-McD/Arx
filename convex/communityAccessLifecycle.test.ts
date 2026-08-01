/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { executePlatformOperation } from "./platformOperationExecutor";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityPublic.ts",
  "./communityAdmin.ts",
  "./communityCapabilityContext.ts",
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
        entryPolicy,
        activeMemberCount: 1,
        createdAt: nowMs + offset,
        updatedAt: nowMs + offset,
      });

    return {
      ownerId,
      memberId,
      openCommunityId: await insertCommunity(
        "access-lifecycle-open",
        "open",
        1,
      ),
      approvalCommunityId: await insertCommunity(
        "access-lifecycle-approval",
        "approval",
        2,
      ),
      paidCommunityId: await insertCommunity(
        "access-lifecycle-paid",
        "paid_subscription",
        3,
      ),
    };
  });
}

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
  }));
  expect(state.community?.activeMemberCount).toBe(2);
  expect(state.memberships).toHaveLength(1);
  expect(state.memberships[0]).toMatchObject({
    userId: fixture.memberId,
    accessSource: "free_grant",
    active: true,
    activationSequence: 1,
  });
});

test("unfunded managed communities are absent from public acquisition surfaces", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const nowMs = Date.now();

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.openCommunityId, {
      inferenceFundingPolicy: "managed_required",
    });
    await ctx.db.insert("founderInferenceGrants", {
      userId: fixture.memberId,
      cohortKey: "existing_founder_cutover_v1",
      status: "approved",
      approvedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toEqual({ ok: false });
  await expect(
    asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).rejects.toThrow("community_not_available");
  const discoverBefore = await t.query(
    api.communityPublic.listPublicDiscoverCommunities,
    {},
  );
  expect(discoverBefore.communities).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: "access-lifecycle-open" }),
    ]),
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: fixture.ownerId,
      communityId: fixture.openCommunityId,
      provider: "stripe",
      providerCustomerId: "cus_public_gate",
      providerSubscriptionId: "sub_public_gate",
      providerPriceId: "price_public_gate",
      status: "active",
      currentPeriodStartAt: nowMs - 1_000,
      currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(
    t.query(api.communityPublic.resolvePublicFunnelBySlug, {
      communitySlug: "access-lifecycle-open",
    }),
  ).resolves.toMatchObject({ ok: true });
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
  }));
  expect(pendingState.community?.activeMemberCount).toBe(1);
  expect(pendingState.memberships).toHaveLength(0);
  expect(pendingState.requests).toHaveLength(1);
  expect(pendingState.requests[0].status).toBe("pending");
  const requestId = pendingState.requests[0]._id;

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
  }));
  expect(approvedState.community?.activeMemberCount).toBe(2);
  expect(approvedState.request?.status).toBe("approved");
  expect(approvedState.memberships).toHaveLength(1);
  expect(approvedState.memberships[0]).toMatchObject({
    active: true,
    activationSequence: 1,
  });
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
    request: await ctx.db.get(requestId),
    membership: await ctx.db.get(membershipId),
  }));
  expect(revokedState.community?.activeMemberCount).toBe(1);
  expect(revokedState.membership).toMatchObject({
    active: false,
    activationSequence: 1,
    revokedReason: "removed_by_manager",
  });
  expect(revokedState.request?.status).toBe("denied");
  expect(revokedState.request?.reapplyAt).toBeGreaterThan(
    revokedState.request?.deniedAt ?? 0,
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
  }));
  expect(state.community?.activeMemberCount).toBe(1);
  expect(state.memberships).toHaveLength(0);
});
