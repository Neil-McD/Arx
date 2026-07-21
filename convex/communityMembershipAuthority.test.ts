import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { redeemClaimRow } from "./billingCore";
import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  computeCommunityActiveMemberCount,
  getUniqueCommunityMembershipByPair,
  syncCommunityActiveMemberCount,
} from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);

function membership(
  overrides: Partial<CommunityMembershipLike> = {},
): CommunityMembershipLike {
  return {
    _id: "membership_1",
    communityId: "community_1",
    userId: "user_1",
    role: "member",
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

async function createAuthorityFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  onboardingEnabled = false,
) {
  const nowMs = 1_750_000_000_000;
  const ownerSubject = `membership-authority-owner-${suffix}`;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: ownerSubject,
      displayName: "Membership authority owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: `membership-authority-member-${suffix}`,
      displayName: "Membership authority member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `membership-authority-${suffix}`,
      name: "Membership authority",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    if (onboardingEnabled) {
      await ctx.db.insert("communityOnboardingConfigs", {
        communityId,
        enabled: true,
        updatedByUserId: ownerId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { communityId, ownerId, ownerSubject, userId, nowMs };
  });
}

describe("community membership authority", () => {
  test("only an explicitly active, unrevoked row grants membership", () => {
    const explicitActive = membership();
    const missingActive = membership();
    delete missingActive.active;

    expect(communityMembershipRowIsActive(explicitActive)).toBe(true);
    expect(communityMembershipRowIsActive(missingActive)).toBe(false);
    expect(communityMembershipRowIsActive(membership({ active: false }))).toBe(false);
    expect(communityMembershipRowIsActive(membership({ revokedAt: 0 }))).toBe(false);
    expect(communityMembershipRowIsActive(membership({ revokedAt: 100 }))).toBe(false);
    expect(communityMembershipRowIsActive(null)).toBe(false);
    expect(communityMembershipRowIsActive(undefined)).toBe(false);
  });

  test("schema and projections cannot restore missing-active compatibility", () => {
    const schema = read("schema.ts");
    const communityCore = read("communityCore.ts");
    const communityLifecycle = read("communityLifecycle.ts");
    const operatorDashboard = read("operatorDashboard.ts");
    const projectionFiles = [
      "communityAppMounts.ts",
      "communityRecipientCore.ts",
      "emailDigests.ts",
      "operatorIntelligence.ts",
      "userPlatformAppMounts.ts",
    ];

    expect(schema).toMatch(
      /communityMemberships: defineTable\(\{[\s\S]*?active: v\.boolean\(\)/,
    );
    expect(schema).toMatch(
      /communities: defineTable\(\{[\s\S]*?activeMemberCount: v\.number\(\)/,
    );
    expect(communityCore).toMatch(/activeMemberCount: number;/);
    expect(communityLifecycle).toMatch(
      /ctx\.db\.insert\("communities", \{[\s\S]*?activeMemberCount: 1,/,
    );
    expect(operatorDashboard).not.toContain("backfillCommunityMembershipActiveFlags");
    expect(operatorDashboard).not.toContain("community_membership_active_flags_backfill");
    expect(operatorDashboard).not.toContain("backfillCommunityActiveMemberCounts");
    expect(operatorDashboard).not.toContain("community_active_member_count_backfill");

    for (const relativePath of projectionFiles) {
      const source = read(relativePath);
      expect(source).toContain("communityMembershipRowIsActive");
      expect(source).not.toMatch(/membership\.active\s*!==\s*false/);
      expect(source).not.toMatch(/membership\.active\s*===\s*false/);
      expect(source).not.toMatch(/row\.active\s*!==\s*false/);
    }
  });

  test("active member count is owner plus active non-owner rows and sync repairs drift", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "member-count");

    const memberId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        activationSequence: 1,
        activatedAt: fixture.nowMs,
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: fixture.ownerId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        activationSequence: 1,
        activatedAt: fixture.nowMs,
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      });
      await ctx.db.patch(fixture.communityId, { activeMemberCount: 99 });
      return id;
    });

    expect(
      await t.run(async (ctx) =>
        await computeCommunityActiveMemberCount({
          ctx,
          communityId: fixture.communityId,
        }),
      ),
    ).toBe(2);
    expect(
      await t.run(async (ctx) =>
        await syncCommunityActiveMemberCount({
          ctx,
          communityId: fixture.communityId,
        }),
      ),
    ).toBe(2);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(fixture.communityId))?.activeMemberCount),
    ).toBe(2);

    await t.run(async (ctx) => {
      await ctx.db.patch(memberId, {
        revokedAt: fixture.nowMs + 1,
        revokedReason: "member_count_authority_test",
      });
    });
    expect(
      await t.run(async (ctx) =>
        await syncCommunityActiveMemberCount({
          ctx,
          communityId: fixture.communityId,
        }),
      ),
    ).toBe(1);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(fixture.communityId))?.activeMemberCount),
    ).toBe(1);
  });

  test("pair authority returns zero or one row and fails closed on duplicates", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "unique");

    expect(
      await t.run(async (ctx) =>
        await getUniqueCommunityMembershipByPair({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).toBeNull();

    const firstMembershipId = await t.run(async (ctx) =>
      await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        activationSequence: 1,
        activatedAt: fixture.nowMs,
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      }),
    );
    const resolved = await t.run(async (ctx) =>
      await getUniqueCommunityMembershipByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      }),
    );
    expect(resolved?._id).toEqual(firstMembershipId);

    await t.run(async (ctx) => {
      await ctx.db.insert("communityMemberships", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        role: "member",
        accessSource: "manual_grant",
        active: false,
        activationSequence: 2,
        activatedAt: fixture.nowMs + 1,
        revokedAt: fixture.nowMs + 2,
        createdAt: fixture.nowMs + 1,
        updatedAt: fixture.nowMs + 2,
      });
    });

    await expect(
      t.run(async (ctx) =>
        await getUniqueCommunityMembershipByPair({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).rejects.toThrow("community_membership_pair_not_unique");
  });

  test("canonical activation rejects the community owner without side effects", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "owner-activation", true);

    await expect(
      t.run(async (ctx) =>
        await activateCommunityMembershipCore({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.ownerId,
          accessSource: "free_grant",
          activationReason: "owner_membership_authority_test",
          nowMs: fixture.nowMs + 1,
        }),
      ),
    ).rejects.toThrow("community_owner_membership_forbidden");

    const state = await t.run(async (ctx) => ({
      community: await ctx.db.get(fixture.communityId),
      memberships: await ctx.db.query("communityMemberships").collect(),
      onboardingSessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(state.community?.activeMemberCount).toBe(1);
    expect(state.memberships).toHaveLength(0);
    expect(state.onboardingSessions).toHaveLength(0);
  });

  test("public join treats the owner as already entitled without membership side effects", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "owner-public-join", true);
    const asOwner = t.withIdentity({ subject: fixture.ownerSubject });

    await expect(
      asOwner.mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      }),
    ).resolves.toEqual({
      outcome: "joined",
      community_id: String(fixture.communityId),
    });

    const state = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("communityMemberships").collect(),
      joinRequests: await ctx.db.query("communityJoinRequests").collect(),
      onboardingSessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(state.memberships).toHaveLength(0);
    expect(state.joinRequests).toHaveLength(0);
    expect(state.onboardingSessions).toHaveLength(0);
  });

  test("approving an owner join request records the decision without creating membership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "owner-approval", true);
    const requestId = await t.run(async (ctx) =>
      await ctx.db.insert("communityJoinRequests", {
        communityId: fixture.communityId,
        userId: fixture.ownerId,
        status: "pending",
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      }),
    );
    const asOwner = t.withIdentity({ subject: fixture.ownerSubject });

    await expect(
      asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, { requestId }),
    ).resolves.toEqual({ ok: true });

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      memberships: await ctx.db.query("communityMemberships").collect(),
      onboardingSessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(state.request?.status).toBe("approved");
    expect(state.memberships).toHaveLength(0);
    expect(state.onboardingSessions).toHaveLength(0);
  });

  test("redeeming an owner paid claim preserves the claim without membership or subscription", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "owner-paid-claim", true);
    const seeded = await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, { entryPolicy: "paid_subscription" });
      const pricePointId = await ctx.db.insert("communityPricePoints", {
        communityId: fixture.communityId,
        billingPeriod: "monthly",
        name: "Owner authority test",
        amountBaseUnits: 1_000,
        currency: "usd",
        currencyDecimals: 2,
        isCurrent: true,
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      });
      const claimId = await ctx.db.insert("purchaseClaims", {
        claimToken: "owner-authority-paid-claim",
        communityId: fixture.communityId,
        pricePointId,
        ownerUserId: fixture.ownerId,
        status: "pending",
        expiresAt: fixture.nowMs + 60_000,
        createdAt: fixture.nowMs,
        updatedAt: fixture.nowMs,
      });
      return { claimId };
    });

    const redemption = await t.run(async (ctx) => {
      const claim = await ctx.db.get(seeded.claimId);
      if (!claim) throw new Error("test_claim_missing");
      return await redeemClaimRow({
        ctx,
        claim: claim as any,
        userId: fixture.ownerId,
        nowMs: fixture.nowMs + 1,
      });
    });
    expect(redemption).toEqual({
      communityId: String(fixture.communityId),
      accessGranted: false,
      grantMarker: null,
    });

    const state = await t.run(async (ctx) => ({
      claim: await ctx.db.get(seeded.claimId),
      memberships: await ctx.db.query("communityMemberships").collect(),
      subscriptions: await ctx.db.query("communitySubscriptions").collect(),
      onboardingSessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(state.claim?.status).toBe("redeemed");
    expect(state.claim?.redeemedByUserId).toEqual(fixture.ownerId);
    expect(state.memberships).toHaveLength(0);
    expect(state.subscriptions).toHaveLength(0);
    expect(state.onboardingSessions).toHaveLength(0);
  });

  test("activation is idempotent and reactivation preserves row identity", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "reactivation", true);
    const activate = async (nowMs: number) =>
      await t.run(async (ctx) =>
        await activateCommunityMembershipCore({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
          accessSource: "free_grant",
          activationReason: "membership_authority_test",
          nowMs,
        }),
      );

    const first = await activate(fixture.nowMs + 10);
    const repeated = await activate(fixture.nowMs + 20);
    expect(repeated.membership._id).toEqual(first.membership._id);
    expect(repeated.accessGranted).toBe(false);
    expect(repeated.activationMarker).toBeNull();

    const firstSessions = await t.run(async (ctx) =>
      await ctx.db.query("communityOnboardingSessions").collect(),
    );
    expect(firstSessions).toHaveLength(1);
    expect(firstSessions[0]?.activationSequence).toBe(1);
    expect(firstSessions[0]?.status).toBe("active");

    await t.run(async (ctx) => {
      await ctx.db.patch(first.membership._id as any, {
        active: false,
        revokedAt: fixture.nowMs + 30,
        revokedReason: "membership_authority_test",
        updatedAt: fixture.nowMs + 30,
      });
    });
    const reactivated = await activate(fixture.nowMs + 40);
    expect(reactivated.membership._id).toEqual(first.membership._id);
    expect(reactivated.membership.activationSequence).toBe(2);
    expect(reactivated.accessGranted).toBe(true);

    const reactivationState = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("communityMemberships").collect(),
      sessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(reactivationState.memberships).toHaveLength(1);
    expect(
      reactivationState.sessions
        .slice()
        .sort((a, b) => a.activationSequence - b.activationSequence)
        .map((row) => [row.activationSequence, row.status]),
    ).toEqual([
      [1, "superseded"],
      [2, "active"],
    ]);
  });

  test("overlapping activation attempts converge on one membership and onboarding session", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createAuthorityFixture(t, "overlap", true);
    const runActivation = async () =>
      await t.run(async (ctx) =>
        await activateCommunityMembershipCore({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
          accessSource: "free_grant",
          activationReason: "membership_authority_overlap_test",
          nowMs: fixture.nowMs + 10,
        }),
      );

    const results = await Promise.all([runActivation(), runActivation()]);
    expect(new Set(results.map((result) => String(result.membership._id))).size).toBe(1);
    expect(results.filter((result) => result.accessGranted)).toHaveLength(1);

    const state = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("communityMemberships").collect(),
      sessions: await ctx.db.query("communityOnboardingSessions").collect(),
    }));
    expect(state.memberships).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.activationSequence).toBe(1);
  });

  test("live pair consumers use the canonical helper and duplicate selection is deleted", () => {
    const authorityFiles = [
      "communityAccessQueries.ts",
      "communityAdmin.ts",
      "communityCapabilityContext.ts",
      "communityCommerce.ts",
      "communityMembershipLifecycle.ts",
      "communityMentionEmails.ts",
      "communityPublic.ts",
      "memberOntology.ts",
      "platformHomeCommunity.ts",
    ];
    expect(read("communityCore.ts")).toContain(".unique()");
    for (const relativePath of ["communityCore.ts", ...authorityFiles]) {
      expect(read(relativePath)).not.toContain("pickMostRelevantCommunityMembership");
    }
    for (const relativePath of authorityFiles) {
      expect(read(relativePath)).toContain("getUniqueCommunityMembershipByPair");
    }
  });
});
